import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { summarizeActivity } from '../src/analytics.ts';
import { unlockAchievements } from '../src/achievements.ts';
import { COMPETENCY_IDS, emptyCompetencies, levelFromXp } from '../src/engine.ts';
import { ReplayError, replay } from '../src/replay.ts';
import type {
  AnalyticsReport,
  AppNotification,
  CompetencyId,
  HistoryEntry,
  LeaderboardRow,
  PublicProfile,
  RunRecord,
} from '../src/types.ts';
import { HttpError } from './errors.ts';

const DAY = 24 * 60 * 60 * 1000;
const STARTER_POINTS = 40;
const STARTER_TTL = 3 * DAY;
const RUN_TTL = 30 * DAY;
const WARN_WINDOW = 7 * DAY;

const SEED = [
  { externalId: 'SYN-1001', name: 'Е. Волкова', score: 91, brigade: 'Бригада 3', depot: 'Депо Москва' },
  { externalId: 'SYN-1002', name: 'А. Морозов', score: 87, brigade: 'Бригада 1', depot: 'Депо Москва' },
  { externalId: 'SYN-1003', name: 'Н. Савельева', score: 84, brigade: 'Бригада 2', depot: 'Депо Тверь' },
  { externalId: 'SYN-1004', name: 'И. Белов', score: 79, brigade: 'Бригада 1', depot: 'Депо Москва' },
  { externalId: 'SYN-1005', name: 'М. Орлова', score: 76, brigade: 'Бригада 4', depot: 'Депо Санкт-Петербург' },
  { externalId: 'SYN-1006', name: 'П. Крылов', score: 72, brigade: 'Бригада 2', depot: 'Депо Тверь' },
  { externalId: 'SYN-1007', name: 'Д. Егоров', score: 68, brigade: 'Бригада 7', depot: 'Депо Санкт-Петербург' },
  { externalId: 'SYN-1008', name: 'С. Павлова', score: 61, brigade: 'Бригада 7', depot: 'Депо Санкт-Петербург' },
];

type ConductorRow = {
  id: string;
  external_id: string | null;
  display_name: string;
  brigade: string;
  depot: string;
  xp: number;
  competencies: string;
  achievements: string;
  best_score: number;
  created_at: number;
  last_active_at: number;
};

type RunRow = {
  id: string;
  at: number;
  mode: 'shift' | 'training';
  score: number;
  loyalty: number;
  safety: number;
  competencies: string;
  grades: string;
  flags: string;
  scenario_ids: string;
};

const dir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(path.join(dir, 'smena.sqlite'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS conductors (
    id TEXT PRIMARY KEY,
    external_id TEXT UNIQUE,
    display_name TEXT NOT NULL,
    brigade TEXT NOT NULL,
    depot TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    competencies TEXT NOT NULL,
    achievements TEXT NOT NULL,
    best_score INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_active_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS point_lots (
    id TEXT PRIMARY KEY,
    conductor_id TEXT NOT NULL REFERENCES conductors(id),
    amount INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    burned INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    conductor_id TEXT NOT NULL REFERENCES conductors(id),
    at INTEGER NOT NULL,
    mode TEXT NOT NULL,
    score INTEGER NOT NULL,
    loyalty INTEGER NOT NULL,
    safety INTEGER NOT NULL,
    competencies TEXT NOT NULL,
    grades TEXT NOT NULL,
    flags TEXT NOT NULL,
    scenario_ids TEXT NOT NULL,
    decisions TEXT NOT NULL,
    review TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    conductor_id TEXT NOT NULL REFERENCES conductors(id),
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    read_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conductor_id TEXT NOT NULL REFERENCES conductors(id),
    at INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_runs_conductor ON runs(conductor_id);
  CREATE INDEX IF NOT EXISTS idx_events_conductor ON events(conductor_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_conductor ON notifications(conductor_id);
`);

function one<T>(sql: string, ...args: Array<string | number | null>): T | undefined {
  return db.prepare(sql).get(...args) as T | undefined;
}

function many<T>(sql: string, ...args: Array<string | number | null>): T[] {
  return db.prepare(sql).all(...args) as T[];
}

function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function readJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function notify(conductorId: string, kind: string, title: string, body: string, at: number) {
  db.prepare(
    `INSERT INTO notifications (id, conductor_id, kind, title, body, created_at, read_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  ).run(randomUUID(), conductorId, kind, title, body, at);
}

function burnExpired(conductorId: string, now: number) {
  const lots = many<{ id: string; amount: number }>(
    `SELECT id, amount FROM point_lots
     WHERE conductor_id = ? AND burned = 0 AND expires_at <= ?`,
    conductorId,
    now,
  );
  if (!lots.length) return 0;
  const sum = lots.reduce((total, lot) => total + lot.amount, 0);
  const mark = db.prepare('UPDATE point_lots SET burned = 1 WHERE id = ?');
  for (const lot of lots) mark.run(lot.id);
  db.prepare('UPDATE conductors SET xp = MAX(0, xp - ?) WHERE id = ?').run(sum, conductorId);
  notify(
    conductorId,
    'expiry',
    'Баллы сгорели',
    `${sum} баллов компетенций списаны: срок хранения вышел. Новая смена останавливает потерю.`,
    now,
  );
  return sum;
}

function rememberExpiring(conductorId: string, now: number) {
  const soon = now + WARN_WINDOW;
  const row = one<{ amount: number; at: number | null }>(
    `SELECT COALESCE(SUM(amount), 0) AS amount, MIN(expires_at) AS at
     FROM point_lots
     WHERE conductor_id = ? AND burned = 0 AND expires_at > ? AND expires_at <= ?`,
    conductorId,
    now,
    soon,
  );
  if (!row?.amount) {
    db.prepare(
      `UPDATE notifications SET read_at = ?
       WHERE conductor_id = ? AND kind = 'expiry-soon' AND read_at IS NULL`,
    ).run(now, conductorId);
    return;
  }
  const open = one<{ id: string }>(
    `SELECT id FROM notifications
     WHERE conductor_id = ? AND kind = 'expiry-soon' AND read_at IS NULL`,
    conductorId,
  );
  if (open) return;
  const days = Math.max(1, Math.ceil(((row.at ?? soon) - now) / DAY));
  notify(
    conductorId,
    'expiry-soon',
    'Сгорающие баллы',
    `${row.amount} баллов сгорят через ${days} дн., если не закрыть сценарий.`,
    now,
  );
}

function seed() {
  const existing = one<{ n: number }>('SELECT COUNT(*) AS n FROM conductors WHERE external_id IS NOT NULL');
  if (existing && existing.n > 0) return;
  const now = Date.now();
  const insert = db.prepare(
    `INSERT INTO conductors (
      id, external_id, display_name, brigade, depot, xp, competencies, achievements,
      best_score, created_at, last_active_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const person of SEED) {
    insert.run(
      randomUUID(),
      person.externalId,
      person.name,
      person.brigade,
      person.depot,
      person.score,
      JSON.stringify(emptyCompetencies(60)),
      '[]',
      person.score,
      now,
      now,
    );
  }
}

seed();

function requireConductor(id: string) {
  const row = one<ConductorRow>('SELECT * FROM conductors WHERE id = ?', id);
  if (!row) throw new HttpError(404, 'Профиль не найден');
  return row;
}

function toProfile(row: ConductorRow, now: number): PublicProfile {
  const expiring = one<{ amount: number; at: number | null }>(
    `SELECT COALESCE(SUM(amount), 0) AS amount, MIN(expires_at) AS at
     FROM point_lots
     WHERE conductor_id = ? AND burned = 0 AND expires_at > ? AND expires_at <= ?`,
    row.id,
    now,
    now + WARN_WINDOW,
  );
  const level = levelFromXp(row.xp);
  return {
    id: row.id,
    displayName: row.display_name,
    brigade: row.brigade,
    depot: row.depot,
    xp: row.xp,
    level: level.level,
    levelTitle: level.title,
    competencies: {
      ...emptyCompetencies(0),
      ...readJson<Partial<Record<CompetencyId, number>>>(row.competencies, {}),
    },
    achievements: readJson<string[]>(row.achievements, []),
    bestScore: row.best_score,
    expiringPoints: expiring?.amount ?? 0,
    expiringAt: expiring?.at ?? null,
  };
}

function touch(id: string, now: number) {
  burnExpired(id, now);
  rememberExpiring(id, now);
  db.prepare('UPDATE conductors SET last_active_at = ? WHERE id = ?').run(now, id);
}

export function createProfile(input: { displayName: string; brigade: string; depot: string }) {
  const now = Date.now();
  const id = randomUUID();
  transaction(() => {
    db.prepare(
      `INSERT INTO conductors (
        id, external_id, display_name, brigade, depot, xp, competencies, achievements,
        best_score, created_at, last_active_at
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, '[]', 0, ?, ?)`,
    ).run(
      id,
      input.displayName,
      input.brigade,
      input.depot,
      STARTER_POINTS,
      JSON.stringify(emptyCompetencies(0)),
      now,
      now,
    );
    db.prepare(
      `INSERT INTO point_lots (id, conductor_id, amount, expires_at, burned) VALUES (?, ?, ?, ?, 0)`,
    ).run(randomUUID(), id, STARTER_POINTS, now + STARTER_TTL);
    notify(
      id,
      'scenario',
      'Новые сценарии смены',
      'На рейсе ВСМ-001 открыты три кейса: медицинский инцидент, конфликт в премиуме и бесхозная сумка.',
      now,
    );
    notify(
      id,
      'challenge',
      'Челлендж недели',
      'Закройте полную смену без срыва таймера. Награда — отметка «Холодная голова».',
      now,
    );
    notify(
      id,
      'expiry-soon',
      'Сгорающие баллы',
      `${STARTER_POINTS} стартовых баллов сгорят через 3 дня, если не пройти сценарий.`,
      now,
    );
  });
  return toProfile(requireConductor(id), now);
}

export function updateProfile(
  id: string,
  input: { displayName: string; brigade: string; depot: string },
) {
  const now = Date.now();
  transaction(() => {
    requireConductor(id);
    touch(id, now);
    db.prepare(
      'UPDATE conductors SET display_name = ?, brigade = ?, depot = ? WHERE id = ?',
    ).run(input.displayName, input.brigade, input.depot, id);
  });
  return toProfile(requireConductor(id), now);
}

export function getProfile(id: string) {
  const now = Date.now();
  transaction(() => {
    requireConductor(id);
    touch(id, now);
  });
  return toProfile(requireConductor(id), now);
}

function loadRuns(conductorId: string): RunRecord[] {
  const rows = many<RunRow>(
    `SELECT id, at, mode, score, loyalty, safety, competencies, grades, flags, scenario_ids
     FROM runs WHERE conductor_id = ? ORDER BY at DESC`,
    conductorId,
  );
  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    mode: row.mode,
    score: row.score,
    loyalty: row.loyalty,
    safety: row.safety,
    competencies: {
      ...emptyCompetencies(0),
      ...readJson<Partial<Record<CompetencyId, number>>>(row.competencies, {}),
    },
    grades: readJson<RunRecord['grades']>(row.grades, []),
    flags: readJson<string[]>(row.flags, []),
    scenarioIds: readJson<string[]>(row.scenario_ids, []),
  }));
}

export function getAnalytics(id: string): AnalyticsReport {
  const profile = getProfile(id);
  return summarizeActivity({ runs: loadRuns(id), competencies: profile.competencies });
}

export function listNotifications(id: string): AppNotification[] {
  getProfile(id);
  const rows = many<{
    id: string;
    kind: string;
    title: string;
    body: string;
    created_at: number;
    read_at: number | null;
  }>(
    `SELECT id, kind, title, body, created_at, read_at
     FROM notifications WHERE conductor_id = ?
     ORDER BY (read_at IS NULL) DESC, created_at DESC`,
    id,
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
}

export function markRead(conductorId: string, notificationId: string) {
  const row = one<{ conductor_id: string }>(
    'SELECT conductor_id FROM notifications WHERE id = ?',
    notificationId,
  );
  if (!row || row.conductor_id !== conductorId) throw new HttpError(404, 'Оповещение не найдено');
  const now = Date.now();
  db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL').run(now, notificationId);
  return listNotifications(conductorId).find((item) => item.id === notificationId);
}

function mixCompetencies(
  prev: Record<CompetencyId, number>,
  next: Record<CompetencyId, number>,
) {
  const mixed = emptyCompetencies(0);
  for (const id of COMPETENCY_IDS) {
    const before = prev[id] ?? 0;
    const value = before === 0 ? next[id] : before * 0.65 + next[id] * 0.35;
    mixed[id] = Math.round(Math.min(100, value));
  }
  return mixed;
}

export function submitRun(input: {
  conductorId: string;
  id: string;
  mode: 'shift' | 'training';
  queue: string[];
  history: HistoryEntry[];
}) {
  const now = Date.now();
  let played;
  try {
    played = replay({ mode: input.mode, queue: input.queue, history: input.history });
  } catch (error) {
    if (error instanceof ReplayError) throw new HttpError(400, error.message);
    throw error;
  }

  return transaction(() => {
    requireConductor(input.conductorId);
    const owner = one<{ conductor_id: string }>('SELECT conductor_id FROM runs WHERE id = ?', input.id);
    if (owner) {
      if (owner.conductor_id !== input.conductorId) {
        throw new HttpError(409, 'Такое прохождение уже записано');
      }
      return {
        score: played.score,
        unlocked: [] as string[],
        profile: toProfile(requireConductor(input.conductorId), now),
        review: played.review,
      };
    }

    burnExpired(input.conductorId, now);
    const fresh = requireConductor(input.conductorId);
    const prevCompetencies = {
      ...emptyCompetencies(0),
      ...readJson<Partial<Record<CompetencyId, number>>>(fresh.competencies, {}),
    };
    const prevAchievements = readJson<string[]>(fresh.achievements, []);
    const run: RunRecord = {
      id: input.id,
      at: now,
      mode: input.mode,
      score: played.score,
      loyalty: played.loyalty,
      safety: played.safety,
      competencies: played.competencies,
      grades: played.grades,
      flags: played.flags,
      scenarioIds: played.scenarioIds,
    };
    const unlocked = unlockAchievements(run, prevAchievements);
    const achievements = [...new Set([...prevAchievements, ...unlocked])];
    const competencies = mixCompetencies(prevCompetencies, played.competencies);
    const xp = fresh.xp + played.score;
    const best = Math.max(fresh.best_score, played.score);

    db.prepare(
      `INSERT INTO runs (
        id, conductor_id, at, mode, score, loyalty, safety, competencies, grades, flags,
        scenario_ids, decisions, review
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.conductorId,
      now,
      input.mode,
      played.score,
      played.loyalty,
      played.safety,
      JSON.stringify(played.competencies),
      JSON.stringify(played.grades),
      JSON.stringify(played.flags),
      JSON.stringify(played.scenarioIds),
      JSON.stringify(input.history),
      JSON.stringify(played.review),
    );

    db.prepare(
      `UPDATE conductors
       SET xp = ?, competencies = ?, achievements = ?, best_score = ?, last_active_at = ?
       WHERE id = ?`,
    ).run(
      xp,
      JSON.stringify(competencies),
      JSON.stringify(achievements),
      best,
      now,
      input.conductorId,
    );

    db.prepare(
      `INSERT INTO point_lots (id, conductor_id, amount, expires_at, burned) VALUES (?, ?, ?, ?, 0)`,
    ).run(randomUUID(), input.conductorId, played.score, now + RUN_TTL);
    db.prepare(
      `UPDATE point_lots SET expires_at = ? WHERE conductor_id = ? AND burned = 0`,
    ).run(now + RUN_TTL, input.conductorId);

    const event = db.prepare(
      `INSERT INTO events (conductor_id, at, type, payload) VALUES (?, ?, ?, ?)`,
    );
    for (const step of input.history) {
      event.run(input.conductorId, now, 'decision', JSON.stringify(step));
    }
    event.run(
      input.conductorId,
      now,
      'run_finished',
      JSON.stringify({ runId: input.id, mode: input.mode, score: played.score, grades: played.grades }),
    );

    if (input.mode === 'shift' && !played.flags.includes('timeout')) {
      const done = one<{ id: string }>(
        `SELECT id FROM notifications WHERE conductor_id = ? AND kind = 'challenge-done'`,
        input.conductorId,
      );
      if (!done) {
        notify(
          input.conductorId,
          'challenge-done',
          'Челлендж закрыт',
          'Смена пройдена без срыва таймера. Отметка «Холодная голова» в личном деле.',
          now,
        );
      }
    }

    rememberExpiring(input.conductorId, now);
    return {
      score: played.score,
      unlocked,
      profile: toProfile(requireConductor(input.conductorId), now),
      review: played.review,
    };
  });
}

export function leaderboard(scope: 'brigade' | 'depot' | 'company', conductorId: string) {
  const viewer = conductorId ? one<ConductorRow>('SELECT * FROM conductors WHERE id = ?', conductorId) : undefined;
  if ((scope === 'brigade' || scope === 'depot') && !viewer) {
    throw new HttpError(400, 'Нужен профиль проводника');
  }

  let sql = 'SELECT id, display_name, brigade, depot, best_score FROM conductors';
  const args: string[] = [];
  let label = 'Компания ВСМ';
  if (scope === 'brigade' && viewer) {
    sql += ' WHERE brigade = ?';
    args.push(viewer.brigade);
    label = viewer.brigade;
  } else if (scope === 'depot' && viewer) {
    sql += ' WHERE depot = ?';
    args.push(viewer.depot);
    label = viewer.depot;
  }
  sql += ' ORDER BY best_score DESC, display_name ASC LIMIT 30';

  const rows = many<{
    id: string;
    display_name: string;
    brigade: string;
    depot: string;
    best_score: number;
  }>(sql, ...args).map((row) => {
    const unit =
      scope === 'company' ? `${row.brigade} · ${row.depot}` : scope === 'depot' ? row.brigade : row.depot;
    const item: LeaderboardRow = {
      id: row.id,
      name: row.display_name,
      score: row.best_score,
      unit,
      me: row.id === conductorId,
    };
    return item;
  });

  return { scope, label, rows };
}

const FORBIDDEN = new Set([
  'passport',
  'snils',
  'inn',
  'phone',
  'email',
  'birthdate',
  'birth',
  'address',
  'patronymic',
  'password',
]);

export function assertSynthetic(value: unknown, depth = 0): void {
  if (depth > 6) throw new HttpError(400, 'Слишком глубокая структура');
  if (Array.isArray(value)) {
    for (const item of value) assertSynthetic(item, depth + 1);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN.has(key.toLowerCase())) {
      throw new HttpError(422, 'В демо нельзя передавать персональные данные. Только синтетические поля.');
    }
    assertSynthetic(nested, depth + 1);
  }
}

function cleanLabel(value: unknown, field: string) {
  if (typeof value !== 'string') throw new HttpError(400, `Поле ${field} должно быть строкой`);
  const text = value.trim();
  if (text.length < 2 || text.length > 60) throw new HttpError(400, `Поле ${field} длиной 2–60 символов`);
  if (/[@+]|\d{6,}/.test(text)) {
    throw new HttpError(422, 'Похоже на контактные данные. В демо только позывной и подразделение.');
  }
  return text;
}

export function cleanName(value: unknown) {
  return cleanLabel(value, 'displayName').slice(0, 40);
}

export function upsertRoster(employees: unknown) {
  if (!Array.isArray(employees) || employees.length === 0 || employees.length > 100) {
    throw new HttpError(400, 'Ожидается список сотрудников от 1 до 100');
  }
  const now = Date.now();
  let upserted = 0;
  transaction(() => {
    for (const raw of employees) {
      assertSynthetic(raw);
      if (!raw || typeof raw !== 'object') throw new HttpError(400, 'Некорректная карточка');
      const card = raw as Record<string, unknown>;
      const externalId = card.externalId;
      if (typeof externalId !== 'string' || !/^SYN-[A-Z0-9-]{2,32}$/.test(externalId)) {
        throw new HttpError(422, 'Внешний идентификатор в демо только вида SYN-…');
      }
      const displayName = cleanName(card.displayName);
      const brigade = cleanLabel(card.brigade, 'brigade');
      const depot = cleanLabel(card.depot, 'depot');
      const existing = one<{ id: string }>('SELECT id FROM conductors WHERE external_id = ?', externalId);
      if (existing) {
        db.prepare(
          'UPDATE conductors SET display_name = ?, brigade = ?, depot = ?, last_active_at = ? WHERE id = ?',
        ).run(displayName, brigade, depot, now, existing.id);
      } else {
        db.prepare(
          `INSERT INTO conductors (
            id, external_id, display_name, brigade, depot, xp, competencies, achievements,
            best_score, created_at, last_active_at
          ) VALUES (?, ?, ?, ?, ?, 0, ?, '[]', 0, ?, ?)`,
        ).run(
          randomUUID(),
          externalId,
          displayName,
          brigade,
          depot,
          JSON.stringify(emptyCompetencies(0)),
          now,
          now,
        );
      }
      upserted += 1;
    }
  });
  return { upserted };
}

export function exportResults(since: number) {
  const rows = many<{
    conductor_id: string;
    external_id: string | null;
    display_name: string;
    brigade: string;
    depot: string;
    at: number;
    mode: string;
    score: number;
    loyalty: number;
    safety: number;
    grades: string;
    scenario_ids: string;
    competencies: string;
  }>(
    `SELECT r.conductor_id, c.external_id, c.display_name, c.brigade, c.depot,
            r.at, r.mode, r.score, r.loyalty, r.safety, r.grades, r.scenario_ids, r.competencies
     FROM runs r JOIN conductors c ON c.id = r.conductor_id
     WHERE r.at >= ?
     ORDER BY r.at ASC
     LIMIT 500`,
    since,
  );
  return {
    exportedAt: Date.now(),
    results: rows.map((row) => ({
      conductorId: row.conductor_id,
      externalId: row.external_id,
      displayName: row.display_name,
      brigade: row.brigade,
      depot: row.depot,
      finishedAt: row.at,
      mode: row.mode,
      score: row.score,
      loyalty: row.loyalty,
      safety: row.safety,
      grades: readJson(row.grades, []),
      scenarioIds: readJson(row.scenario_ids, []),
      competencies: readJson(row.competencies, {}),
    })),
  };
}
