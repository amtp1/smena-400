import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';
import { SHIFT_ORDER, scenarioById } from './data';
import {
  applyDelta,
  emptyCompetencies,
  getNode,
  runScore,
} from './engine';
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
};

type Action =
  | { type: 'START_SHIFT' }
  | { type: 'START_TRAINING'; scenarioId: string }
  | { type: 'CHOOSE'; choiceId: string; remainingSec: number }
  | { type: 'TIMEOUT' }
  | { type: 'ACK_ENDING' }
  | { type: 'CONTINUE_SHIFT' }
  | { type: 'RESET' };

const INITIAL: GameState = {
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
};

function freshMeters(): Pick<
  GameState,
  'loyalty' | 'safety' | 'competencies' | 'flags' | 'history' | 'results' | 'clockMin' | 'runId'
> {
  return {
    loyalty: 70,
    safety: 70,
    competencies: emptyCompetencies(50),
    flags: [],
    history: [],
    results: [],
    clockMin: 14 * 60 + 10,
    runId: '',
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

function closeScenario(state: GameState): GameState {
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
    runId: more ? state.runId : `run-${Date.now()}`,
  };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'RESET':
      return INITIAL;
    case 'START_SHIFT':
      return {
        ...INITIAL,
        ...freshMeters(),
        phase: 'playing',
        mode: 'shift',
        queue: [...SHIFT_ORDER],
        queueIndex: 0,
        nodeId: scenarioById(SHIFT_ORDER[0]).startId,
      };
    case 'START_TRAINING': {
      const scenario = scenarioById(action.scenarioId);
      return {
        ...INITIAL,
        ...freshMeters(),
        phase: 'playing',
        mode: 'training',
        queue: [scenario.id],
        queueIndex: 0,
        nodeId: scenario.startId,
      };
    }
    case 'CHOOSE': {
      if (state.phase !== 'playing') return state;
      const scenario = scenarioOf(state);
      const node = getNode(scenario, state.nodeId);
      const choice = node?.choices?.find((item) => item.id === action.choiceId);
      if (!node || !choice) return state;

      const applied = applyDelta(
        state.loyalty,
        state.safety,
        state.competencies,
        withFastFlag(state, action.remainingSec, Boolean(node.timerSec)),
        choice.effects,
      );

      return {
        ...state,
        ...applied,
        nodeId: choice.next,
        clockMin: state.clockMin + 2,
        history: [
          ...state.history,
          {
            scenarioId: scenario.id,
            nodeId: node.id,
            choiceId: choice.id,
            remainingSec: action.remainingSec,
          },
        ],
      };
    }
    case 'TIMEOUT': {
      if (state.phase !== 'playing') return state;
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

      return {
        ...state,
        ...applied,
        nodeId: node.timeoutNext,
        clockMin: state.clockMin + 1,
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
    case 'ACK_ENDING':
      return closeScenario(state);
    case 'CONTINUE_SHIFT': {
      if (state.phase !== 'between') return state;
      const nextIndex = state.queueIndex + 1;
      const next = scenarioById(state.queue[nextIndex]);
      return {
        ...state,
        phase: 'playing',
        queueIndex: nextIndex,
        nodeId: next.startId,
        clockMin: state.clockMin + 6,
      };
    }
    default:
      return state;
  }
}

type GameContextValue = {
  state: GameState;
  startShift: () => void;
  startTraining: (scenarioId: string) => void;
  choose: (choiceId: string, remainingSec: number) => void;
  timeout: () => void;
  ackEnding: () => void;
  continueShift: () => void;
  reset: () => void;
  score: number;
};

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const score = useMemo(() => {
    const timeoutCount = state.history.filter((h) => h.choiceId === 'timeout').length;
    const fastDecisions = state.history.filter((h) => h.remainingSec >= 10).length;
    return runScore({
      loyalty: state.loyalty,
      safety: state.safety,
      competencies: state.competencies,
      grades: state.results.map((r) => r.grade),
      timeoutCount,
      fastDecisions,
    });
  }, [state]);

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      startShift: () => dispatch({ type: 'START_SHIFT' }),
      startTraining: (scenarioId) => dispatch({ type: 'START_TRAINING', scenarioId }),
      choose: (choiceId, remainingSec) => dispatch({ type: 'CHOOSE', choiceId, remainingSec }),
      timeout: () => dispatch({ type: 'TIMEOUT' }),
      ackEnding: () => dispatch({ type: 'ACK_ENDING' }),
      continueShift: () => dispatch({ type: 'CONTINUE_SHIFT' }),
      reset: () => dispatch({ type: 'RESET' }),
      score,
    }),
    [state, score],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame outside provider');
  return ctx;
}

export function formatClock(clockMin: number) {
  const h = Math.floor(clockMin / 60) % 24;
  const m = clockMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
