import { SHIFT_ORDER, scenarioById } from './data';
import { applyDelta, describeDelta, emptyCompetencies, getNode, runScore } from './engine';
import type {
  CompetencyId,
  EndingGrade,
  HistoryEntry,
  MeterDelta,
  Scenario,
  ScenarioNode,
  ScenarioResult,
} from './types';

export type DecisionReview = {
  scenarioId: string;
  scenarioTitle: string;
  nodeTitle: string;
  choiceText: string;
  timedOut: boolean;
  remainingSec: number;
  effectText: string;
  nextTitle: string;
};

export type ReplayInput = {
  mode: 'shift' | 'training';
  queue: string[];
  history: HistoryEntry[];
};

export type ReplayResult = {
  score: number;
  loyalty: number;
  safety: number;
  competencies: Record<CompetencyId, number>;
  flags: string[];
  grades: EndingGrade[];
  results: ScenarioResult[];
  review: DecisionReview[];
  scenarioIds: string[];
  timeoutCount: number;
};

export class ReplayError extends Error {}

const MAX_STEPS = 24;

function clampRemaining(node: ScenarioNode, value: number) {
  if (!node.timerSec || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(node.timerSec, value));
}

function withFastFlag(flags: string[], remainingSec: number, hadTimer: boolean) {
  if (hadTimer && remainingSec >= 10 && !flags.includes('fast_decision')) {
    return [...flags, 'fast_decision'];
  }
  return flags;
}

function assertQueue(input: ReplayInput) {
  if (input.mode === 'shift') {
    const expected = [...SHIFT_ORDER];
    if (input.queue.join('|') !== expected.join('|')) {
      throw new ReplayError('Смена должна включать три события рейса');
    }
    return;
  }
  if (input.queue.length !== 1) {
    throw new ReplayError('Тренировка — это один кейс');
  }
}

export function replay(input: ReplayInput): ReplayResult {
  assertQueue(input);
  if (input.history.length > MAX_STEPS) {
    throw new ReplayError('Слишком длинная цепочка решений');
  }

  let loyalty = 70;
  let safety = 70;
  let competencies = emptyCompetencies(50);
  let flags: string[] = [];
  const results: ScenarioResult[] = [];
  const review: DecisionReview[] = [];
  let cursor = 0;
  let fastDecisions = 0;
  let timeoutCount = 0;

  for (const scenarioId of input.queue) {
    let scenario: Scenario;
    try {
      scenario = scenarioById(scenarioId);
    } catch {
      throw new ReplayError('Неизвестный сценарий');
    }

    let node = getNode(scenario, scenario.startId);
    if (!node) throw new ReplayError('Нет стартового узла');

    while (node.kind !== 'ending') {
      const step = input.history[cursor];
      if (!step) throw new ReplayError('Решения закончились раньше финала');
      if (step.scenarioId !== scenario.id || step.nodeId !== node.id) {
        throw new ReplayError('Журнал решений не совпадает со сценарием');
      }
      cursor += 1;

      const remainingSec = clampRemaining(node, step.remainingSec);
      let nextId = '';
      let choiceText = '';
      let timedOut = false;
      let delta: MeterDelta | undefined;

      if (step.choiceId === 'timeout') {
        if (!node.timeoutNext) throw new ReplayError('На этом шаге таймер не предусмотрен');
        timedOut = true;
        timeoutCount += 1;
        choiceText = 'Время вышло';
        nextId = node.timeoutNext;
        delta = node.timeoutEffects;
        if (!flags.includes('timeout')) flags = [...flags, 'timeout'];
      } else {
        if (remainingSec >= 10) fastDecisions += 1;
        const choice = node.choices?.find((item) => item.id === step.choiceId);
        if (!choice) throw new ReplayError('Такого варианта на этом шаге нет');
        flags = withFastFlag(flags, remainingSec, Boolean(node.timerSec));
        choiceText = choice.text;
        nextId = choice.next;
        delta = choice.effects;
      }

      const applied = applyDelta(loyalty, safety, competencies, flags, delta);
      loyalty = applied.loyalty;
      safety = applied.safety;
      competencies = applied.competencies;
      flags = applied.flags;

      const next = getNode(scenario, nextId);
      if (!next) throw new ReplayError('Сценарий ссылается на неизвестный узел');

      review.push({
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        nodeTitle: node.title,
        choiceText,
        timedOut,
        remainingSec,
        effectText: describeDelta(delta),
        nextTitle: next.kind === 'ending' ? (next.ending?.title ?? next.title) : next.title,
      });
      node = next;
    }

    if (!node.ending) throw new ReplayError('Финал без оценки');
    results.push({
      scenarioId: scenario.id,
      grade: node.ending.grade,
      title: node.ending.title,
      summary: node.ending.summary,
      loyalty,
      safety,
    });
  }

  if (cursor !== input.history.length) {
    throw new ReplayError('В журнале есть лишние решения');
  }

  const flagsOut = flags.includes('opened_bag')
    ? flags.filter((flag) => flag !== 'not_opened_bag')
    : flags;
  const grades = results.map((item) => item.grade);

  return {
    score: runScore({
      loyalty,
      safety,
      competencies,
      grades,
      timeoutCount,
      fastDecisions,
    }),
    loyalty,
    safety,
    competencies,
    flags: flagsOut,
    grades,
    results,
    review,
    scenarioIds: results.map((item) => item.scenarioId),
    timeoutCount,
  };
}
