import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { runScore } from './engine';
import { openLiveSession, type LiveSocket } from './net/session';
import {
  ackEnding as applyAck,
  arrive as applyArrive,
  choose as applyChoose,
  continueShift as applyContinue,
  INITIAL_STATE,
  startShift as applyShift,
  startTraining as applyTraining,
  timeout as applyTimeout,
  type GameState,
} from './session-logic';
import { conductorId } from './storage';

export type { GamePhase, GameState } from './session-logic';
export { objectiveFor, radioFor } from './session-logic';

type GameContextValue = {
  state: GameState;
  live: boolean;
  linking: boolean;
  startShift: () => void;
  startTraining: (scenarioId: string) => void;
  arrive: (car: number) => void;
  choose: (choiceId: string, remainingSec: number) => void;
  timeout: () => void;
  ackEnding: () => void;
  continueShift: () => void;
  reset: () => void;
  score: number;
};

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const [live, setLive] = useState(false);
  const [linking, setLinking] = useState(false);
  const stateRef = useRef(state);
  const sockRef = useRef<LiveSocket | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!state.runId || state.phase === 'idle') return;
    if (!conductorId()) {
      setLive(false);
      setLinking(false);
      return;
    }

    setLinking(true);
    let settled = false;
    const settle = (online: boolean) => {
      if (settled) return;
      settled = true;
      setLive(online);
      setLinking(false);
    };

    const fallback = window.setTimeout(() => settle(false), 1200);
    const sock = openLiveSession({
      onState: (msg) => setState(msg.state),
      onError: () => {},
      onStatus: (online) => {
        if (online) {
          const current = stateRef.current;
          sock.send({
            type: 'session.start',
            mode: current.mode,
            queue: current.queue,
            runId: current.runId,
          });
          settle(true);
        } else {
          settle(false);
        }
      },
    });
    sockRef.current = sock;

    return () => {
      window.clearTimeout(fallback);
      sock.close();
      sockRef.current = null;
      setLive(false);
      setLinking(false);
    };
  }, [state.runId]);

  const score = useMemo(() => {
    const timeoutCount = state.history.filter((item) => item.choiceId === 'timeout').length;
    const fastDecisions = state.history.filter((item) => item.remainingSec >= 10).length;
    return runScore({
      loyalty: state.loyalty,
      safety: state.safety,
      competencies: state.competencies,
      grades: state.results.map((item) => item.grade),
      timeoutCount,
      fastDecisions,
    });
  }, [state]);

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      live,
      linking,
      startShift: () => {
        setLinking(Boolean(conductorId()));
        setState(applyShift());
      },
      startTraining: (scenarioId) => {
        setLinking(Boolean(conductorId()));
        setState(applyTraining(scenarioId));
      },
      arrive: (car) => {
        if (sockRef.current && live) sockRef.current.send({ type: 'arrived', car });
        else setState((prev) => applyArrive(prev, car));
      },
      choose: (choiceId, remainingSec) => {
        if (sockRef.current && live) {
          sockRef.current.send({ type: 'choice', nodeId: state.nodeId, choiceId });
        } else {
          setState((prev) => applyChoose(prev, choiceId, remainingSec));
        }
      },
      timeout: () => {
        if (live) return;
        setState((prev) => applyTimeout(prev));
      },
      ackEnding: () => {
        if (sockRef.current && live) sockRef.current.send({ type: 'ack_ending' });
        else setState((prev) => applyAck(prev));
      },
      continueShift: () => {
        if (sockRef.current && live) sockRef.current.send({ type: 'continue' });
        else setState((prev) => applyContinue(prev));
      },
      reset: () => setState(INITIAL_STATE),
      score,
    }),
    [state, live, linking, score],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame outside provider');
  return ctx;
}

export function formatClock(clockMin: number) {
  const h = Math.floor(clockMin / 60) % 24;
  const m = clockMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

