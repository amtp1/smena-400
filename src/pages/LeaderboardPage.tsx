import { useMemo } from 'react';
import { loadProfile } from '../storage';

export function LeaderboardPage() {
  const rows = useMemo(() => loadProfile().leaderboard, []);

  return (
    <main className="page board">
      <header className="page-head">
        <p className="eyebrow">Сравнение смен</p>
        <h1>Таблица лидеров</h1>
        <p>Лучший результат вашей бригады встаёт в общий ряд проводников.</p>
      </header>
      <ol className="board-list">
        {rows.map((row, index) => (
          <li key={`${row.name}-${row.score}`} className={row.me ? 'is-me' : ''}>
            <span className="pos">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <b>{row.name}</b>
              <small>{row.unit}</small>
            </div>
            <strong>{row.score}</strong>
          </li>
        ))}
      </ol>
    </main>
  );
}
