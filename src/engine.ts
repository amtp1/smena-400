import type {
  CompetencyId,
  EndingGrade,
  MeterDelta,
  Scenario,
  ScenarioNode,
} from './types';

export const COMPETENCY_IDS: CompetencyId[] = [
  'communication',
  'protocol',
  'stress',
  'escalation',
  'empathy',
];

export const COMPETENCY_LABEL: Record<CompetencyId, string> = {
  communication: 'Коммуникация',
  protocol: 'Протокол',
  stress: 'Холодная голова',
  escalation: 'Эскалация',
  empathy: 'Эмпатия',
};

export const GRADE_LABEL: Record<EndingGrade, string> = {
  excellent: 'Отлично',
  acceptable: 'Приемлемо',
  service_fail: 'Провал сервиса',
  safety_fail: 'Провал безопасности',
};

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function emptyCompetencies(fill = 50): Record<CompetencyId, number> {
  return {
    communication: fill,
    protocol: fill,
    stress: fill,
    escalation: fill,
    empathy: fill,
  };
}

export function indexNodes(nodes: ScenarioNode[]): Record<string, ScenarioNode> {
  return Object.fromEntries(nodes.map((node) => [node.id, node]));
}

export function getNode(scenario: Scenario, id: string): ScenarioNode | undefined {
  return scenario.nodes[id];
}

export function applyDelta(
  loyalty: number,
  safety: number,
  competencies: Record<CompetencyId, number>,
  flags: string[],
  delta?: MeterDelta,
) {
  const nextFlags = [...flags];
  const nextComp = { ...competencies };

  if (delta?.competencies) {
    for (const key of COMPETENCY_IDS) {
      const add = delta.competencies[key];
      if (add) nextComp[key] = clamp(nextComp[key] + add);
    }
  }

  if (delta?.flags) {
    for (const flag of delta.flags) {
      if (!nextFlags.includes(flag)) nextFlags.push(flag);
    }
  }

  return {
    loyalty: clamp(loyalty + (delta?.loyalty ?? 0)),
    safety: clamp(safety + (delta?.safety ?? 0)),
    competencies: nextComp,
    flags: nextFlags,
  };
}

export function runScore(input: {
  loyalty: number;
  safety: number;
  competencies: Record<CompetencyId, number>;
  grades: EndingGrade[];
  timeoutCount: number;
  fastDecisions: number;
}) {
  const avgComp =
    COMPETENCY_IDS.reduce((sum, id) => sum + input.competencies[id], 0) /
    COMPETENCY_IDS.length;

  const gradeBonus = input.grades.reduce((sum, grade) => {
    if (grade === 'excellent') return sum + 8;
    if (grade === 'acceptable') return sum + 3;
    if (grade === 'service_fail') return sum - 4;
    return sum - 8;
  }, 0);

  const raw =
    input.safety * 0.36 +
    input.loyalty * 0.24 +
    avgComp * 0.28 +
    Math.min(8, input.fastDecisions * 2) -
    input.timeoutCount * 6 +
    gradeBonus;

  return Math.round(clamp(raw));
}

export const LEVEL_TITLES = [
  'Стажёр',
  'Проводник',
  'Смена',
  'Старший смены',
  'Наставник',
  'Инструктор',
  'Эксперт маршрута',
  'Эталон сервиса',
  'Хранитель протокола',
  'Мастер 400',
] as const;

export function levelFromXp(xp: number) {
  const level = Math.min(LEVEL_TITLES.length, 1 + Math.floor(Math.max(0, xp) / 100));
  return { level, title: LEVEL_TITLES[level - 1] };
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function describeDelta(delta?: MeterDelta) {
  if (!delta) return 'Без сдвига шкал';
  const parts: string[] = [];
  if (delta.loyalty) parts.push(`лояльность ${signed(delta.loyalty)}`);
  if (delta.safety) parts.push(`безопасность ${signed(delta.safety)}`);
  if (delta.competencies) {
    for (const id of COMPETENCY_IDS) {
      const value = delta.competencies[id];
      if (value) parts.push(`${COMPETENCY_LABEL[id]} ${signed(value)}`);
    }
  }
  return parts.length ? parts.join(' · ') : 'Без сдвига шкал';
}
