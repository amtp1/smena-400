import { conductorId } from '../storage';
import type { ClientMsg, ServerMsg } from './protocol';

export type LiveSocket = {
  send: (msg: ClientMsg) => void;
  close: () => void;
};

export function openLiveSession(handlers: {
  onState: (msg: Extract<ServerMsg, { type: 'state' }>) => void;
  onError: (message: string) => void;
  onStatus: (live: boolean) => void;
}): LiveSocket {
  const id = conductorId();
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${window.location.host}/api/ws${id ? `?conductorId=${encodeURIComponent(id)}` : ''}`;
  const ws = new WebSocket(url);
  let opened = false;

  ws.addEventListener('open', () => {
    opened = true;
    handlers.onStatus(true);
  });

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(String(event.data)) as ServerMsg;
      if (msg.type === 'state') handlers.onState(msg);
      if (msg.type === 'error') handlers.onError(msg.message);
    } catch {
      handlers.onError('Битый кадр рации');
    }
  });

  ws.addEventListener('close', () => {
    handlers.onStatus(false);
  });

  ws.addEventListener('error', () => {
    if (!opened) handlers.onStatus(false);
  });

  return {
    send(msg) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close() {
      ws.close();
    },
  };
}
