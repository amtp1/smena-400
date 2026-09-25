import { GRADE_LABEL } from '../engine';
import type { EndingGrade } from '../types';

export function Meter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'gold' | 'teal';
}) {
  return (
    <div className={`meter meter-${tone}`}>
      <div className="meter-head">
        <span>{label}</span>
        <b>{Math.round(value)}</b>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function TimerRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const ratio = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 1;
  const urgent = remaining <= 5;
  return (
    <div className={`timer ${urgent ? 'is-urgent' : ''}`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="timer-bg" />
        <circle
          cx="32"
          cy="32"
          r={r}
          className="timer-fg"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
        />
      </svg>
      <span>{Math.ceil(Math.max(0, remaining))}</span>
    </div>
  );
}

export function TrainMap({ active, target }: { active: number; target?: number | null }) {
  const cars = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  return (
    <div className="train" aria-label="Схема состава">
      {cars.map((car) => (
        <div
          key={car}
          className={`train-car ${car === 0 ? 'is-loco' : ''} ${car === active ? 'is-on' : ''} ${
            target && car === target && car !== active ? 'is-target' : ''
          }`}
          title={car === 0 ? 'Головной' : `Вагон ${car}`}
        >
          {car === 0 ? '▶' : car}
        </div>
      ))}
    </div>
  );
}

export function GradeTag({ grade }: { grade: EndingGrade }) {
  return <span className={`grade grade-${grade}`}>{GRADE_LABEL[grade]}</span>;
}
