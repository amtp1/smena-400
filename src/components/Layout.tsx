import { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { loadProfile } from '../storage';
import { Notifications } from './Notifications';

const LINKS = [
  { to: '/', label: 'Рейс' },
  { to: '/training', label: 'Тренировка' },
  { to: '/profile', label: 'Профиль' },
  { to: '/leaderboard', label: 'Бригада' },
];

export function Layout() {
  const location = useLocation();
  const play = location.pathname.startsWith('/play');
  const name = useMemo(() => loadProfile().name, [location.pathname]);

  return (
    <div className={`shell ${play ? 'is-play' : ''}`}>
      <header className="top">
        <NavLink to="/" className="brand">
          <span className="brand-mark">400</span>
          <span>
            <b>Смена 400</b>
            <small>Тренажёр проводника ВСМ</small>
          </span>
        </NavLink>
        {!play && (
          <nav className="nav">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === '/'}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}
        <div className="top-tools">
          {!play && <Notifications />}
          <div className="top-name">{name || 'Без бейджа'}</div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
