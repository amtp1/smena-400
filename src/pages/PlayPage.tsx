import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GradeTag, Meter, TimerRing, TrainMap } from '../components/ui';
import { scenarioById } from '../data';
import { getNode } from '../engine';
import { formatClock, useGame } from '../game-context';

export function PlayPage() {
  const navigate = useNavigate();
  const { state, choose, timeout, ackEnding, continueShift } = useGame();
  const [remaining, setRemaining] = useState(0);
  const timeoutRef = useRef(timeout);
  timeoutRef.current = timeout;

  useEffect(() => {
    if (state.phase === 'idle') navigate('/', { replace: true });
    if (state.phase === 'debrief') navigate('/debrief', { replace: true });
  }, [state.phase, navigate]);

  const scenario =
    state.queue[state.queueIndex] ? scenarioById(state.queue[state.queueIndex]) : null;
  const node = scenario ? getNode(scenario, state.nodeId) : undefined;
  const timed = Boolean(state.phase === 'playing' && node?.kind === 'beat' && node.timerSec);

  useEffect(() => {
    if (!timed || !node?.timerSec) {
      setRemaining(0);
      return;
    }
    const total = node.timerSec * 1000;
    const started = Date.now();
    let fired = false;
    const tick = () => {
      const left = Math.max(0, total - (Date.now() - started));
      setRemaining(left / 1000);
      if (left <= 0 && !fired) {
        fired = true;
        timeoutRef.current();
      }
    };
    tick();
    const id = window.setInterval(tick, 50);
    return () => window.clearInterval(id);
  }, [timed, node?.id, node?.timerSec, state.queueIndex]);

  const onChoose = useCallback(
    (choiceId: string) => {
      choose(choiceId, remaining);
    },
    [choose, remaining],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!node?.choices || node.kind !== 'beat') return;
      const index = Number(event.key) - 1;
      if (index >= 0 && node.choices[index]) onChoose(node.choices[index].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [node, onChoose]);

  if (state.phase === 'between' && scenario) {
    const next = scenarioById(state.queue[state.queueIndex + 1]);
    return (
      <main className="play between">
        <p className="eyebrow">Событие закрыто</p>
        <h1>Следующее не ждёт разбора</h1>
        <p className="lede">{next.title}. Состав идёт {formatClock(state.clockMin)}.</p>
        <button type="button" className="btn gold" onClick={continueShift}>
          К следующему вызову
        </button>
      </main>
    );
  }

  if (!scenario || !node) return null;

  return (
    <main className="play">
      <section className="hud">
        <div>
          <p className="eyebrow">
            {state.mode === 'shift' ? 'Смена' : 'Тренировка'} · {formatClock(state.clockMin)}
          </p>
          <h1>{scenario.title}</h1>
        </div>
        <Meter label="Лояльность" value={state.loyalty} tone="gold" />
        <Meter label="Безопасность" value={state.safety} tone="teal" />
        {timed && node.timerSec ? (
          <TimerRing remaining={remaining} total={node.timerSec} />
        ) : (
          <div className="timer is-idle">
            <span>—</span>
          </div>
        )}
      </section>

      <TrainMap active={node.car} />

      <section className="stage">
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
    </main>
  );
}
