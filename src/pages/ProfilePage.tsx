import { useEffect, useMemo, useState } from 'react';
import { summarizeActivity } from '../analytics';
import { ACHIEVEMENTS } from '../achievements';
import { fetchAnalytics, fetchProfile } from '../api';
import { COMPETENCY_IDS, COMPETENCY_LABEL, GRADE_LABEL, levelFromXp } from '../engine';
import { conductorId, loadProfile } from '../storage';
import type { AnalyticsReport, PublicProfile } from '../types';

export function ProfilePage() {
  const local = useMemo(() => loadProfile(), []);
  const [remote, setRemote] = useState<PublicProfile | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsReport | null>(null);

  useEffect(() => {
    const id = conductorId();
    if (!id) return;
    void fetchProfile(id).then(setRemote);
    void fetchAnalytics(id).then((report) => {
      if (report) setAnalytics(report);
    });
  }, []);

  const name = remote?.displayName || local.name;
  const xp = remote?.xp ?? local.xp;
  const competencies = remote?.competencies ?? local.competencies;
  const achievements = remote?.achievements ?? local.achievements;
  const level = remote ? { level: remote.level, title: remote.levelTitle } : levelFromXp(xp);
  const report = analytics ?? summarizeActivity({ runs: local.runs, competencies });
  const last = local.runs[0];

  return (
    <main className="page profile">
      <header className="page-head">
        <p className="eyebrow">Личное дело</p>
        <h1>{name || 'Проводник без бейджа'}</h1>
        <p>
          Уровень {level.level} · {level.title}
          {' · '}
          {report.runs === 1 ? '1 прохождение' : `${report.runs} прохождений`}
          {' · '}
          {xp} баллов
        </p>
      </header>

      {remote && remote.expiringPoints > 0 && (
        <p className="banner">
          {remote.expiringPoints} баллов скоро сгорят. Закройте сценарий, чтобы удержать прогресс.
        </p>
      )}

      <section>
        <p className="kicker">Компетенции</p>
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

      <section>
        <p className="kicker">Пробелы</p>
        {report.gaps.length === 0 ? (
          <p className="muted">Явных провалов нет. Шкалы выше порога или смен ещё не было.</p>
        ) : (
          <ul className="gap-list">
            {report.gaps.map((gap) => (
              <li key={gap.id}>
                <b>
                  {gap.label} · {gap.value}
                </b>
                <span>{gap.hint}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted statline">
          Средний балл {report.avgScore} · срыв таймера {report.timeoutRate}% · быстрые решения{' '}
          {report.fastRate}%
        </p>
      </section>

      <section>
        <p className="kicker">Кейсы</p>
        <ul className="gap-list">
          {report.scenarios.map((scenario) => (
            <li key={scenario.id}>
              <b>{scenario.title}</b>
              <span>
                {scenario.attempts === 0
                  ? 'Ещё не проходили'
                  : `${scenario.attempts} попыт. · отлично ${scenario.excellent}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p className="kicker">Отметки</p>
        <ul className="ach-grid">
          {ACHIEVEMENTS.map((item) => {
            const on = achievements.includes(item.id);
            return (
              <li key={item.id} className={on ? 'is-on' : ''}>
                <b>{item.title}</b>
                <span>{item.hint}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {last && (
        <section>
          <p className="kicker">Последний заход</p>
          <p>
            {last.score} баллов · {last.grades.map((grade) => GRADE_LABEL[grade]).join(' · ')}
          </p>
        </section>
      )}
    </main>
  );
}
