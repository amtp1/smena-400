import { useNavigate } from 'react-router-dom';
import { SHIFT_BRIEFING, SHIFT_ORDER, SCENARIOS } from '../data';
import { useGame } from '../game-context';

export function BriefingPage() {
  const navigate = useNavigate();
  const { state, startShift } = useGame();

  function begin() {
    if (state.phase !== 'playing') startShift();
    navigate('/play');
  }

  return (
    <main className="page briefing">
      <header className="brief-head">
        <p className="eyebrow">Предрейсовый брифинг</p>
        <h1>{SHIFT_BRIEFING.train}</h1>
        <p>
          {SHIFT_BRIEFING.route} · {SHIFT_BRIEFING.speed}
        </p>
      </header>
      <div className="brief-grid">
        <dl className="facts">
          <div>
            <dt>Время в пути</dt>
            <dd>{SHIFT_BRIEFING.duration}</dd>
          </div>
          <div>
            <dt>Пассажиры</dt>
            <dd>{SHIFT_BRIEFING.passengers}</dd>
          </div>
          <div>
            <dt>VIP</dt>
            <dd>{SHIFT_BRIEFING.vip}</dd>
          </div>
          <div>
            <dt>Следующая станция</dt>
            <dd>{SHIFT_BRIEFING.nextStop}</dd>
          </div>
          <div>
            <dt>Погода</dt>
            <dd>{SHIFT_BRIEFING.weather}</dd>
          </div>
        </dl>
        <section>
          <p className="kicker">Отметки смены</p>
          <ul className="notes">
            {SHIFT_BRIEFING.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <p className="kicker">Ожидаемые события</p>
          <ul className="notes">
            {SHIFT_ORDER.map((id) => (
              <li key={id}>{SCENARIOS[id].title}</li>
            ))}
          </ul>
        </section>
      </div>
      <button type="button" className="btn gold" onClick={begin}>
        Выйти к составу
      </button>
    </main>
  );
}
