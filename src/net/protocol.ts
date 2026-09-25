import type { GameState } from '../session-logic';

export type ClientMsg =
  | { type: 'session.start'; mode: 'shift' | 'training'; queue: string[]; runId: string }
  | { type: 'arrived'; car: number }
  | { type: 'choice'; nodeId: string; choiceId: string }
  | { type: 'ack_ending' }
  | { type: 'continue' };

export type ServerMsg =
  | { type: 'state'; state: GameState }
  | { type: 'error'; message: string };

export function parseClientMsg(raw: string): ClientMsg | null {
  try {
    const data = JSON.parse(raw) as ClientMsg;
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}
