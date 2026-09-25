import { SCENARIOS } from './data';
import { COMPETENCY_IDS, COMPETENCY_LABEL } from './engine';
import type { AnalyticsReport, CompetencyId, RunRecord } from './types';

const GAP_LINE: Record<CompetencyId, string> = {
  communication: 'Редко удаётся коротко и спокойно сказать, что происходит',
  protocol: 'Протокол подключается слишком поздно',
  stress: 'Таймер срывается или решение зависает',
  escalation: 'Начальник поезда и профильные службы вызываются с опозданием',
  empathy: 'В конфликте сервисный тон проседает',
};

export function summarizeActivity(input: {
  runs: RunRecord[];
  competencies: Record<CompetencyId, number>;
}): AnalyticsReport {
  const { runs, competencies } = input;
  const count = runs.length;
  const avgScore = count
    ? Math.round(runs.reduce((sum, run) => sum + run.score, 0) / count)
    : 0;
  const timeoutRate = count
    ? Math.round((runs.filter((run) => run.flags.includes('timeout')).length / count) * 100)
    : 0;
  const fastRate = count
    ? Math.round((runs.filter((run) => run.flags.includes('fast_decision')).length / count) * 100)
    : 0;

  const gaps =
    count === 0
      ? []
      : COMPETENCY_IDS.filter((id) => competencies[id] < 45).map((id) => ({
          id,
          label: COMPETENCY_LABEL[id],
          value: Math.round(competencies[id]),
          hint: GAP_LINE[id],
        }));

  const scenarios = Object.values(SCENARIOS).map((scenario) => {
    let attempts = 0;
    let excellent = 0;
    for (const run of runs) {
      run.scenarioIds.forEach((id, index) => {
        if (id !== scenario.id) return;
        attempts += 1;
        if (run.grades[index] === 'excellent') excellent += 1;
      });
    }
    return { id: scenario.id, title: scenario.title, attempts, excellent };
  });

  return { runs: count, avgScore, timeoutRate, fastRate, gaps, scenarios };
}
