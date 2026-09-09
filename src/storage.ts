import { COMPETENCY_IDS, emptyCompetencies } from './engine';
import type { CompetencyId, LeaderboardRow, ProfileData, RunRecord } from './types';

const KEY = 'smena400.v1';

const SEED_BOARD: LeaderboardRow[] = [
  { name: 'Е. Волкова', score: 91, unit: 'Бригада 3' },
  { name: 'А. Морозов', score: 87, unit: 'Бригада 1' },
  { name: 'Н. Савельева', score: 84, unit: 'Бригада 2' },
  { name: 'И. Белов', score: 79, unit: 'Бригада 1' },
  { name: 'М. Орлова', score: 76, unit: 'Бригада 4' },
  { name: 'П. Крылов', score: 72, unit: 'Бригада 2' },
];

function blankProfile(): ProfileData {
  return {
    name: '',
    xp: 0,
    competencies: emptyCompetencies(0),
    achievements: [],
    runs: [],
    leaderboard: SEED_BOARD.map((row) => ({ ...row })),
  };
}

export function loadProfile(): ProfileData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blankProfile();
    const parsed = JSON.parse(raw) as ProfileData;
    return {
      ...blankProfile(),
      ...parsed,
      competencies: { ...emptyCompetencies(0), ...parsed.competencies },
      achievements: parsed.achievements ?? [],
      runs: parsed.runs ?? [],
      leaderboard: parsed.leaderboard?.length ? parsed.leaderboard : blankProfile().leaderboard,
    };
  } catch {
    return blankProfile();
  }
}

export function saveProfile(data: ProfileData) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function setConductorName(name: string) {
  const data = loadProfile();
  data.name = name.trim();
  saveProfile(data);
  return data;
}

export function recordRun(run: RunRecord, newAchievements: string[]) {
  const data = loadProfile();
  data.runs = [run, ...data.runs].slice(0, 40);
  data.xp += run.score;
  data.achievements = [...new Set([...data.achievements, ...newAchievements])];

  for (const id of COMPETENCY_IDS) {
    const prev = data.competencies[id];
    const mixed = prev === 0 ? run.competencies[id] : prev * 0.65 + run.competencies[id] * 0.35;
    data.competencies[id as CompetencyId] = Math.round(Math.min(100, mixed));
  }

  const mine = data.leaderboard.find((row) => row.me);
  if (!mine || run.score > mine.score) {
    data.leaderboard = data.leaderboard.filter((row) => !row.me);
    data.leaderboard.push({
      name: data.name || 'Проводник',
      score: run.score,
      unit: 'Ваша бригада',
      me: true,
    });
    data.leaderboard.sort((a, b) => b.score - a.score);
  }

  saveProfile(data);
  return data;
}
