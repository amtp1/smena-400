import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ACHIEVEMENTS, unlockAchievements } from '../achievements';
import { submitRun } from '../api';
import { GradeTag, Meter } from '../components/ui';
import { SCENARIOS } from '../data';
import { COMPETENCY_IDS, COMPETENCY_LABEL } from '../engine';
import { useGame } from '../game-context';
import { replay, type DecisionReview } from '../replay';
import { loadProfile, mirrorRemote, recordRun } from '../storage';
import type { RunRecord } from '../types';

export function DebriefPage() {
  const navigate = useNavigate();
  const { state, score, reset } = useGame();
  const saved = useRef(false);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const [shownScore, setShownScore] = useState<number | null>(null);

  const played = useMemo(() => {
    if (state.phase !== 'debrief') return null;
    try {
      return replay({ mode: state.mode, queue: state.queue, history: state.history });
    } catch {
      return null;
    }
  }, [state]);

  useEffect(() => {
    if (state.phase !== 'debrief') {
      navigate('/', { replace: true });
      return;
    }
    if (saved.current) return;
    saved.current = true;

    const source = played;
    const run: RunRecord = {
      id: state.runId || `run-${Date.now()}`,
      at: Date.now(),
      mode: state.mode,
      score: source?.score ?? score,
      loyalty: source?.loyalty ?? state.loyalty,
      safety: source?.safety ?? state.safety,
      competencies: source?.competencies ?? state.competencies,
      grades: source?.grades ?? state.results.map((item) => item.grade),
      flags: source?.flags ?? state.flags,
      scenarioIds: source?.scenarioIds ?? state.results.map((item) => item.scenarioId),
    };
    const fresh = unlockAchievements(run, loadProfile().achievements);
    setUnlocked(fresh);

    void submitRun({
      id: run.id,
      mode: state.mode,
      queue: state.queue,
      history: state.history,
    }).then((remote) => {
      if (!remote) {
        recordRun(run, fresh);
        return;
      }
      mirrorRemote({
        profile: remote.profile,
        run: { ...run, score: remote.score },
      });
      setUnlocked(remote.unlocked);
      setShownScore(remote.score);
    });
  }, [state, score, played, navigate]);

  if (state.phase !== 'debrief') return null;

  const review: DecisionReview[] = played?.review ?? [];
  const total = shownScore ?? played?.score ?? score;
  const loyalty = played?.loyalty ?? state.loyalty;
  const safety = played?.safety ?? state.safety;
  const competencies = played?.competencies ?? state.competencies;
  const results = played?.results ?? state.results;

  return (
    <main className="page debrief">
      <header className="page-head">
        <p className="eyebrow">Разбор полёта</p>
        <h1>Итог {state.mode === 'shift' ? 'смены' : 'кейса'}</h1>
        <p className="scoreline">
          <b>{total}</b>
          <span>баллов компетенций</span>
        </p>
      </header>

      <div className="meters-row">
        <Meter label="Лояльность пассажира" value={loyalty} tone="gold" />
        <Meter label="Рейтинг безопасности" value={safety} tone="teal" />
      </div>

      <section className="results">
        {results.map((result) => (
          <article key={result.scenarioId} className="result">
            <div className="result-head">
              <h2>{SCENARIOS[result.scenarioId]?.title ?? result.title}</h2>
              <GradeTag grade={result.grade} />
            </div>
            <p>{result.summary}</p>
          </article>
        ))}
      </section>

      {review.length > 0 && (
        <section>
          <p className="kicker">Каждое решение</p>
          <ol className="review-list">
            {review.map((item, index) => (
              <li key={`${item.scenarioId}-${item.nodeTitle}-${index}`}>
                <b>
                  {index + 1}. {item.nodeTitle}
                </b>
                <span>{item.timedOut ? 'Время вышло' : item.choiceText}</span>
                <small>
                  {item.effectText}. Дальше: {item.nextTitle}
                </small>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <p className="kicker">Компетенции этой попытки</p>
        <ul className="comp-list">
          {COMPETENCY_IDS.map((id) => (
            <li key={id}>
              <span>{COMPETENCY_LABEL[id]}</span>
              <div className="meter-track">
                <div className="meter-fill teal" style={{ width: `${competencies[id]}%` }} />
              </div>
              <b>{Math.round(competencies[id])}</b>
            </li>
          ))}
        </ul>
      </section>

      {unlocked.length > 0 && (
        <section>
          <p className="kicker">Новые отметки</p>
          <ul className="ach-row">
            {unlocked.map((id) => {
              const item = ACHIEVEMENTS.find((achievement) => achievement.id === id);
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
