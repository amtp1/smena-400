import { useMemo } from 'react';
import { ACHIEVEMENTS } from '../achievements';
import { COMPETENCY_IDS, COMPETENCY_LABEL, GRADE_LABEL } from '../engine';
import { loadProfile } from '../storage';

export function ProfilePage() {
  const profile = useMemo(() => loadProfile(), []);
  const last = profile.runs[0];

  return (
    <main className="page profile">
      <header className="page-head">
        <p className="eyebrow">Личное дело</p>
        <h1>{profile.name || 'Проводник без бейджа'}</h1>
        <p>
          {profile.runs.length === 1
            ? '1 прохождение'
            : `${profile.runs.length} прохождений`}{' '}
          · {profile.xp} суммарных баллов
        </p>
      </header>

      <section>
        <p className="kicker">Компетенции</p>
        <ul className="comp-list">
          {COMPETENCY_IDS.map((id) => (
            <li key={id}>
              <span>{COMPETENCY_LABEL[id]}</span>
              <div className="meter-track">
                <div className="meter-fill teal" style={{ width: `${profile.competencies[id]}%` }} />
              </div>
              <b>{Math.round(profile.competencies[id])}</b>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p className="kicker">Отметки</p>
        <ul className="ach-grid">
          {ACHIEVEMENTS.map((item) => {
            const on = profile.achievements.includes(item.id);
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
            {last.score} баллов · {last.grades.map((g) => GRADE_LABEL[g]).join(' · ')}
          </p>
        </section>
      )}
    </main>
  );
}
