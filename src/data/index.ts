import { conflict } from './conflict';
import { medical } from './medical';
import { suspicious } from './suspicious';
import type { Scenario } from '../types';

export const SCENARIOS: Record<string, Scenario> = {
  medical,
  conflict,
  suspicious,
};

export const SHIFT_ORDER = ['medical', 'conflict', 'suspicious'] as const;

export const SHIFT_BRIEFING = {
  train: 'ВСМ-001 «Нева»',
  route: 'Москва — Санкт-Петербург',
  speed: 'до 400 км/ч',
  duration: '2 ч 15 мин',
  passengers: 412,
  vip: 11,
  nextStop: 'Тверь, 18 минут',
  weather: 'Дождь, мокрый перрон',
  notes: [
    'Вагон 2 — делегация партнёра, премиум чувствителен к сценам.',
    'Вагон 4 — отметка сопровождения: пассажир 55+ с супругой.',
    'На этой скорости экстренная остановка — не жест заботы, а отдельный риск.',
  ],
};

export function scenarioById(id: string): Scenario {
  const scenario = SCENARIOS[id];
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  return scenario;
}
