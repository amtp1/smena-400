import { useEffect, useState } from 'react';
import { fetchLeaderboard } from '../api';
import { loadProfile } from '../storage';
import type { LeaderboardRow } from '../types';

const SCOPES = [
  { id: 'brigade', label: 'Бригада' },
  { id: 'depot', label: 'Депо' },
  { id: 'company', label: 'Компания' },
] as const;

export function LeaderboardPage() {
  const [scope, setScope] = useState<(typeof SCOPES)[number]['id']>('brigade');
  const [title, setTitle] = useState('Ваша бригада');
  const [rows, setRows] = useState<LeaderboardRow[]>(() => loadProfile().leaderboard);

  useEffect(() => {
    void fetchLeaderboard(scope).then((data) => {
      if (!data) return;
      setRows(data.rows);
      setTitle(data.label);
    });
  }, [scope]);

  return (
    <main className="page board">
      <header className="page-head">
        <p className="eyebrow">Сравнение смен</p>
        <h1>Таблица лидеров</h1>
        <p>{title}. В зачёт идёт лучший балл смены.</p>
      </header>
      <div className="scopes">
        {SCOPES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === scope ? 'is-on' : ''}
            onClick={() => setScope(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <ol className="board-list">
        {rows.map((row, index) => (
          <li key={row.id ?? `${row.name}-${row.score}`} className={row.me ? 'is-me' : ''}>
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
