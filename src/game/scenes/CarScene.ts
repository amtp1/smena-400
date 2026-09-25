import Phaser from 'phaser';
import type { CabinSync } from '../CabinGame';
import { CAR_HEIGHT, CAR_MAX, CAR_MIN, CAR_WIDTH, carClassLabel, hotspotX } from '../hotspots';

const SPEED = 280;

export class CarScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Image;
  private hint!: Phaser.GameObjects.Text;
  private cabin: CabinSync | null = null;
  private walkTarget: number | null = null;
  private keys!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    e: Phaser.Input.Keyboard.Key;
  };
  private leaving = false;
  private enterGuard = 0;
  private pulse?: Phaser.GameObjects.Image;

  constructor() {
    super('car');
  }

  create() {
    this.cabin = this.registry.get('cabin') as CabinSync;
    this.leaving = false;
    this.arrived = false;
    this.enterGuard = 450;
    this.walkTarget = null;
    this.drawCar();
    this.spawnPlayer();
    this.hint = this.add
      .text(20, 16, '', {
        fontFamily: 'Manrope, Segoe UI, sans-serif',
        fontSize: '14px',
        color: '#ead7b1',
      })
      .setScrollFactor(0)
      .setDepth(20);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Нужна клавиатура');
    this.keys = {
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      e: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
    };

    this.cameras.main.setBounds(0, 0, CAR_WIDTH, CAR_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.16, 0);
    this.cameras.main.setDeadzone(90, CAR_HEIGHT);
    this.cameras.main.scrollY = 40;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.cabin?.locked) return;
      const worldX = pointer.worldX;
      const mark = this.hotspotX();
      if (this.cabin?.canInteract && mark != null && Math.abs(worldX - mark) < 80 && this.nearHotspot()) {
        this.tryArrive();
        return;
      }
      this.walkTarget = Phaser.Math.Clamp(worldX, 48, CAR_WIDTH - 48);
    });

    this.game.events.on('cabin-sync', this.onSync, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('cabin-sync', this.onSync, this);
    });
  }

  update(_time: number, delta: number) {
    if (!this.cabin || this.leaving) return;
    this.enterGuard = Math.max(0, this.enterGuard - delta);
    const dt = Math.min(delta, 40) / 1000;
    let dir = 0;
    if (!this.cabin.locked) {
      if (this.keys.left.isDown || this.keys.a.isDown) dir -= 1;
      if (this.keys.right.isDown || this.keys.d.isDown) dir += 1;
      if (dir !== 0) this.walkTarget = null;
      if (dir === 0 && this.walkTarget != null) {
        const gap = this.walkTarget - this.player.x;
        if (Math.abs(gap) < 4) {
          this.walkTarget = null;
          if (this.player.x < 90) this.tryExit('left');
          else if (this.player.x > CAR_WIDTH - 90) this.tryExit('right');
        } else dir = Math.sign(gap);
      }
      this.player.x = Phaser.Math.Clamp(this.player.x + dir * SPEED * dt, 40, CAR_WIDTH - 40);
      this.player.setFlipX(dir < 0);
    }

    if (this.cabin.canInteract && this.nearHotspot()) this.tryArrive();

    if (Phaser.Input.Keyboard.JustDown(this.keys.e)) {
      if (this.nearHotspot()) this.tryArrive();
      else if (this.player.x < 90) this.tryExit('left');
      else if (this.player.x > CAR_WIDTH - 90) this.tryExit('right');
    }

    if (this.enterGuard === 0 && !this.cabin.locked && dir < 0 && this.player.x <= 46) this.tryExit('left');
    if (this.enterGuard === 0 && !this.cabin.locked && dir > 0 && this.player.x >= CAR_WIDTH - 46) this.tryExit('right');

    this.hint.setText(this.hintText());
  }

  private onSync = (next: CabinSync) => {
    const prev = this.cabin;
    this.cabin = next;
    if (!prev || prev.car !== next.car) {
      this.scene.restart();
      return;
    }
    if (prev.canInteract !== next.canInteract || prev.hotspotKind !== next.hotspotKind) {
      this.scene.restart();
    }
  };

  private spawnPlayer() {
    const from = this.cabin?.enterFrom ?? 'center';
    const x = from === 'left' ? 260 : from === 'right' ? CAR_WIDTH - 260 : 240;
    this.player = this.add.image(x, 292, 'conductor').setDepth(8);
  }

  private drawCar() {
    const car = this.cabin?.car ?? 5;
    const wall = car <= 2 ? 0x142028 : car <= 4 ? 0x101c24 : 0x0c161c;
    this.add.rectangle(CAR_WIDTH / 2, CAR_HEIGHT / 2, CAR_WIDTH, CAR_HEIGHT, wall);
    this.add.rectangle(CAR_WIDTH / 2, 28, CAR_WIDTH, 56, 0x08141b);
    this.add.rectangle(CAR_WIDTH / 2, 392, CAR_WIDTH, 56, 0x0a1218);
    this.add.rectangle(CAR_WIDTH / 2, 356, CAR_WIDTH, 6, 0xc9a56a, 0.35);

    const gap = car >= 6 ? 118 : 148;
    for (let x = 170; x < CAR_WIDTH - 160; x += gap) {
      this.add.image(x, 128, 'window');
      this.add.image(x, 318, 'seat');
      this.add.image(x + 44, 318, 'seat');
    }

    this.add.image(52, 286, 'door');
    this.add.image(CAR_WIDTH - 52, 286, 'door');

    this.add.text(80, 88, `Вагон ${car} · ${carClassLabel(car)}`, {
      fontFamily: 'Unbounded, Manrope, sans-serif',
      fontSize: '18px',
      color: '#c9a56a',
    });

    const mark = this.hotspotX();
    if (mark != null && this.cabin?.hotspotKind) {
      this.pulse = this.add.image(mark, 300, 'pulse').setDepth(4);
      this.tweens.add({
        targets: this.pulse,
        scale: 1.35,
        alpha: 0.35,
        yoyo: true,
        repeat: -1,
        duration: 700,
      });
      if (this.cabin.hotspotKind === 'bag') {
        this.add.image(mark, 332, 'bag').setDepth(6);
      } else {
        this.add.image(mark, 292, 'passenger').setDepth(6);
      }
    }
  }

  private hotspotX() {
    if (!this.cabin?.hotspotKind || this.cabin.objectiveCar !== this.cabin.car) return null;
    return hotspotX(this.cabin.hotspotKind, this.cabin.hotspotSeat);
  }

  private nearHotspot() {
    const mark = this.hotspotX();
    return mark != null && Math.abs(this.player.x - mark) < 70;
  }

  private arrived = false;

  private tryArrive() {
    if (!this.cabin?.canInteract || !this.nearHotspot() || this.arrived) return;
    this.arrived = true;
    const onArrive = this.registry.get('onArrive') as (() => void) | undefined;
    onArrive?.();
  }

  private tryExit(side: 'left' | 'right') {
    if (!this.cabin || this.cabin.locked || this.leaving || this.enterGuard > 0) return;
    const next = side === 'left' ? this.cabin.car - 1 : this.cabin.car + 1;
    if (next < CAR_MIN || next > CAR_MAX) return;
    this.leaving = true;
    const onCarChange = this.registry.get('onCarChange') as
      | ((car: number, enterFrom: 'left' | 'right') => void)
      | undefined;
    onCarChange?.(next, side === 'left' ? 'right' : 'left');
  }

  private hintText() {
    if (!this.cabin) return '';
    if (this.cabin.locked) return 'Инцидент. Выбор на панели.';
    if (this.nearHotspot() && this.cabin.canInteract) return 'E — подойти к точке';
    if (this.player.x < 90) {
      return this.cabin.car <= CAR_MIN ? 'Локомотив закрыт' : 'E или влево — предыдущий вагон';
    }
    if (this.player.x > CAR_WIDTH - 90) {
      return this.cabin.car >= CAR_MAX ? 'Конец состава' : 'E или вправо — следующий вагон';
    }
    if (this.cabin.objectiveCar && this.cabin.objectiveCar !== this.cabin.car) {
      const way = this.cabin.objectiveCar < this.cabin.car ? 'к голове состава' : 'к хвосту';
      return `Рация: вагон ${this.cabin.objectiveCar}. Идите ${way}.`;
    }
    return 'Стрелки / A D — идти · клик — шаг к точке';
  }
}
