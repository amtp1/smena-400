import { useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ACHIEVEMENTS, unlockAchievements } from '../achievements';
import { GradeTag, Meter } from '../components/ui';
import { SCENARIOS } from '../data';
import { COMPETENCY_IDS, COMPETENCY_LABEL } from '../engine';
import { useGame } from '../game-context';
import { loadProfile, recordRun } from '../storage';
import type { RunRecord } from '../types';

export function DebriefPage() {
  const navigate = useNavigate();
  const { state, score, reset } = useGame();
  const saved = useRef(false);

  const flags = useMemo(() => {
    return state.flags.includes('opened_bag')
      ? state.flags.filter((flag) => flag !== 'not_opened_bag')
      : state.flags;
  }, [state.flags]);

  const unlocked = useMemo(() => {
    if (state.phase !== 'debrief') return [];
    const run: RunRecord = {
      id: state.runId || `run-${Date.now()}`,
      at: Date.now(),
      mode: state.mode,
      score,
      loyalty: state.loyalty,
      safety: state.safety,
      competencies: state.competencies,
      grades: state.results.map((item) => item.grade),
      flags,
      scenarioIds: state.results.map((item) => item.scenarioId),
    };
    return unlockAchievements(run, loadProfile().achievements);
  }, [state, score, flags]);

  useEffect(() => {
    if (state.phase !== 'debrief') {
      navigate('/', { replace: true });
      return;
    }
    if (saved.current) return;
    if (state.runId && loadProfile().runs.some((item) => item.id === state.runId)) return;
    saved.current = true;
    const run: RunRecord = {
      id: state.runId || `run-${Date.now()}`,
      at: Date.now(),
      mode: state.mode,
      score,
      loyalty: state.loyalty,
      safety: state.safety,
      competencies: state.competencies,
      grades: state.results.map((item) => item.grade),
      flags,
      scenarioIds: state.results.map((item) => item.scenarioId),
    };
    recordRun(run, unlocked);
  }, [state, score, flags, unlocked, navigate]);

  if (state.phase !== 'debrief') return null;

  return (
    <main className="page debrief">
      <header className="page-head">
        <p className="eyebrow">Разбор полёта</p>
        <h1>Итог {state.mode === 'shift' ? 'смены' : 'кейса'}</h1>
        <p className="scoreline">
          <b>{score}</b>
          <span>баллов компетенций</span>
        </p>
      </header>

      <div className="meters-row">
        <Meter label="Лояльность пассажира" value={state.loyalty} tone="gold" />
        <Meter label="Рейтинг безопасности" value={state.safety} tone="teal" />
      </div>

      <section className="results">
        {state.results.map((result) => (
          <article key={result.scenarioId} className="result">
            <div className="result-head">
              <h2>{SCENARIOS[result.scenarioId].title}</h2>
              <GradeTag grade={result.grade} />
            </div>
            <p>{result.summary}</p>
          </article>
        ))}
      </section>

      <section>
        <p className="kicker">Компетенции этой попытки</p>
        <ul className="comp-list">
          {COMPETENCY_IDS.map((id) => (
            <li key={id}>
              <span>{COMPETENCY_LABEL[id]}</span>
              <div className="meter-track">
                <div className="meter-fill teal" style={{ width: `${state.competencies[id]}%` }} />
              </div>
              <b>{Math.round(state.competencies[id])}</b>
            </li>
          ))}
        </ul>
      </section>

      {unlocked.length > 0 && (
        <section>
          <p className="kicker">Новые отметки</p>
          <ul className="ach-row">
            {unlocked.map((id) => {
              const item = ACHIEVEMENTS.find((a) => a.id === id);
              return <li key={id}>{item?.title}</li>;
            })}
          </ul>
        </section>
      )}

      <div className="hero-actions">
        <Link className="btn gold" to="/" onClick={reset}>
          На базу
        </Link>
        <Link className="btn ghost" to="/leaderboard">
          Таблица бригады
        </Link>
      </div>
    </main>
  );
}
