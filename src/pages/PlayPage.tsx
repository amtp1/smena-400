import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CabinView } from '../game/CabinView';
import type { CabinSync } from '../game/CabinGame';
import { resolveHotspot, START_CAR } from '../game/hotspots';
import { GradeTag, Meter, TimerRing, TrainMap } from '../components/ui';
import { scenarioById } from '../data';
import { getNode } from '../engine';
import { formatClock, objectiveFor, radioFor, useGame } from '../game-context';

export function PlayPage() {
  const navigate = useNavigate();
  const { state, linking, arrive, choose, timeout, ackEnding, continueShift } = useGame();
  const [playerCar, setPlayerCar] = useState(START_CAR);
  const [enterFrom, setEnterFrom] = useState<CabinSync['enterFrom']>('center');
  const [remaining, setRemaining] = useState(0);
  const timeoutRef = useRef(timeout);
  useEffect(() => {
    timeoutRef.current = timeout;
  }, [timeout]);

  useEffect(() => {
    if (state.phase === 'idle') navigate('/', { replace: true });
    if (state.phase === 'debrief') navigate('/debrief', { replace: true });
  }, [state.phase, navigate]);

  const scenario =
    state.queue[state.queueIndex] ? scenarioById(state.queue[state.queueIndex]) : null;
  const node = scenario ? getNode(scenario, state.nodeId) : undefined;
  const radio = radioFor(state);
  const objective = objectiveFor(state);
  const startNode = scenario ? getNode(scenario, scenario.startId) : undefined;
  const hotspot = resolveHotspot(startNode);
  const engaged = state.phase === 'playing' && state.engaged;
  const timed = Boolean(engaged && node?.kind === 'beat' && state.deadlineAt);

  useEffect(() => {
    if (!timed || !state.deadlineAt || !node?.timerSec) {
      setRemaining(0);
      return;
    }
    const ends = state.deadlineAt;
    let fired = false;
    const tick = () => {
      const left = Math.max(0, ends - Date.now());
      setRemaining(left / 1000);
      if (left <= 0 && !fired) {
        fired = true;
        timeoutRef.current();
      }
    };
    tick();
    const id = window.setInterval(tick, 50);
    return () => window.clearInterval(id);
  }, [timed, state.deadlineAt, node?.id, node?.timerSec]);

  const onChoose = useCallback(
    (choiceId: string) => {
      choose(choiceId, remaining);
    },
    [choose, remaining],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!engaged || !node?.choices || node.kind !== 'beat') return;
      const index = Number(event.key) - 1;
      if (index >= 0 && node.choices[index]) onChoose(node.choices[index].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engaged, node, onChoose]);

  const cabin = useMemo<CabinSync>(
    () => ({
      car: playerCar,
      enterFrom,
      objectiveCar: objective?.car ?? null,
      hotspotKind: hotspot?.kind ?? null,
      hotspotSeat: hotspot?.seat,
      locked: engaged || state.phase === 'between',
      canInteract: !linking && state.phase === 'playing' && !state.engaged && node?.kind === 'beat',
    }),
    [playerCar, enterFrom, objective?.car, hotspot?.kind, hotspot?.seat, engaged, linking, state.phase, state.engaged, node?.kind],
  );

  const onCarChange = useCallback((car: number, from: 'left' | 'right') => {
    setEnterFrom(from);
    setPlayerCar(car);
  }, []);

  const onArrive = useCallback(() => {
    arrive(playerCar);
  }, [arrive, playerCar]);

  if (state.phase === 'idle') return null;

  return (
    <main className="play play-cabin">
      <section className="hud">
        <div>
          <p className="eyebrow">
            {state.mode === 'shift' ? 'Смена' : 'Тренировка'} · {formatClock(state.clockMin)}
            {linking ? ' · рация…' : ''}
          </p>
          <h1>{scenario?.title ?? 'Состав'}</h1>
        </div>
        <Meter label="Лояльность" value={state.loyalty} tone="gold" />
        <Meter label="Безопасность" value={state.safety} tone="teal" />
        {timed && node?.timerSec ? (
          <TimerRing remaining={remaining} total={node.timerSec} />
        ) : (
          <div className="timer is-idle">
            <span>—</span>
          </div>
        )}
      </section>

      <TrainMap active={playerCar} target={objective?.car} />

      <div className="cabin-frame">
        <CabinView cabin={cabin} onCarChange={onCarChange} onArrive={onArrive} />
        {radio && !engaged && state.phase !== 'debrief' && (
          <aside className="radio-toast">
            <p className="kicker">Рация · вагон {radio.car}</p>
            <p>{radio.text}</p>
          </aside>
        )}
      </div>

      {state.phase === 'between' && scenario && (
        <section className="between-card">
          <p className="eyebrow">Событие закрыто</p>
          <h2>Следующее не ждёт разбора</h2>
          <p className="lede">
            {scenarioById(state.queue[state.queueIndex + 1]).title}. Состав идёт {formatClock(state.clockMin)}.
          </p>
          <button type="button" className="btn gold" onClick={continueShift}>
            К следующему вызову
          </button>
        </section>
      )}

      {engaged && node && (
        <section className="stage dialogue-dock">
          <aside className="place">
            <p className="kicker">Где</p>
            <p>{node.location}</p>
            {node.speaker && (
              <>
                <p className="kicker">Кто</p>
                <p>
                  <b>{node.speaker}</b>
                  {node.speakerRole ? <small> · {node.speakerRole}</small> : null}
                </p>
              </>
            )}
            <p className="progress">
              Событие {state.queueIndex + 1} / {state.queue.length}
            </p>
          </aside>

          <article className="beat">
            <h2>{node.title}</h2>
            <p>{node.body}</p>

            {node.kind === 'ending' && node.ending && (
              <div className="ending">
                <GradeTag grade={node.ending.grade} />
                <p>{node.ending.summary}</p>
                <button type="button" className="btn gold" onClick={ackEnding}>
                  {state.queueIndex < state.queue.length - 1 ? 'Дальше по рейсу' : 'Разбор смены'}
                </button>
              </div>
            )}

            {node.kind === 'beat' && node.choices && (
              <ol className="choices">
                {node.choices.map((choice, index) => (
                  <li key={choice.id}>
                    <button type="button" onClick={() => onChoose(choice.id)}>
                      <span>{index + 1}</span>
                      {choice.text}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </article>
        </section>
      )}
    </main>
  );
}
