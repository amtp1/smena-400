import { SHIFT_ORDER, scenarioById } from './data';
import { applyDelta, emptyCompetencies, getNode } from './engine';
import type {
  CompetencyId,
  HistoryEntry,
  ScenarioResult,
} from './types';

export type GamePhase = 'idle' | 'playing' | 'between' | 'debrief';

export type GameState = {
  phase: GamePhase;
  mode: 'shift' | 'training';
  queue: string[];
  queueIndex: number;
  nodeId: string;
  loyalty: number;
  safety: number;
  competencies: Record<CompetencyId, number>;
  flags: string[];
  history: HistoryEntry[];
  results: ScenarioResult[];
  clockMin: number;
  runId: string;
  engaged: boolean;
  deadlineAt: number | null;
};

export type RadioCall = {
  text: string;
  car: number;
  threat: string;
};

export type Objective = {
  car: number;
  location: string;
  scenarioId: string;
  nodeId: string;
};

export const INITIAL_STATE: GameState = {
  phase: 'idle',
  mode: 'shift',
  queue: [],
  queueIndex: 0,
  nodeId: '',
  loyalty: 70,
  safety: 70,
  competencies: emptyCompetencies(50),
  flags: [],
  history: [],
  results: [],
  clockMin: 14 * 60 + 10,
  runId: '',
  engaged: false,
  deadlineAt: null,
};

export function newRunId() {
  const tail = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `run-${Date.now()}${tail}`;
}

function freshMeters(): Pick<
  GameState,
  'loyalty' | 'safety' | 'competencies' | 'flags' | 'history' | 'results' | 'clockMin'
> {
  return {
    loyalty: 70,
    safety: 70,
    competencies: emptyCompetencies(50),
    flags: [],
    history: [],
    results: [],
    clockMin: 14 * 60 + 10,
  };
}

function scenarioOf(state: GameState) {
  return scenarioById(state.queue[state.queueIndex]);
}

function withFastFlag(state: GameState, remainingSec: number, hadTimer: boolean) {
  if (hadTimer && remainingSec >= 10 && !state.flags.includes('fast_decision')) {
    return [...state.flags, 'fast_decision'];
  }
  return state.flags;
}

function remainingOf(state: GameState) {
  if (!state.deadlineAt) return 0;
  return Math.max(0, (state.deadlineAt - Date.now()) / 1000);
}

function deadlineFor(timerSec?: number) {
  return timerSec ? Date.now() + timerSec * 1000 : null;
}

export function startShift(runId = newRunId()): GameState {
  return {
    ...INITIAL_STATE,
    ...freshMeters(),
    phase: 'playing',
    mode: 'shift',
    queue: [...SHIFT_ORDER],
    queueIndex: 0,
    nodeId: scenarioById(SHIFT_ORDER[0]).startId,
    runId,
    engaged: false,
    deadlineAt: null,
  };
}

export function startTraining(scenarioId: string, runId = newRunId()): GameState {
  const scenario = scenarioById(scenarioId);
  return {
    ...INITIAL_STATE,
    ...freshMeters(),
    phase: 'playing',
    mode: 'training',
    queue: [scenario.id],
    queueIndex: 0,
    nodeId: scenario.startId,
    runId,
    engaged: false,
    deadlineAt: null,
  };
}

export function arrive(state: GameState, car: number): GameState {
  if (state.phase !== 'playing' || state.engaged) return state;
  const scenario = scenarioOf(state);
  const node = getNode(scenario, state.nodeId);
  if (!node || node.kind !== 'beat' || node.car !== car) return state;
  return {
    ...state,
    engaged: true,
    deadlineAt: deadlineFor(node.timerSec),
  };
}

export function choose(state: GameState, choiceId: string, remainingSec?: number): GameState {
  if (state.phase !== 'playing' || !state.engaged) return state;
  const scenario = scenarioOf(state);
  const node = getNode(scenario, state.nodeId);
  const choice = node?.choices?.find((item) => item.id === choiceId);
  if (!node || !choice) return state;

  const left = remainingSec ?? remainingOf(state);
  const applied = applyDelta(
    state.loyalty,
    state.safety,
    state.competencies,
    withFastFlag(state, left, Boolean(node.timerSec)),
    choice.effects,
  );
  const next = getNode(scenario, choice.next);

  return {
    ...state,
    ...applied,
    nodeId: choice.next,
    clockMin: state.clockMin + 2,
    engaged: true,
    deadlineAt: next?.kind === 'beat' ? deadlineFor(next.timerSec) : null,
    history: [
      ...state.history,
      {
        scenarioId: scenario.id,
        nodeId: node.id,
        choiceId: choice.id,
        remainingSec: left,
      },
    ],
  };
}

export function timeout(state: GameState): GameState {
  if (state.phase !== 'playing' || !state.engaged) return state;
  const scenario = scenarioOf(state);
  const node = getNode(scenario, state.nodeId);
  if (!node?.timeoutNext) return state;

  const applied = applyDelta(
    state.loyalty,
    state.safety,
    state.competencies,
    state.flags.includes('timeout') ? state.flags : [...state.flags, 'timeout'],
    node.timeoutEffects,
  );
  const next = getNode(scenario, node.timeoutNext);

  return {
    ...state,
    ...applied,
    nodeId: node.timeoutNext,
    clockMin: state.clockMin + 1,
    engaged: true,
    deadlineAt: next?.kind === 'beat' ? deadlineFor(next.timerSec) : null,
    history: [
      ...state.history,
      {
        scenarioId: scenario.id,
        nodeId: node.id,
        choiceId: 'timeout',
        remainingSec: 0,
      },
    ],
  };
}

export function ackEnding(state: GameState): GameState {
  const scenario = scenarioOf(state);
  const node = getNode(scenario, state.nodeId);
  const ending = node?.ending;
  if (!ending) return state;

  const result: ScenarioResult = {
    scenarioId: scenario.id,
    grade: ending.grade,
    title: ending.title,
    summary: ending.summary,
    loyalty: state.loyalty,
    safety: state.safety,
  };

  const results = [...state.results, result];
  const more = state.queueIndex < state.queue.length - 1;

  return {
    ...state,
    results,
    phase: more ? 'between' : 'debrief',
    engaged: false,
    deadlineAt: null,
  };
}

export function continueShift(state: GameState): GameState {
  if (state.phase !== 'between') return state;
  const nextIndex = state.queueIndex + 1;
  const next = scenarioById(state.queue[nextIndex]);
  return {
    ...state,
    phase: 'playing',
    queueIndex: nextIndex,
    nodeId: next.startId,
    clockMin: state.clockMin + 6,
    engaged: false,
    deadlineAt: null,
  };
}

export function radioFor(state: GameState): RadioCall | null {
  if (state.phase !== 'playing' && state.phase !== 'between') return null;
  const index = state.phase === 'between' ? state.queueIndex + 1 : state.queueIndex;
  const id = state.queue[index];
  if (!id) return null;
  const scenario = scenarioById(id);
  const start = getNode(scenario, scenario.startId);
  const place = start?.location ?? `вагон ${start?.car ?? '?'}`;
  return {
    text: `${scenario.title}. ${scenario.threat}. Идите к точке: ${place}.`,
    car: start?.car ?? 1,
    threat: scenario.threat,
  };
}

export function objectiveFor(state: GameState): Objective | null {
  if (state.phase !== 'playing' && state.phase !== 'between') return null;
  const index = state.phase === 'between' ? state.queueIndex + 1 : state.queueIndex;
  const id = state.queue[index];
  if (!id) return null;
  const scenario = scenarioById(id);
  const start = getNode(scenario, scenario.startId);
  if (!start) return null;
  return {
    car: start.car,
    location: start.location,
    scenarioId: scenario.id,
    nodeId: start.id,
  };
}

