import { scenarioById } from '../src/data/index.ts';
import { getNode } from '../src/engine.ts';
import { ReplayError, replay } from '../src/replay.ts';
import type { HistoryEntry, ScenarioNode } from '../src/types.ts';

function walk(scenarioId: string, firstChoice: (node: ScenarioNode, index: number) => string) {
  const scenario = scenarioById(scenarioId);
  const history: HistoryEntry[] = [];
  let node = getNode(scenario, scenario.startId);
  let guard = 0;
  while (node && node.kind !== 'ending') {
    if (guard++ > 24) throw new Error(`loop in ${scenarioId}`);
    const choiceId = firstChoice(node, history.length);
    history.push({
      scenarioId,
      nodeId: node.id,
      choiceId,
      remainingSec: choiceId === 'timeout' ? 0 : 12,
    });
    const nextId =
      choiceId === 'timeout' ? node.timeoutNext : node.choices?.find((item) => item.id === choiceId)?.next;
    if (!nextId) throw new Error(`dead end ${scenarioId}/${node.id}`);
    node = getNode(scenario, nextId);
  }
  if (!node?.ending) throw new Error(`no ending ${scenarioId}`);
  return history;
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const shift = ['medical', 'conflict', 'suspicious'].flatMap((id) =>
  walk(id, (node) => node.choices?.[0]?.id ?? 'timeout'),
);
const full = replay({ mode: 'shift', queue: ['medical', 'conflict', 'suspicious'], history: shift });
assert(full.results.length === 3, 'shift should close three events');
assert(full.score >= 0 && full.score <= 100, 'score out of range');
assert(full.review.length === shift.length, 'review must cover every decision');
assert(!full.flags.includes('timeout'), 'first-choice shift should not time out');

const medicalTimeout = walk('medical', (node, index) =>
  index === 0 ? 'timeout' : (node.choices?.[0]?.id ?? 'timeout'),
);
const timed = replay({ mode: 'training', queue: ['medical'], history: medicalTimeout });
assert(timed.flags.includes('timeout'), 'timeout flag missing');
assert(timed.results.length === 1, 'training should finish');

let rejected = false;
try {
  replay({
    mode: 'training',
    queue: ['medical'],
    history: [{ scenarioId: 'medical', nodeId: 'nope', choiceId: 'proto', remainingSec: 5 }],
  });
} catch (error) {
  rejected = error instanceof ReplayError;
}
assert(rejected, 'broken history must be rejected');

console.log(`replay ok · shift ${full.score} · timeout path ${timed.score} · steps ${full.review.length}`);
