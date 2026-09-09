export type CompetencyId =
  | 'communication'
  | 'protocol'
  | 'stress'
  | 'escalation'
  | 'empathy';

export type EndingGrade =
  | 'excellent'
  | 'acceptable'
  | 'service_fail'
  | 'safety_fail';

export type MeterDelta = {
  loyalty?: number;
  safety?: number;
  competencies?: Partial<Record<CompetencyId, number>>;
  flags?: string[];
};

export type Choice = {
  id: string;
  text: string;
  next: string;
  effects?: MeterDelta;
};

export type ScenarioNode = {
  id: string;
  kind: 'beat' | 'ending';
  car: number;
  location: string;
  speaker?: string;
  speakerRole?: string;
  title: string;
  body: string;
  timerSec?: number;
  timeoutNext?: string;
  timeoutEffects?: MeterDelta;
  choices?: Choice[];
  ending?: {
    grade: EndingGrade;
    title: string;
    summary: string;
  };
};

export type Scenario = {
  id: string;
  title: string;
  subtitle: string;
  durationLabel: string;
  threat: string;
  startId: string;
  nodes: Record<string, ScenarioNode>;
};

export type HistoryEntry = {
  scenarioId: string;
  nodeId: string;
  choiceId: string;
  remainingSec: number;
};

export type ScenarioResult = {
  scenarioId: string;
  grade: EndingGrade;
  title: string;
  summary: string;
  loyalty: number;
  safety: number;
};

export type RunRecord = {
  id: string;
  at: number;
  mode: 'shift' | 'training';
  score: number;
  loyalty: number;
  safety: number;
  competencies: Record<CompetencyId, number>;
  grades: EndingGrade[];
  flags: string[];
  scenarioIds: string[];
};

export type LeaderboardRow = {
  name: string;
  score: number;
  unit: string;
  me?: boolean;
};

export type ProfileData = {
  name: string;
  xp: number;
  competencies: Record<CompetencyId, number>;
  achievements: string[];
  runs: RunRecord[];
  leaderboard: LeaderboardRow[];
};
