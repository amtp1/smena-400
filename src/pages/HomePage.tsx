import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ensureProfile } from '../api';
import { SCENARIOS, SHIFT_ORDER } from '../data';
import { useGame } from '../game-context';
import { loadProfile, setConductorName } from '../storage';

export function HomePage() {
  const navigate = useNavigate();
  const { startShift } = useGame();
  const profile = useMemo(() => loadProfile(), []);
  const [name, setName] = useState(profile.name);
  const [saved, setSaved] = useState(Boolean(profile.name));

  async function onName(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setConductorName(name);
    await ensureProfile(name);
    setSaved(true);
  }

  async function goShift() {
    if (!name.trim()) return;
    setConductorName(name);
    await ensureProfile(name);
    startShift();
    navigate('/briefing');
  }

  return (
    <main className="page home">
      <div className="watermark">400</div>
      <section className="hero">
        <p className="eyebrow">ВСМ · обучение смены</p>
        <h1>
          Решения за секунды.
          <br />
          Цена — на 400 км/ч.
        </h1>
        <p className="lede">
          Смена из трёх нештатных ситуаций. Таймер, ветки и две шкалы: лояльность пассажира против
          рейтинга безопасности. На 400 км/ч вежливость и протокол часто спорят.
        </p>
        <form className="badge-form" onSubmit={onName}>
          <label>
            Бейдж проводника
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Фамилия и инициалы"
              maxLength={40}
            />
          </label>
          <button type="submit" className="btn ghost">
            {saved ? 'Сохранено' : 'Закрепить'}
          </button>
        </form>
        <div className="hero-actions">
          <button type="button" className="btn gold" onClick={goShift} disabled={!name.trim()}>
            Начать смену
          </button>
          <Link className="btn ghost" to="/training">
            Разбор по кейсам
          </Link>
        </div>
      </section>
      <aside className="home-side">
        <p className="kicker">Три события рейса</p>
        <ol className="event-list">
          {SHIFT_ORDER.map((id, index) => {
            const scenario = SCENARIOS[id];
            return (
              <li key={id}>
                <span>0{index + 1}</span>
                <div>
                  <b>{scenario.title}</b>
                  <small>{scenario.threat}</small>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="note">
          Сценарии — граф с ветками, не квиз. Ошибка в первых секундах меняет финал, а не только
          баллы.
        </p>
      </aside>
    </main>
  );
}
