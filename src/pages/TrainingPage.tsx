import { Link } from 'react-router-dom';
import { ensureProfile } from '../api';
import { SCENARIOS } from '../data';
import { useGame } from '../game-context';
import { loadProfile } from '../storage';

export function TrainingPage() {
  const { startTraining } = useGame();

  return (
    <main className="page training">
      <header className="page-head">
        <p className="eyebrow">Отработка</p>
        <h1>Один кейс — все ветки</h1>
        <p>Шкалы сбрасываются. Это полигон, не рейс.</p>
      </header>
      <div className="cards">
        {Object.values(SCENARIOS).map((scenario) => (
          <article key={scenario.id} className="card">
            <p className="kicker">{scenario.subtitle}</p>
            <h2>{scenario.title}</h2>
            <p>{scenario.threat}</p>
            <p className="muted">{scenario.durationLabel}</p>
            <Link
              className="btn gold"
              to="/play"
              onClick={() => {
                const profile = loadProfile();
                if (profile.name) void ensureProfile(profile.name);
                startTraining(scenario.id);
              }}
            >
              Запустить
            </Link>
          </article>
        ))}
      </div>
    </main>
  );
}
