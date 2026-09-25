import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, scenarioById } from '../src/data/index.ts';
import type { HistoryEntry } from '../src/types.ts';
import { HttpError } from './errors.ts';
import { attachSocket } from './session.ts';
import {
  assertSynthetic,
  cleanName,
  createProfile,
  exportResults,
  getAnalytics,
  getProfile,
  leaderboard,
  listNotifications,
  markRead,
  submitRun,
  updateProfile,
  upsertRoster,
} from './store.ts';

const PORT = Number(process.env.PORT ?? 4001);
const HOST = process.env.HOST ?? '0.0.0.0';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const openapiPath = path.join(root, 'docs', 'openapi.yaml');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Ctx = {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  header: (name: string) => string;
};

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json; charset=utf-8') {
  const payload = type.startsWith('application/json') ? JSON.stringify(body) : String(body);
  res.writeHead(status, {
    'content-type': type,
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-conductor-id, x-integration-key',
    'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new HttpError(413, 'Слишком большое тело запроса'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Ожидается JSON'));
      }
    });
    req.on('error', () => reject(new HttpError(400, 'Ошибка чтения запроса')));
  });
}

function conductorId(ctx: Ctx) {
  const id = ctx.header('x-conductor-id');
  if (!UUID.test(id)) throw new HttpError(401, 'Нужен заголовок X-Conductor-Id');
  return id;
}

function integrationKey(ctx: Ctx) {
  const expected = process.env.INTEGRATION_KEY ?? 'demo-vsm-integration';
  const got = ctx.header('x-integration-key');
  const left = Buffer.from(got);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new HttpError(401, 'Неверный ключ интеграции');
  }
}

function profileInput(body: unknown) {
  assertSynthetic(body);
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Ожидается объект профиля');
  const card = body as Record<string, unknown>;
  const displayName = cleanName(card.displayName);
  const brigade = typeof card.brigade === 'string' && card.brigade.trim() ? cleanUnit(card.brigade) : 'Бригада 7';
  const depot = typeof card.depot === 'string' && card.depot.trim() ? cleanUnit(card.depot) : 'Депо Санкт-Петербург';
  return { displayName, brigade, depot };
}

function cleanUnit(value: string) {
  const text = value.trim();
  if (text.length < 2 || text.length > 60 || /[@+]|\d{6,}/.test(text)) {
    throw new HttpError(422, 'Подразделение выглядит как персональные данные');
  }
  return text;
}

function parseHistory(body: unknown) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Ожидается журнал смены');
  const card = body as Record<string, unknown>;
  if (typeof card.id !== 'string' || !/^run-\d{10,16}$/.test(card.id)) {
    throw new HttpError(400, 'Некорректный идентификатор прохождения');
  }
  if (card.mode !== 'shift' && card.mode !== 'training') throw new HttpError(400, 'Неизвестный режим');
  if (!Array.isArray(card.queue) || card.queue.some((item) => typeof item !== 'string')) {
    throw new HttpError(400, 'Очередь сценариев пуста');
  }
  if (!Array.isArray(card.history)) throw new HttpError(400, 'Нет журнала решений');
  const history: HistoryEntry[] = card.history.map((step) => {
    if (!step || typeof step !== 'object') throw new HttpError(400, 'Битый шаг журнала');
    const row = step as Record<string, unknown>;
    if (
      typeof row.scenarioId !== 'string' ||
      typeof row.nodeId !== 'string' ||
      typeof row.choiceId !== 'string' ||
      typeof row.remainingSec !== 'number'
    ) {
      throw new HttpError(400, 'Битый шаг журнала');
    }
    return {
      scenarioId: row.scenarioId,
      nodeId: row.nodeId,
      choiceId: row.choiceId,
      remainingSec: row.remainingSec,
    };
  });
  return {
    id: card.id,
    mode: card.mode,
    queue: card.queue as string[],
    history,
  };
}

const routes: { method: string; pattern: RegExp; keys: string[]; handler: (ctx: Ctx) => unknown }[] = [];

function route(method: string, template: string, handler: (ctx: Ctx) => unknown) {
  const keys: string[] = [];
  const pattern = new RegExp(
    `^${template.replace(/:([A-Za-z]+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    })}$`,
  );
  routes.push({ method, pattern, keys, handler });
}

route('GET', '/api/health', () => ({ ok: true, service: 'smena-400' }));

route('GET', '/api/openapi.yaml', () => readFileSync(openapiPath, 'utf8'));

route('GET', '/api/scenarios', () =>
  Object.values(SCENARIOS).map((scenario) => ({
    id: scenario.id,
    title: scenario.title,
    subtitle: scenario.subtitle,
    threat: scenario.threat,
    durationLabel: scenario.durationLabel,
  })),
);

route('GET', '/api/scenarios/:id', (ctx) => {
  try {
    return scenarioById(ctx.params.id);
  } catch {
    throw new HttpError(404, 'Сценарий не найден');
  }
});

route('POST', '/api/profiles', (ctx) => createProfile(profileInput(ctx.body)));

route('GET', '/api/profiles/:id', (ctx) => {
  if (!UUID.test(ctx.params.id)) throw new HttpError(404, 'Профиль не найден');
  return getProfile(ctx.params.id);
});

route('PATCH', '/api/profiles/:id', (ctx) => {
  const id = conductorId(ctx);
  if (id !== ctx.params.id) throw new HttpError(403, 'Можно менять только свой профиль');
  return updateProfile(id, profileInput(ctx.body));
});

route('GET', '/api/profiles/:id/analytics', (ctx) => {
  if (!UUID.test(ctx.params.id)) throw new HttpError(404, 'Профиль не найден');
  return getAnalytics(ctx.params.id);
});

route('GET', '/api/profiles/:id/notifications', (ctx) => {
  const id = conductorId(ctx);
  if (id !== ctx.params.id) throw new HttpError(403, 'Чужие оповещения закрыты');
  return { items: listNotifications(id) };
});

route('POST', '/api/notifications/:id/read', (ctx) => {
  if (!UUID.test(ctx.params.id)) throw new HttpError(404, 'Оповещение не найдено');
  return markRead(conductorId(ctx), ctx.params.id);
});

route('POST', '/api/runs', (ctx) => {
  const parsed = parseHistory(ctx.body);
  return submitRun({ conductorId: conductorId(ctx), ...parsed });
});

route('GET', '/api/leaderboard', (ctx) => {
  const scope = ctx.query.get('scope') ?? 'brigade';
  if (scope !== 'brigade' && scope !== 'depot' && scope !== 'company') {
    throw new HttpError(400, 'scope: brigade, depot или company');
  }
  const header = ctx.header('x-conductor-id');
  const id = UUID.test(header) ? header : '';
  return leaderboard(scope, id);
});

route('POST', '/api/integrations/hr/roster', (ctx) => {
  integrationKey(ctx);
  assertSynthetic(ctx.body);
  if (!ctx.body || typeof ctx.body !== 'object') throw new HttpError(400, 'Ожидается объект');
  return upsertRoster((ctx.body as { employees?: unknown }).employees);
});

route('GET', '/api/integrations/lms/results', (ctx) => {
  integrationKey(ctx);
  const raw = ctx.query.get('since') ?? '0';
  const since = Number(raw);
  if (!Number.isFinite(since) || since < 0) throw new HttpError(400, 'since — метка времени в мс');
  return exportResults(since);
});

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';
  for (const entry of routes) {
    if (entry.method !== method) continue;
    const match = url.pathname.match(entry.pattern);
    if (!match) continue;
    const params: Record<string, string> = {};
    entry.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1] ?? '');
    });
    const ctx: Ctx = {
      params,
      query: url.searchParams,
      body: method === 'GET' ? null : await readBody(req),
      header: (name) => {
        const value = req.headers[name];
        return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
      },
    };
    const result = await entry.handler(ctx);
    if (url.pathname === '/api/openapi.yaml') {
      send(res, 200, result, 'application/yaml; charset=utf-8');
      return;
    }
    send(res, method === 'POST' && url.pathname === '/api/profiles' ? 201 : 200, result);
    return;
  }
  send(res, 404, { error: 'Маршрут не найден' });
}

const server = createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    if (error instanceof HttpError) {
      send(res, error.status, { error: error.message });
      return;
    }
    console.error(error);
    send(res, 500, { error: 'Внутренняя ошибка' });
  });
});

attachSocket(server);

server.listen(PORT, HOST, () => {
  console.log(`smena-400 api http://${HOST}:${PORT}`);
});
