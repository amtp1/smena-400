import Phaser from 'phaser';
import type { HotspotKind } from '../types';
import { BootScene } from './scenes/BootScene';
import { CarScene } from './scenes/CarScene';

export type CabinSync = {
  car: number;
  enterFrom: 'left' | 'right' | 'center';
  objectiveCar: number | null;
  hotspotKind: HotspotKind | null;
  hotspotSeat?: string;
  locked: boolean;
  canInteract: boolean;
};

export type CabinHandle = {
  sync: (next: CabinSync) => void;
  destroy: () => void;
};

export function createCabinGame(
  parent: HTMLElement,
  initial: CabinSync,
  handlers: {
    onCarChange: (car: number, enterFrom: 'left' | 'right') => void;
    onArrive: () => void;
  },
): CabinHandle {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth || 1100,
    height: parent.clientHeight || 360,
    backgroundColor: '#0a1820',
    banner: false,
    audio: { noAudio: true },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, CarScene],
  });

  game.registry.set('cabin', initial);
  game.registry.set('onCarChange', handlers.onCarChange);
  game.registry.set('onArrive', handlers.onArrive);

  return {
    sync(next) {
      game.registry.set('cabin', next);
      game.events.emit('cabin-sync', next);
    },
    destroy() {
      game.destroy(true);
    },
  };
}
