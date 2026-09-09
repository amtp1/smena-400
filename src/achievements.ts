import type { RunRecord } from './types';

export type Achievement = {
  id: string;
  title: string;
  hint: string;
};

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-run',
    title: 'Первая смена',
    hint: 'Завершите любой сценарий',
  },
  {
    id: 'shift-complete',
    title: 'Рейс целиком',
    hint: 'Пройдите все три события одной сменой',
  },
  {
    id: 'safety-first',
    title: 'Сначала безопасность',
    hint: 'Завершите попытку с рейтингом безопасности ≥ 80',
  },
  {
    id: 'excellent',
    title: 'Безупречный протокол',
    hint: 'Получите оценку «отлично»',
  },
  {
    id: 'medic',
    title: 'Врач вызван вовремя',
    hint: 'В медицинском кейсе вызовите врача состава сразу',
  },
  {
    id: 'do-not-touch',
    title: 'Не вскрывать',
    hint: 'Не открывайте бесхозную сумку',
  },
  {
    id: 'vip-calm',
    title: 'Премиум без претензии',
    hint: 'Закройте конфликт, удержав лояльность',
  },
  {
    id: 'quick',
    title: 'Запас в десять секунд',
    hint: 'Примите решение, оставив ≥ 10 секунд на таймере',
  },
  {
    id: 'no-timeout',
    title: 'Холодная голова',
    hint: 'Пройдите смену без срыва таймера',
  },
];

export function unlockAchievements(run: RunRecord, already: string[]) {
  const next: string[] = [];
  const has = (id: string) => already.includes(id) || next.includes(id);
  const add = (id: string) => {
    if (!has(id)) next.push(id);
  };

  add('first-run');
  if (run.mode === 'shift' && run.scenarioIds.length >= 3) add('shift-complete');
  if (run.safety >= 80) add('safety-first');
  if (run.grades.includes('excellent')) add('excellent');
  if (run.flags.includes('called_doctor_early')) add('medic');
  if (run.flags.includes('not_opened_bag')) add('do-not-touch');
  if (run.flags.includes('vip_held')) add('vip-calm');
  if (run.flags.includes('fast_decision')) add('quick');
  if (run.mode === 'shift' && !run.flags.includes('timeout')) add('no-timeout');

  return next;
}
