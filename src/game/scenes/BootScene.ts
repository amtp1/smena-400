import Phaser from 'phaser';

function stamp(scene: Phaser.Scene, key: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
  const g = scene.add.graphics();
  g.setVisible(false);
  draw(g);
  g.generateTexture(key, width, height);
  g.destroy();
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create() {
    stamp(this, 'conductor', 28, 56, (g) => {
      g.fillStyle(0x0c1d27);
      g.fillRect(6, 16, 16, 28);
      g.fillStyle(0xc9a56a);
      g.fillRect(6, 30, 16, 5);
      g.fillStyle(0xead7b1);
      g.fillCircle(14, 10, 8);
      g.fillStyle(0x112430);
      g.fillRect(8, 44, 5, 12);
      g.fillRect(16, 44, 5, 12);
    });

    stamp(this, 'passenger', 26, 52, (g) => {
      g.fillStyle(0x8ea3b0);
      g.fillRect(6, 16, 14, 24);
      g.fillStyle(0xc5d4dc);
      g.fillCircle(13, 10, 7);
      g.fillStyle(0x5d7380);
      g.fillRect(7, 40, 5, 12);
      g.fillRect(14, 40, 5, 12);
    });

    stamp(this, 'bag', 28, 22, (g) => {
      g.fillStyle(0x1a1a1a);
      g.fillRoundedRect(2, 6, 24, 16, 3);
      g.lineStyle(2, 0x3a3a3a);
      g.strokeRoundedRect(8, 1, 12, 8, 2);
    });

    stamp(this, 'seat', 40, 32, (g) => {
      g.fillStyle(0x1d3340);
      g.fillRect(2, 10, 36, 20);
      g.fillStyle(0xc9a56a);
      g.fillRect(2, 8, 36, 4);
      g.fillStyle(0x16303b);
      g.fillRect(6, 0, 28, 12);
    });

    stamp(this, 'window', 54, 40, (g) => {
      g.fillStyle(0x0a2430);
      g.fillRoundedRect(0, 0, 54, 40, 4);
      g.fillStyle(0x1c4c58);
      g.fillRoundedRect(4, 4, 46, 32, 3);
      g.fillStyle(0x2f9d90, 0.18);
      g.fillRect(8, 8, 18, 12);
    });

    stamp(this, 'door', 36, 90, (g) => {
      g.fillStyle(0x1a303b);
      g.fillRect(0, 0, 36, 90);
      g.lineStyle(2, 0xc9a56a, 0.7);
      g.strokeRect(3, 3, 30, 84);
      g.fillStyle(0xc9a56a);
      g.fillRect(24, 42, 6, 6);
    });

    stamp(this, 'pulse', 48, 48, (g) => {
      g.fillStyle(0xc9a56a, 0.28);
      g.fillCircle(24, 24, 22);
      g.fillStyle(0xc9a56a, 0.55);
      g.fillCircle(24, 24, 8);
    });

    this.scene.start('car');
  }
}
