import type { HotspotKind, ScenarioHotspot, ScenarioNode } from '../types';

export const CAR_MIN = 1;
export const CAR_MAX = 8;
export const START_CAR = 5;
export const CAR_WIDTH = 1680;
export const CAR_HEIGHT = 420;

export type ResolvedHotspot = ScenarioHotspot & {
  x: number;
  car: number;
  label: string;
};

export function hotspotX(kind: HotspotKind, seat?: string) {
  if (kind === 'bag') return 1420;
  if (seat === '9C') return 880;
  if (seat === '4A' || seat === '4B') return 640;
  return 900;
}

export function resolveHotspot(node?: ScenarioNode | null): ResolvedHotspot | null {
  if (!node) return null;
  const hotspot = node.hotspot ?? (node.kind === 'beat' ? { kind: 'passenger' as const } : undefined);
  if (!hotspot) return null;
  return {
    ...hotspot,
    car: node.car,
    x: hotspotX(hotspot.kind, hotspot.seat),
    label: hotspot.kind === 'bag' ? 'Бесхозный предмет' : hotspot.seat ?? node.speaker ?? 'Пассажир',
  };
}

export function carClassLabel(car: number) {
  if (car <= 2) return 'Первый класс';
  if (car <= 4) return 'Бизнес';
  return 'Эконом';
}
