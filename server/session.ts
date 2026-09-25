import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { parseClientMsg, type ClientMsg, type ServerMsg } from '../src/net/protocol.ts';
import {
  ackEnding,
  arrive,
  choose,
  continueShift,
  startShift,
  startTraining,
  timeout,
  type GameState,
} from '../src/session-logic.ts';
import { submitRun } from './store.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUN = /^run-\d{10,16}$/;

type Live = {
  conductorId: string;
  state: GameState;
  sockets: Set<WebSocket>;
  timer: ReturnType<typeof setTimeout> | null;
};

const sessions = new Map<string, Live>();

function send(socket: WebSocket, msg: ServerMsg) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function broadcast(live: Live) {
  const msg: ServerMsg = { type: 'state', state: live.state };
  for (const socket of live.sockets) send(socket, msg);
}

function clearTimer(live: Live) {
  if (live.timer) {
    clearTimeout(live.timer);
    live.timer = null;
  }
}

function armTimer(live: Live) {
  clearTimer(live);
  const { deadlineAt } = live.state;
  if (!deadlineAt) return;
  live.timer = setTimeout(() => {
    const next = timeout(live.state);
    if (next === live.state) return;
    apply(live, next);
  }, Math.max(0, deadlineAt - Date.now()));
}

function persistIfDone(live: Live) {
  if (live.state.phase !== 'debrief') return;
  if (!UUID.test(live.conductorId)) return;
  try {
    submitRun({
      conductorId: live.conductorId,
      id: live.state.runId,
      mode: live.state.mode,
      queue: live.state.queue,
      history: live.state.history,
    });
  } catch (error) {
    console.error(error);
  }
}

function apply(live: Live, next: GameState) {
  live.state = next;
  armTimer(live);
  persistIfDone(live);
  broadcast(live);
}

function startFrom(msg: Extract<ClientMsg, { type: 'session.start' }>): GameState {
  if (!RUN.test(msg.runId)) throw new Error('Некорректный идентификатор прохождения');
  if (msg.mode === 'training') {
    const id = msg.queue[0];
    if (!id) throw new Error('Нет сценария тренировки');
    return startTraining(id, msg.runId);
  }
  return startShift(msg.runId);
}

function handle(live: Live, msg: ClientMsg) {
  switch (msg.type) {
    case 'session.start':
      return;
    case 'arrived':
      apply(live, arrive(live.state, msg.car));
      return;
    case 'choice': {
      if (live.state.nodeId !== msg.nodeId) {
        throw new Error('Узел уже сменился');
      }
      apply(live, choose(live.state, msg.choiceId));
      return;
    }
    case 'ack_ending':
      apply(live, ackEnding(live.state));
      return;
    case 'continue':
      apply(live, continueShift(live.state));
      return;
    default:
      throw new Error('Неизвестная команда');
  }
}

function bind(socket: WebSocket, conductorId: string) {
  let live: Live | null = null;

  socket.on('message', (raw) => {
    const msg = parseClientMsg(String(raw));
    if (!msg) {
      send(socket, { type: 'error', message: 'Непонятный кадр' });
      return;
    }
    try {
      if (msg.type === 'session.start') {
        const existing = sessions.get(msg.runId);
        if (existing) {
          if (existing.conductorId && existing.conductorId !== conductorId) {
            send(socket, { type: 'error', message: 'Смена уже занята' });
            return;
          }
          existing.conductorId = conductorId || existing.conductorId;
          existing.sockets.add(socket);
          live = existing;
          send(socket, { type: 'state', state: existing.state });
          return;
        }
        live = {
          conductorId,
          state: startFrom(msg),
          sockets: new Set([socket]),
          timer: null,
        };
        sessions.set(live.state.runId, live);
        send(socket, { type: 'state', state: live.state });
        return;
      }
      if (!live) {
        send(socket, { type: 'error', message: 'Сначала откройте смену' });
        return;
      }
      handle(live, msg);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка сессии';
      send(socket, { type: 'error', message });
    }
  });

  socket.on('close', () => {
    if (!live) return;
    live.sockets.delete(socket);
    if (live.sockets.size === 0 && live.state.phase === 'debrief') {
      clearTimer(live);
      sessions.delete(live.state.runId);
    }
  });
}

export function attachSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/api/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });
  wss.on('connection', (ws, req: IncomingMessage) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const conductorId = url.searchParams.get('conductorId') ?? '';
    bind(ws, UUID.test(conductorId) ? conductorId : '');
  });
}
