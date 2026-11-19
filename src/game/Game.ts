import { SoundFX } from './audio';
import type {
  EnemyKind,
  GameCallbacks,
  GameMode,
  HudSnapshot,
  WavePhase,
} from './types';

const TAU = Math.PI * 2;
const WORLD_SURVIVAL = 2400;
const WORLD_BOSS = 1000;
const AUTOAIM_RANGE = 760;

const PLAYER_COLOR = '#5ff6ff';
const SECONDARY_COLOR = '#ffc857';
const ENEMY_GLOW = 0.16;

const SECONDARY_COOLDOWN = 3.4;
const SECONDARY_PELLETS = 7;
const DODGE_COOLDOWN = 1.6;
const DASH_TIME = 0.16;
const DASH_SPEED = 1120;

const BOSS_HP = 320;
const BOSS_RADIUS = 58;
const BOSS_COLOR = '#ff3860';
const BOSS_CONTACT_DAMAGE = 28;
const BOSS_SCORE = 1600;
const BOSS_VICTORY_DELAY = 1.6;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const withAlpha = (hex: string, alpha: number) => {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

interface EnemyDef {
  radius: number;
  hp: number;
  speed: number;
  damage: number;
  score: number;
  color: string;
}

const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  grunt: { radius: 16, hp: 4, speed: 86, damage: 12, score: 10, color: '#ff4d7d' },
  runner: { radius: 12, hp: 3, speed: 154, damage: 8, score: 15, color: '#ffc857' },
  tank: { radius: 26, hp: 16, speed: 52, damage: 22, score: 35, color: '#b48cff' },
  spitter: { radius: 16, hp: 6, speed: 66, damage: 10, score: 25, color: '#7dff9b' },
  boss: {
    radius: BOSS_RADIUS,
    hp: BOSS_HP,
    speed: 60,
    damage: BOSS_CONTACT_DAMAGE,
    score: BOSS_SCORE,
    color: BOSS_COLOR,
  },
};

interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  angle: number;
  fireCooldown: number;
  invuln: number;
  muzzle: number;
  muzzleColor: string;
  trailTimer: number;
  dashTime: number;
  dashDirX: number;
  dashDirY: number;
  dead: boolean;
}

interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  score: number;
  color: string;
  angle: number;
  attackTimer: number;
  hitFlash: number;
  age: number;
  seed: number;
  dead: boolean;
}

interface Bullet {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  color: string;
}

interface EnemyBullet {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  drag: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

interface Pickup {
  x: number;
  y: number;
  age: number;
  life: number;
}

interface Telegraph {
  x: number;
  y: number;
  kind: EnemyKind;
  timer: number;
  duration: number;
}

interface Banner {
  title: string;
  sub: string;
  time: number;
  duration: number;
  color: string;
}

interface Decoration {
  x: number;
  y: number;
  size: number;
  alpha: number;
  phase: number;
}

interface FloorMark {
  x: number;
  y: number;
  radius: number;
  rotation: number;
  alpha: number;
  kind: 'ring' | 'cross' | 'diamond';
}

interface Mote {
  x: number;
  y: number;
  size: number;
  drift: number;
  phase: number;
  color: string;
}

type Phase = 'idle' | 'playing' | 'gameover';
type BossAttack = 'radial' | 'aimed' | 'summon';

interface InputState {
  keys: Set<string>;
  touchX: number;
  touchY: number;
  touchFire: boolean;
  fireKey: boolean;
  mouseDown: boolean;
  mouseScreenX: number;
  mouseScreenY: number;
  mouseActive: boolean;
  autoAim: boolean;
}

export class ShooterGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: GameCallbacks;
  private dpr = 1;
  private width = 1;
  private height = 1;
  private resizeObserver: ResizeObserver;

  private phase: Phase = 'idle';
  private mode: GameMode = 'survival';
  private worldSize = WORLD_SURVIVAL;
  private paused = false;
  private raf = 0;
  private lastTime = 0;
  private elapsed = 0;
  private ambientTime = 0;
  private hudTimer = 0;
  private destroyed = false;

  private player!: Player;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private enemyBullets: EnemyBullet[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private pickups: Pickup[] = [];
  private telegraphs: Telegraph[] = [];
  private decorations: Decoration[] = [];
  private floorMarks: FloorMark[] = [];
  private motes: Mote[] = [];
  private banner: Banner | null = null;
  private boss: Enemy | null = null;
  private bossWindup = 0;
  private bossAttackKind: BossAttack = 'radial';
  private victoryTimer = 0;

  private input: InputState = {
    keys: new Set(),
    touchX: 0,
    touchY: 0,
    touchFire: false,
    fireKey: false,
    mouseDown: false,
    mouseScreenX: 0,
    mouseScreenY: 0,
    mouseActive: false,
    autoAim: true,
  };

  private camera = { x: WORLD_SURVIVAL / 2, y: WORLD_SURVIVAL / 2 };
  private zoom = 1;
  private shake = 0;
  private hurtFlash = 0;
  private healFlash = 0;
  private killFlash = 0;

  private score = 0;
  private kills = 0;
  private combo = 0;
  private comboTimer = 0;
  private wave = 1;
  private wavePhase: WavePhase = 'intermission';
  private spawnQueue: EnemyKind[] = [];
  private spawnTimer = 0;
  private intermissionTimer = 0;
  private nextEnemyId = 1;
  private autoTarget: Enemy | null = null;
  private secondaryCooldown = 0;
  private dodgeCooldown = 0;
  private sfx = new SoundFX();

  private bgGradient: CanvasGradient | null = null;
  private vignette: CanvasGradient | null = null;

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.callbacks = callbacks;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.buildDecorations();
    this.resetWorld();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- public API

  start(mode: GameMode = 'survival') {
    this.mode = mode;
    this.worldSize = mode === 'boss' ? WORLD_BOSS : WORLD_SURVIVAL;
    this.updateZoom();
    this.buildDecorations();
    this.sfx.unlock();
    this.resetWorld();
    this.phase = 'playing';
    this.paused = false;
    if (mode === 'boss') {
      this.beginBoss();
    } else {
      this.startWave(1);
    }
    this.emitHud(true);
  }

  toMenu() {
    this.phase = 'idle';
    this.paused = false;
    this.mode = 'survival';
    this.worldSize = WORLD_SURVIVAL;
    this.updateZoom();
    this.buildDecorations();
    this.resetWorld();
    this.emitHud(true);
  }

  setPaused(paused: boolean) {
    if (this.phase !== 'playing') return;
    this.paused = paused;
    if (paused) this.clearInput();
  }

  isPaused() {
    return this.paused;
  }

  toggleMute() {
    const muted = this.sfx.toggle();
    this.emitHud(true);
    return muted;
  }

  setKey(code: string, down: boolean) {
    const wasDown = this.input.keys.has(code);
    if (down) this.input.keys.add(code);
    else this.input.keys.delete(code);
    if (code === 'KeyJ' && down !== wasDown) {
      this.input.fireKey = down;
    }
  }

  setTouchMove(x: number, y: number) {
    this.input.touchX = x;
    this.input.touchY = y;
    this.input.autoAim = true;
    this.input.mouseActive = false;
  }

  setTouchFire(active: boolean) {
    this.input.touchFire = active;
    this.input.autoAim = true;
    this.input.mouseActive = false;
  }

  triggerSecondary() {
    if (
      this.phase !== 'playing' ||
      this.paused ||
      this.player.dead ||
      this.secondaryCooldown > 0
    ) {
      return;
    }
    this.fireSecondary();
  }

  triggerDodge() {
    if (
      this.phase !== 'playing' ||
      this.paused ||
      this.player.dead ||
      this.dodgeCooldown > 0 ||
      this.player.dashTime > 0
    ) {
      return;
    }

    // Snapshot the stick / keys at the moment the button is pressed.
    const move = this.readMoveInput();
    const player = this.player;
    if (move.magnitude > 0.12) {
      player.dashDirX = move.x / move.magnitude;
      player.dashDirY = move.y / move.magnitude;
    } else {
      player.dashDirX = Math.cos(player.angle);
      player.dashDirY = Math.sin(player.angle);
    }

    player.dashTime = DASH_TIME;
    player.invuln = Math.max(player.invuln, 0.3);
    player.vx = player.dashDirX * DASH_SPEED;
    player.vy = player.dashDirY * DASH_SPEED;
    this.dodgeCooldown = DODGE_COOLDOWN;
    this.shake = Math.max(this.shake, 3.5);
    this.sfx.play('dash');
    this.spawnBurst(
      player.x - player.dashDirX * 12,
      player.y - player.dashDirY * 12,
      PLAYER_COLOR,
      14,
      210,
      0.4,
    );
    this.emitHud(true);
  }

  setMouseScreen(x: number, y: number) {
    this.input.mouseScreenX = x;
    this.input.mouseScreenY = y;
    this.input.mouseActive = true;
    this.input.autoAim = false;
  }

  setMouseDown(down: boolean) {
    this.input.mouseDown = down;
  }

  clearInput() {
    this.input.keys.clear();
    this.input.fireKey = false;
    this.input.mouseDown = false;
    this.input.touchX = 0;
    this.input.touchY = 0;
    this.input.touchFire = false;
  }

  dispose() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
  }

  // ------------------------------------------------------------------ game loop

  private loop(time: number) {
    if (this.destroyed) return;
    if (!this.lastTime) this.lastTime = time;
    const dt = Math.min(0.033, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    this.ambientTime += dt;

    if (this.phase === 'playing' && !this.paused) {
      this.elapsed += dt;
      this.update(dt);
    } else {
      this.updateAmbient(dt);
    }

    this.render();
    this.raf = requestAnimationFrame(this.loop);
  }

  private resetWorld() {
    this.player = {
      x: this.worldSize / 2,
      y: this.worldSize / 2,
      vx: 0,
      vy: 0,
      radius: 17,
      hp: 100,
      maxHp: 100,
      speed: 270,
      angle: -Math.PI / 2,
      fireCooldown: 0,
      invuln: 0,
      muzzle: 0,
      muzzleColor: PLAYER_COLOR,
      trailTimer: 0,
      dashTime: 0,
      dashDirX: 0,
      dashDirY: 0,
      dead: false,
    };
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;

    this.enemies = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.particles = [];
    this.floaters = [];
    this.pickups = [];
    this.telegraphs = [];
    this.banner = null;
    this.boss = null;
    this.bossWindup = 0;
    this.bossAttackKind = 'radial';
    this.victoryTimer = 0;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.wave = 1;
    this.wavePhase = 'intermission';
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.intermissionTimer = 0;
    this.elapsed = 0;
    this.shake = 0;
    this.hurtFlash = 0;
    this.healFlash = 0;
    this.killFlash = 0;
    this.autoTarget = null;
    this.secondaryCooldown = 0;
    this.dodgeCooldown = 0;
    this.hudTimer = 0;
    this.clearInput();
  }

  private update(dt: number) {
    this.updatePlayer(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.updateEnemyBullets(dt);
    this.updatePickups(dt);
    if (this.mode === 'survival') this.updateWave(dt);
    this.updateFx(dt);
    this.updateCamera(dt);

    if (this.victoryTimer > 0) {
      this.victoryTimer -= dt;
      if (this.victoryTimer <= 0) this.finishBossFight();
    }

    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.6);
    this.healFlash = Math.max(0, this.healFlash - dt * 2.2);
    this.killFlash = Math.max(0, this.killFlash - dt * 7);
    this.shake = Math.max(0, this.shake - dt * 38);

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.09;
      this.emitHud(true);
    }
  }

  private updateAmbient(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 30);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    this.updateParticles(dt);
    this.updateFloaters(dt);
    if (this.banner) {
      this.banner.time -= dt;
      if (this.banner.time <= 0) this.banner = null;
    }
    if (this.phase === 'idle') {
      this.player.angle = -Math.PI / 2 + Math.sin(this.ambientTime * 0.55) * 0.25;
      this.camera.x += (this.worldSize / 2 - this.camera.x) * Math.min(1, dt * 2);
      this.camera.y += (this.worldSize / 2 - this.camera.y) * Math.min(1, dt * 2);
    }
  }

  private updateCamera(dt: number) {
    let targetX = this.player.x + this.player.vx * 0.12;
    let targetY = this.player.y + this.player.vy * 0.12;
    if (this.mode === 'boss' && this.boss && !this.boss.dead) {
      targetX += (this.boss.x - targetX) * 0.28;
      targetY += (this.boss.y - targetY) * 0.28;
    }
    const smoothing = 1 - Math.exp(-7 * dt);
    this.camera.x += (targetX - this.camera.x) * smoothing;
    this.camera.y += (targetY - this.camera.y) * smoothing;
    this.clampCamera();
  }

  private updateZoom() {
    const min = this.mode === 'boss' ? 0.68 : 0.82;
    const max = this.mode === 'boss' ? 1.06 : 1.18;
    this.zoom = clamp(Math.min(this.width / 860, this.height / 640), min, max);
    this.clampCamera();
  }

  private clampCamera() {
    const halfW = this.width / (2 * this.zoom);
    const halfH = this.height / (2 * this.zoom);
    if (halfW * 2 < this.worldSize) {
      this.camera.x = clamp(this.camera.x, halfW, this.worldSize - halfW);
    } else {
      this.camera.x = this.worldSize / 2;
    }
    if (halfH * 2 < this.worldSize) {
      this.camera.y = clamp(this.camera.y, halfH, this.worldSize - halfH);
    } else {
      this.camera.y = this.worldSize / 2;
    }
  }

  // ------------------------------------------------------------------- player

  private updatePlayer(dt: number) {
    const player = this.player;
    if (player.dead) return;

    const move = this.readMoveInput();
    this.secondaryCooldown = Math.max(0, this.secondaryCooldown - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    player.trailTimer -= dt;

    if (player.dashTime > 0) {
      // Dash locks the launch direction, even if the stick is released mid-dash.
      player.dashTime = Math.max(0, player.dashTime - dt);
      player.vx = player.dashDirX * DASH_SPEED;
      player.vy = player.dashDirY * DASH_SPEED;
      if (player.trailTimer <= 0) {
        player.trailTimer = 0.018;
        this.particles.push({
          x: player.x + rand(-4, 4),
          y: player.y + rand(-4, 4),
          vx: -player.dashDirX * rand(30, 70) + rand(-10, 10),
          vy: -player.dashDirY * rand(30, 70) + rand(-10, 10),
          life: rand(0.16, 0.3),
          maxLife: 0.3,
          size: rand(2.5, 5),
          color: PLAYER_COLOR,
          drag: 3,
        });
      }
    } else {
      let moveX = move.x;
      let moveY = move.y;
      if (move.magnitude > 1) {
        moveX /= move.magnitude;
        moveY /= move.magnitude;
      }

      const targetVx = moveX * player.speed;
      const targetVy = moveY * player.speed;
      const accel = 1 - Math.exp(-14 * dt);
      player.vx += (targetVx - player.vx) * accel;
      player.vy += (targetVy - player.vy) * accel;

      if (
        (Math.abs(player.vx) > 60 || Math.abs(player.vy) > 60) &&
        player.trailTimer <= 0
      ) {
        player.trailTimer = 0.055;
        this.particles.push({
          x: player.x - player.vx * 0.03 + rand(-5, 5),
          y: player.y - player.vy * 0.03 + rand(-5, 5),
          vx: -player.vx * 0.08 + rand(-12, 12),
          vy: -player.vy * 0.08 + rand(-12, 12),
          life: rand(0.18, 0.36),
          maxLife: 0.36,
          size: rand(1.5, 3.2),
          color: PLAYER_COLOR,
          drag: 2.5,
        });
      }
    }

    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, 46, this.worldSize - 46);
    player.y = clamp(player.y, 46, this.worldSize - 46);

    player.fireCooldown -= dt;
    player.invuln = Math.max(0, player.invuln - dt);
    player.muzzle = Math.max(0, player.muzzle - dt);

    this.autoTarget = this.findNearestEnemy(player.x, player.y, AUTOAIM_RANGE, true);
    const usingTouchAim = this.input.autoAim && !this.input.mouseActive;
    if (usingTouchAim) {
      if (this.autoTarget) {
        player.angle = Math.atan2(this.autoTarget.y - player.y, this.autoTarget.x - player.x);
      } else if (move.magnitude > 0.12) {
        player.angle = Math.atan2(move.y, move.x);
      }
    } else if (this.input.mouseActive) {
      const mouseWorld = this.screenToWorld(this.input.mouseScreenX, this.input.mouseScreenY);
      player.angle = Math.atan2(mouseWorld.y - player.y, mouseWorld.x - player.x);
    } else if (this.autoTarget) {
      player.angle = Math.atan2(this.autoTarget.y - player.y, this.autoTarget.x - player.x);
    }

    const firing = this.input.fireKey || this.input.touchFire || this.input.mouseDown;
    if (firing && player.fireCooldown <= 0) {
      this.firePlayerBullet();
    }
  }

  private readMoveInput() {
    let x = 0;
    let y = 0;
    const touchMag = Math.hypot(this.input.touchX, this.input.touchY);
    if (touchMag > 0.12) {
      x = this.input.touchX;
      y = this.input.touchY;
    } else {
      const keys = this.input.keys;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    }
    return { x, y, magnitude: Math.hypot(x, y) };
  }

  private firePlayerBullet() {
    const player = this.player;
    player.fireCooldown = 0.115;
    player.muzzle = 0.06;
    player.muzzleColor = PLAYER_COLOR;
    const cos = Math.cos(player.angle);
    const sin = Math.sin(player.angle);
    const offset = 26;
    const x = player.x + cos * offset;
    const y = player.y + sin * offset;
    const speed = 1080;
    this.bullets.push({
      x,
      y,
      prevX: x,
      prevY: y,
      vx: cos * speed,
      vy: sin * speed,
      radius: 4,
      damage: 2,
      life: 1.15,
      color: PLAYER_COLOR,
    });

    for (let i = 0; i < 4; i++) {
      const spread = player.angle + Math.PI + rand(-0.55, 0.55);
      const velocity = rand(40, 150);
      this.particles.push({
        x: x + rand(-3, 3),
        y: y + rand(-3, 3),
        vx: Math.cos(spread) * velocity,
        vy: Math.sin(spread) * velocity,
        life: rand(0.06, 0.16),
        maxLife: 0.16,
        size: rand(1.5, 3),
        color: '#c7fbff',
        drag: 8,
      });
    }
    this.shake = Math.max(this.shake, 0.9);
    this.sfx.play('shoot');
  }

  private fireSecondary() {
    const player = this.player;
    this.secondaryCooldown = SECONDARY_COOLDOWN;
    player.muzzle = 0.1;
    player.muzzleColor = SECONDARY_COLOR;

    const offset = 30;
    const speed = 940;
    for (let i = 0; i < SECONDARY_PELLETS; i++) {
      const t = i / (SECONDARY_PELLETS - 1) - 0.5;
      const angle = player.angle + t * 0.52 + rand(-0.018, 0.018);
      const x = player.x + Math.cos(angle) * offset;
      const y = player.y + Math.sin(angle) * offset;
      this.bullets.push({
        x,
        y,
        prevX: x,
        prevY: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 4.5,
        damage: 2.2,
        life: 0.95,
        color: SECONDARY_COLOR,
      });
    }

    for (let i = 0; i < 12; i++) {
      const spread = player.angle + Math.PI + rand(-0.85, 0.85);
      const velocity = rand(70, 260);
      this.particles.push({
        x: player.x + Math.cos(player.angle) * offset + rand(-4, 4),
        y: player.y + Math.sin(player.angle) * offset + rand(-4, 4),
        vx: Math.cos(spread) * velocity,
        vy: Math.sin(spread) * velocity,
        life: rand(0.1, 0.28),
        maxLife: 0.28,
        size: rand(2, 4.5),
        color: SECONDARY_COLOR,
        drag: 6,
      });
    }

    this.shake = Math.max(this.shake, 5);
    this.sfx.play('secondary');
    this.emitHud(true);
  }

  private playerHit(damage: number) {
    const player = this.player;
    if (player.dead || player.invuln > 0) return;
    player.hp -= damage;
    player.invuln = 0.95;
    this.combo = 0;
    this.comboTimer = 0;
    this.hurtFlash = 1;
    this.shake = Math.max(this.shake, 12);
    this.sfx.play('hurt');
    this.spawnBurst(player.x, player.y, '#ff4d7d', 18, 220, 0.5);
    this.floaters.push({
      x: player.x,
      y: player.y - 30,
      text: `-${damage}`,
      color: '#ff6f91',
      life: 0.8,
      maxLife: 0.8,
      size: 18,
    });

    if (player.hp <= 0) {
      player.hp = 0;
      player.dead = true;
      this.phase = 'gameover';
      this.clearInput();
      this.shake = 24;
      this.spawnBurst(player.x, player.y, PLAYER_COLOR, 70, 420, 1.1);
      this.spawnBurst(player.x, player.y, '#ffffff', 26, 260, 0.8);
      this.enemyBullets = [];
      this.sfx.play('death');
      this.emitHud(true);
      this.callbacks.onGameOver(
        {
          mode: this.mode,
          score: this.score,
          wave: this.wave,
          kills: this.kills,
          time: this.elapsed,
        },
        false,
      );
    } else {
      this.emitHud(true);
    }
  }

  // ------------------------------------------------------------------ bullets

  private updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.prevX = bullet.x;
      bullet.prevY = bullet.y;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;

      let consumed = false;
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        if (
          segmentCircleHit(
            bullet.prevX,
            bullet.prevY,
            bullet.x,
            bullet.y,
            enemy.x,
            enemy.y,
            enemy.radius + bullet.radius,
          )
        ) {
          this.damageEnemy(enemy, bullet.damage, bullet.x, bullet.y);
          consumed = true;
          break;
        }
      }

      if (
        consumed ||
        bullet.life <= 0 ||
        bullet.x < -60 ||
        bullet.y < -60 ||
        bullet.x > this.worldSize + 60 ||
        bullet.y > this.worldSize + 60
      ) {
        this.bullets.splice(i, 1);
      }
    }
    this.enemies = this.enemies.filter((enemy) => !enemy.dead);
  }

  private damageEnemy(enemy: Enemy, damage: number, hitX: number, hitY: number) {
    enemy.hp -= damage;
    enemy.hitFlash = 0.09;
    this.spawnBurst(hitX, hitY, enemy.color, 5, 130, 0.28);
    this.sfx.play('hit');

    if (enemy.hp <= 0) {
      enemy.dead = true;
      this.kills += 1;
      this.combo += 1;
      this.comboTimer = 3;
      const multiplier = 1 + Math.min(20, this.combo - 1) * 0.1;
      const points = Math.round(enemy.score * multiplier);
      this.score += points;
      this.killFlash = Math.max(this.killFlash, 0.35);
      this.shake = Math.max(
        this.shake,
        enemy.kind === 'boss' ? 20 : enemy.kind === 'tank' ? 7 : 3.2,
      );
      this.sfx.play('kill');
      this.spawnBurst(
        enemy.x,
        enemy.y,
        enemy.color,
        enemy.kind === 'boss' ? 60 : enemy.kind === 'tank' ? 34 : 18,
        250,
        0.65,
      );
      this.spawnBurst(enemy.x, enemy.y, '#ffffff', 5, 160, 0.35);
      this.floaters.push({
        x: enemy.x,
        y: enemy.y - enemy.radius - 4,
        text: `+${points}`,
        color: enemy.color,
        life: 0.9,
        maxLife: 0.9,
        size: 15,
      });
      if (enemy.kind === 'boss') {
        this.bossDefeated(enemy);
      } else {
        this.maybeDropPickup(enemy);
      }
    }
  }

  private updateEnemyBullets(dt: number) {
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const bullet = this.enemyBullets[i];
      // Player death clears the bullet array mid-loop.
      if (!bullet) continue;
      bullet.prevX = bullet.x;
      bullet.prevY = bullet.y;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;

      const player = this.player;
      let hit = false;
      if (
        !player.dead &&
        player.invuln <= 0 &&
        segmentCircleHit(
          bullet.prevX,
          bullet.prevY,
          bullet.x,
          bullet.y,
          player.x,
          player.y,
          player.radius + bullet.radius - 3,
        )
      ) {
        this.playerHit(bullet.damage);
        hit = true;
      }

      if (
        hit ||
        bullet.life <= 0 ||
        bullet.x < -40 ||
        bullet.y < -40 ||
        bullet.x > this.worldSize + 40 ||
        bullet.y > this.worldSize + 40
      ) {
        this.enemyBullets.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------ enemies

  private updateEnemies(dt: number) {
    const player = this.player;

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.age += dt;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.attackTimer -= dt;

      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const nx = dx / distance;
      const ny = dy / distance;
      enemy.angle = Math.atan2(dy, dx);

      let desiredX = nx;
      let desiredY = ny;

      if (enemy.kind === 'spitter') {
        if (distance < 250) {
          desiredX = -nx;
          desiredY = -ny;
        } else if (distance < 350) {
          const strafe = Math.sin(this.elapsed * 1.4 + enemy.seed) > 0 ? 1 : -1;
          desiredX = -ny * strafe * 0.8 + nx * 0.15;
          desiredY = nx * strafe * 0.8 + ny * 0.15;
        }
        if (distance < 660 && enemy.attackTimer <= 0 && !player.dead) {
          this.spitterFire(enemy);
        }
      } else if (enemy.kind === 'boss') {
        if (distance > 300) {
          desiredX = nx;
          desiredY = ny;
        } else if (distance < 185) {
          desiredX = -nx;
          desiredY = -ny;
        } else {
          const strafe = Math.sin(this.elapsed * 0.9 + enemy.seed) > 0 ? 1 : -1;
          desiredX = -ny * strafe * 0.85 + nx * 0.1;
          desiredY = nx * strafe * 0.85 + ny * 0.1;
        }
        if (!player.dead) this.updateBossAttack(enemy, dt);
      }

      const phase2 = enemy.kind === 'boss' && enemy.hp <= enemy.maxHp * 0.5;
      const desiredLen = Math.max(0.001, Math.hypot(desiredX, desiredY));
      desiredX /= desiredLen;
      desiredY /= desiredLen;
      const turn = 1 - Math.exp(-(enemy.kind === 'runner' ? 10 : 4) * dt);
      const speed = enemy.speed * (phase2 ? 1.32 : 1);
      enemy.vx += (desiredX * speed - enemy.vx) * turn;
      enemy.vy += (desiredY * speed - enemy.vy) * turn;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.x = clamp(enemy.x, 30, this.worldSize - 30);
      enemy.y = clamp(enemy.y, 30, this.worldSize - 30);

      if (enemy.age > 0.18 && !player.dead && distance < enemy.radius + player.radius - 2) {
        if (player.invuln <= 0) {
          this.playerHit(enemy.damage);
          const push = 140;
          enemy.vx -= nx * push;
          enemy.vy -= ny * push;
          player.vx += nx * 70;
          player.vy += ny * 70;
        }
      }
    }

    // Soft separation keeps the horde readable.
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead || a.kind === 'boss' || b.kind === 'boss') continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = (a.radius + b.radius) * 0.88;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.001 && d2 < minDist * minDist) {
          const d = Math.sqrt(d2);
          const overlap = (minDist - d) * 0.5;
          const px = (dx / d) * overlap;
          const py = (dy / d) * overlap;
          a.x -= px;
          a.y -= py;
          b.x += px;
          b.y += py;
        }
      }
    }

    this.enemies = this.enemies.filter((enemy) => !enemy.dead);
  }

  private spitterFire(enemy: Enemy) {
    enemy.attackTimer = rand(1.9, 2.8);
    const angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x) + rand(-0.06, 0.06);
    const speed = 265;
    const x = enemy.x + Math.cos(angle) * (enemy.radius + 5);
    const y = enemy.y + Math.sin(angle) * (enemy.radius + 5);
    this.enemyBullets.push({
      x,
      y,
      prevX: x,
      prevY: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 6,
      damage: 9,
      life: 4,
      color: enemy.color,
    });
    this.spawnBurst(x, y, enemy.color, 4, 80, 0.25);
    this.sfx.play('spit');
  }

  private updateBossAttack(enemy: Enemy, dt: number) {
    if (this.bossWindup > 0) {
      this.bossWindup = Math.max(0, this.bossWindup - dt);
      if (this.bossWindup <= 0) this.releaseBossAttack(enemy);
      return;
    }
    if (enemy.attackTimer > 0) return;

    const phase2 = enemy.hp <= enemy.maxHp * 0.5;
    const roll = Math.random();
    if (phase2 && roll < 0.24) {
      this.bossAttackKind = 'summon';
    } else {
      this.bossAttackKind = roll < 0.62 ? 'radial' : 'aimed';
    }
    this.bossWindup = phase2 ? 0.45 : 0.62;
    this.spawnBurst(enemy.x, enemy.y, BOSS_COLOR, 10, 130, 0.5);
    this.sfx.play('bossCharge');
  }

  private releaseBossAttack(enemy: Enemy) {
    const phase2 = enemy.hp <= enemy.maxHp * 0.5;
    const player = this.player;

    if (this.bossAttackKind === 'summon') {
      const minions = this.enemies.filter(
        (other) => !other.dead && other.kind !== 'boss',
      ).length;
      if (minions < 6) {
        for (let i = 0; i < 3; i++) {
          const angle = rand(0, TAU);
          const radius = rand(130, 230);
          const kind: EnemyKind = i === 1 ? 'runner' : 'grunt';
          this.spawnEnemy(
            kind,
            clamp(enemy.x + Math.cos(angle) * radius, 80, this.worldSize - 80),
            clamp(enemy.y + Math.sin(angle) * radius, 80, this.worldSize - 80),
          );
        }
      }
      enemy.attackTimer = rand(1.5, 2);
    } else if (this.bossAttackKind === 'radial') {
      const count = phase2 ? 20 : 14;
      const offset = rand(0, TAU);
      for (let i = 0; i < count; i++) {
        const angle = offset + (i / count) * TAU;
        this.enemyBullets.push({
          x: enemy.x,
          y: enemy.y,
          prevX: enemy.x,
          prevY: enemy.y,
          vx: Math.cos(angle) * (phase2 ? 225 : 190),
          vy: Math.sin(angle) * (phase2 ? 225 : 190),
          radius: 7,
          damage: 9,
          life: 5,
          color: BOSS_COLOR,
        });
      }
      enemy.attackTimer = phase2 ? rand(1.15, 1.55) : rand(1.8, 2.3);
      this.shake = Math.max(this.shake, 7);
    } else {
      const count = phase2 ? 5 : 3;
      const base = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      for (let i = 0; i < count; i++) {
        const spread = i / (count - 1) - 0.5;
        const angle = base + spread * 0.32;
        this.enemyBullets.push({
          x: enemy.x + Math.cos(angle) * (enemy.radius - 4),
          y: enemy.y + Math.sin(angle) * (enemy.radius - 4),
          prevX: enemy.x,
          prevY: enemy.y,
          vx: Math.cos(angle) * 350,
          vy: Math.sin(angle) * 350,
          radius: 6.5,
          damage: 12,
          life: 3.2,
          color: '#ff8098',
        });
      }
      enemy.attackTimer = phase2 ? rand(1.1, 1.5) : rand(1.6, 2.1);
      this.shake = Math.max(this.shake, 5);
    }

    this.spawnBurst(enemy.x, enemy.y, phase2 ? '#ff8098' : BOSS_COLOR, 18, 220, 0.55);
    this.sfx.play('bossAttack');
    this.emitHud(true);
  }

  private beginBoss() {
    this.wave = 1;
    this.wavePhase = 'spawning';
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.intermissionTimer = 0;
    this.bossWindup = 0;
    this.bossAttackKind = 'radial';

    const x = this.worldSize / 2 + 250;
    const y = this.worldSize / 2;
    this.spawnEnemy('boss', x, y);
    const boss = this.enemies[this.enemies.length - 1];
    boss.hp = boss.maxHp = BOSS_HP;
    boss.attackTimer = 2.2;
    this.boss = boss;

    this.banner = {
      title: 'BOSS',
      sub: '压制核心 · 击破威胁',
      time: 2.2,
      duration: 2.2,
      color: BOSS_COLOR,
    };
    this.sfx.play('bossIntro');
    this.spawnBurst(x, y, BOSS_COLOR, 40, 320, 0.9);
    this.emitHud(true);
  }

  private bossDefeated(boss: Enemy) {
    this.victoryTimer = BOSS_VICTORY_DELAY;
    this.bossWindup = 0;
    this.player.invuln = Math.max(this.player.invuln, BOSS_VICTORY_DELAY + 1);
    this.enemyBullets = [];

    for (const enemy of this.enemies) {
      if (enemy === boss || enemy.dead) continue;
      enemy.dead = true;
      this.spawnBurst(enemy.x, enemy.y, enemy.color, 14, 220, 0.6);
    }

    this.shake = 26;
    this.killFlash = 1;
    this.spawnBurst(boss.x, boss.y, BOSS_COLOR, 86, 460, 1.3);
    this.spawnBurst(boss.x, boss.y, '#ffffff', 34, 300, 0.9);
    this.banner = {
      title: 'BOSS DOWN',
      sub: '压制核心已沉默',
      time: 2.2,
      duration: 2.2,
      color: '#7dff9b',
    };
    this.sfx.play('bossDown');
    this.emitHud(true);
  }

  private finishBossFight() {
    if (this.phase !== 'playing') return;
    this.phase = 'gameover';
    this.clearInput();
    this.emitHud(true);
    this.callbacks.onGameOver(
      {
        mode: 'boss',
        score: this.score,
        wave: 1,
        kills: this.kills,
        time: this.elapsed,
      },
      true,
    );
  }

  private findNearestEnemy(
    x: number,
    y: number,
    maxDistance: number,
    visibleOnly = false,
  ): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = maxDistance;
    const viewHalfW = this.width / (2 * this.zoom) + 30;
    const viewHalfH = this.height / (2 * this.zoom) + 30;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (
        visibleOnly &&
        (Math.abs(enemy.x - this.camera.x) > viewHalfW ||
          Math.abs(enemy.y - this.camera.y) > viewHalfH)
      ) {
        continue;
      }
      const d = dist(x, y, enemy.x, enemy.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = enemy;
      }
    }
    return nearest;
  }

  // --------------------------------------------------------------- wave logic

  private startWave(wave: number) {
    this.wave = wave;
    this.wavePhase = 'spawning';
    this.spawnQueue = this.buildWave(wave);
    this.spawnTimer = 0.3;
    this.banner = {
      title: `WAVE ${String(wave).padStart(2, '0')}`,
      sub: wave === 1 ? '清除所有敌对信号' : `敌对信号增强 · 第 ${wave} 波`,
      time: 1.9,
      duration: 1.9,
      color: PLAYER_COLOR,
    };
    this.sfx.play('wave');
    this.emitHud(true);
  }

  private buildWave(wave: number): EnemyKind[] {
    const count = 5 + Math.round(wave * 1.6);
    const list: EnemyKind[] = [];
    for (let i = 0; i < count; i++) {
      let kind: EnemyKind = 'grunt';
      if (wave >= 5 && i % 6 === 5) kind = 'spitter';
      else if (wave >= 4 && i % 7 === 3) kind = 'tank';
      else if (wave >= 2 && i % 4 === 1) kind = 'runner';
      list.push(kind);
    }
    if (wave >= 3 && !list.includes('runner')) list[list.length - 1] = 'runner';
    if (wave >= 5 && !list.includes('spitter')) list[0] = 'spitter';
    if (wave >= 6 && !list.includes('tank')) list[1] = 'tank';

    // Shuffle so every wave opens a little differently.
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  private updateWave(dt: number) {
    if (this.wavePhase === 'intermission') {
      this.intermissionTimer -= dt;
      if (this.intermissionTimer <= 0) this.startWave(this.wave + 1);
      return;
    }

    this.spawnTimer -= dt;
    if (this.spawnQueue.length > 0 && this.spawnTimer <= 0) {
      const groupSize = Math.min(
        this.spawnQueue.length,
        1 + Math.floor((this.wave - 1) / 4),
      );
      for (let i = 0; i < groupSize; i++) {
        const kind = this.spawnQueue.shift();
        if (!kind) break;
        const point = this.pickSpawnPoint();
        this.telegraphs.push({
          x: point.x,
          y: point.y,
          kind,
          timer: 0.7,
          duration: 0.7,
        });
      }
      this.spawnTimer = Math.max(0.34, 0.76 - this.wave * 0.022);
    }

    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const telegraph = this.telegraphs[i];
      telegraph.timer -= dt;
      if (telegraph.timer <= 0) {
        this.spawnEnemy(telegraph.kind, telegraph.x, telegraph.y);
        this.telegraphs.splice(i, 1);
      }
    }

    if (
      this.wavePhase === 'spawning' &&
      this.spawnQueue.length === 0 &&
      this.telegraphs.length === 0 &&
      this.enemies.length === 0
    ) {
      this.finishWave();
    }
  }

  private finishWave() {
    this.wavePhase = 'intermission';
    this.intermissionTimer = 3.2;
    const bonus = 75 + this.wave * 15;
    this.score += bonus;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 12);
    this.healFlash = Math.max(this.healFlash, 0.45);
    this.banner = {
      title: 'WAVE CLEAR',
      sub: `波次奖励 +${bonus} · 装甲修复 +12`,
      time: 2.8,
      duration: 2.8,
      color: '#7dff9b',
    };
    if (this.player.hp < this.player.maxHp * 0.7) {
      this.dropPickup(
        clamp(this.player.x + rand(-110, 110), 60, this.worldSize - 60),
        clamp(this.player.y + rand(-110, 110), 60, this.worldSize - 60),
      );
    }
    this.sfx.play('clear');
    this.emitHud(true);
  }

  private pickSpawnPoint() {
    const halfW = this.width / (2 * this.zoom);
    const halfH = this.height / (2 * this.zoom);
    let best = { x: this.worldSize / 2, y: this.worldSize / 2 };
    let bestScore = -1;

    for (let attempt = 0; attempt < 14; attempt++) {
      const edge = Math.floor(Math.random() * 4);
      const margin = rand(50, 150);
      let x = this.camera.x;
      let y = this.camera.y;
      if (edge === 0) {
        x -= halfW + margin;
        y += rand(-halfH, halfH);
      } else if (edge === 1) {
        x += halfW + margin;
        y += rand(-halfH, halfH);
      } else if (edge === 2) {
        y -= halfH + margin;
        x += rand(-halfW, halfW);
      } else {
        y += halfH + margin;
        x += rand(-halfW, halfW);
      }
      x = clamp(x, 70, this.worldSize - 70);
      y = clamp(y, 70, this.worldSize - 70);
      let playerDistance = dist(x, y, this.player.x, this.player.y);
      if (playerDistance > 680) {
        const pull = 680 / playerDistance;
        x = clamp(this.player.x + (x - this.player.x) * pull, 70, this.worldSize - 70);
        y = clamp(this.player.y + (y - this.player.y) * pull, 70, this.worldSize - 70);
        playerDistance = dist(x, y, this.player.x, this.player.y);
      }
      const score = playerDistance < 350 ? playerDistance : 1000 + playerDistance;
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
      if (playerDistance > 380) break;
    }
    return best;
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number) {
    const def = ENEMY_DEFS[kind];
    const wave = this.wave;
    const bonusHp =
      kind === 'tank'
        ? wave - 1
        : kind === 'spitter'
          ? Math.floor((wave - 1) / 2)
          : Math.floor((wave - 1) / 3);
    const hp = def.hp + bonusHp;
    this.enemies.push({
      id: this.nextEnemyId++,
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: def.radius,
      hp,
      maxHp: hp,
      speed: def.speed * (1 + Math.min(0.28, wave * 0.012)),
      damage: def.damage,
      score: def.score,
      color: def.color,
      angle: 0,
      attackTimer: rand(0.8, 2.2),
      hitFlash: 0,
      age: 0,
      seed: rand(0, TAU),
      dead: false,
    });
    this.spawnBurst(x, y, def.color, 12, 180, 0.45);
  }

  // ------------------------------------------------------------------ pickups

  private maybeDropPickup(enemy: Enemy) {
    const chance = enemy.kind === 'tank' ? 0.4 : 0.08;
    if (Math.random() < chance && this.pickups.length < 3) {
      this.dropPickup(enemy.x, enemy.y);
    }
  }

  private dropPickup(x: number, y: number) {
    this.pickups.push({
      x: clamp(x, 50, this.worldSize - 50),
      y: clamp(y, 50, this.worldSize - 50),
      age: 0,
      life: 24,
    });
  }

  private updatePickups(dt: number) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      pickup.age += dt;
      pickup.life -= dt;
      if (pickup.life <= 0) {
        this.pickups.splice(i, 1);
        continue;
      }
      if (dist(pickup.x, pickup.y, this.player.x, this.player.y) < 38) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
        this.healFlash = 1;
        this.pickups.splice(i, 1);
        this.floaters.push({
          x: this.player.x,
          y: this.player.y - 34,
          text: '+25 HP',
          color: '#7dff9b',
          life: 1,
          maxLife: 1,
          size: 18,
        });
        this.spawnBurst(pickup.x, pickup.y, '#7dff9b', 16, 160, 0.5);
        this.sfx.play('pickup');
        this.emitHud(true);
      }
    }
  }

  // ---------------------------------------------------------------------- fx

  private spawnBurst(
    x: number,
    y: number,
    color: string,
    count: number,
    speed: number,
    life: number,
  ) {
    if (this.particles.length > 320) return;
    for (let i = 0; i < count; i++) {
      const angle = rand(0, TAU);
      const velocity = rand(speed * 0.25, speed);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: rand(life * 0.35, life),
        maxLife: life,
        size: rand(1.4, 4.4),
        color,
        drag: rand(2, 5),
      });
    }
  }

  private updateFx(dt: number) {
    this.updateParticles(dt);
    this.updateFloaters(dt);
    if (this.banner) {
      this.banner.time -= dt;
      if (this.banner.time <= 0) this.banner = null;
    }
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.combo = 0;
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const damping = Math.exp(-particle.drag * dt);
      particle.vx *= damping;
      particle.vy *= damping;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
  }

  private updateFloaters(dt: number) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const floater = this.floaters[i];
      floater.life -= dt;
      floater.y -= 32 * dt;
      if (floater.life <= 0) this.floaters.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------ helpers

  private screenToWorld(screenX: number, screenY: number) {
    return {
      x: (screenX - this.width / 2) / this.zoom + this.camera.x,
      y: (screenY - this.height / 2) / this.zoom + this.camera.y,
    };
  }

  private emitHud(force = false) {
    if (!force && this.hudTimer > 0) return;
    const boss = this.boss;
    const bossHp = boss ? Math.max(0, Math.ceil(boss.hp)) : 0;
    const hud: HudSnapshot = {
      mode: this.mode,
      hp: Math.ceil(this.player.hp),
      maxHp: this.player.maxHp,
      score: this.score,
      wave: this.wave,
      wavePhase: this.wavePhase,
      enemiesRemaining:
        this.enemies.length + this.telegraphs.length + this.spawnQueue.length,
      nextWaveIn: Math.max(0, this.intermissionTimer),
      combo: this.combo,
      comboTime: this.comboTimer,
      kills: this.kills,
      muted: this.sfx.muted,
      secondaryCooldown: clamp(this.secondaryCooldown / SECONDARY_COOLDOWN, 0, 1),
      dodgeCooldown: clamp(this.dodgeCooldown / DODGE_COOLDOWN, 0, 1),
      bossHp,
      bossMaxHp: boss?.maxHp ?? 0,
      bossPhase: boss && boss.hp <= boss.maxHp * 0.5 ? 2 : 1,
    };
    this.callbacks.onHud(hud);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (
      Math.abs(this.width - width) < 0.5 &&
      Math.abs(this.height - height) < 0.5 &&
      this.dpr === dpr
    ) {
      return;
    }
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.updateZoom();

    const bg = this.ctx.createRadialGradient(
      width * 0.5,
      height * 0.44,
      0,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.78,
    );
    bg.addColorStop(0, '#0a1626');
    bg.addColorStop(0.55, '#060c16');
    bg.addColorStop(1, '#03060b');
    this.bgGradient = bg;

    const vignette = this.ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.2,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.7, 'rgba(0,0,0,0.22)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.72)');
    this.vignette = vignette;
  }

  private buildDecorations() {
    this.decorations = [];
    for (let i = 0; i < 100; i++) {
      this.decorations.push({
        x: rand(80, this.worldSize - 80),
        y: rand(80, this.worldSize - 80),
        size: rand(1, 3.4),
        alpha: rand(0.06, 0.28),
        phase: rand(0, TAU),
      });
    }

    this.floorMarks = [];
    const kinds: FloorMark['kind'][] = ['ring', 'cross', 'diamond'];
    for (let i = 0; i < 34; i++) {
      this.floorMarks.push({
        x: rand(100, this.worldSize - 100),
        y: rand(100, this.worldSize - 100),
        radius: rand(28, 130),
        rotation: rand(0, TAU),
        alpha: rand(0.025, 0.085),
        kind: kinds[i % kinds.length],
      });
    }

    this.motes = [];
    for (let i = 0; i < 26; i++) {
      this.motes.push({
        x: Math.random(),
        y: Math.random(),
        size: rand(0.7, 2.1),
        drift: rand(1.5, 8),
        phase: rand(0, TAU),
        color: i % 7 === 0 ? '#ff7d9e' : '#8feaff',
      });
    }
  }

  // -------------------------------------------------------------------- render

  private render() {
    const ctx = this.ctx;
    const { width, height, zoom } = this;
    const shakeX = this.shake > 0 ? rand(-this.shake, this.shake) : 0;
    const shakeY = this.shake > 0 ? rand(-this.shake, this.shake) : 0;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (this.bgGradient) {
      ctx.fillStyle = this.bgGradient;
    } else {
      ctx.fillStyle = '#04070d';
    }
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2 + shakeX, height / 2 + shakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    this.drawFloor();
    this.drawTelegraphs();
    this.drawPickups();
    this.drawEnemyBullets();
    this.drawBullets();
    this.drawAimGuide();
    this.drawEnemies();
    this.drawPlayer();
    this.drawParticles();
    this.drawFloaters();
    this.drawAutoTarget();

    ctx.restore();

    this.drawOverlayEffects(shakeX, shakeY);
    if (this.banner) this.drawBanner();
    if (this.phase === 'idle') {
      this.drawMenuAtmosphere();
    }
    if (!this.input.autoAim && this.input.mouseActive && this.phase === 'playing') {
      this.drawCrosshair();
    }
  }

  private drawFloor() {
    const ctx = this.ctx;
    const halfW = this.width / (2 * this.zoom);
    const halfH = this.height / (2 * this.zoom);
    const left = Math.max(0, this.camera.x - halfW);
    const right = Math.min(this.worldSize, this.camera.x + halfW);
    const top = Math.max(0, this.camera.y - halfH);
    const bottom = Math.min(this.worldSize, this.camera.y + halfH);

    ctx.fillStyle = '#060b14';
    ctx.fillRect(0, 0, this.worldSize, this.worldSize);

    // Grid
    const step = 80;
    const startX = Math.floor(left / step) * step;
    const startY = Math.floor(top / step) * step;
    ctx.lineWidth = 1 / this.zoom;
    for (let x = startX; x <= right; x += step) {
      const major = Math.abs(x % 400) < 0.01;
      ctx.strokeStyle = major ? 'rgba(75, 160, 200, 0.13)' : 'rgba(75, 140, 180, 0.055)';
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }
    for (let y = startY; y <= bottom; y += step) {
      const major = Math.abs(y % 400) < 0.01;
      ctx.strokeStyle = major ? 'rgba(75, 160, 200, 0.13)' : 'rgba(75, 140, 180, 0.055)';
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }

    // Large floor markings
    ctx.strokeStyle = 'rgba(95, 246, 255, 0.055)';
    ctx.lineWidth = 2.5 / this.zoom;
    ctx.beginPath();
    ctx.arc(this.worldSize / 2, this.worldSize / 2, 330, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.worldSize / 2, this.worldSize / 2, 360, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(95, 246, 255, 0.03)';
    ctx.beginPath();
    ctx.moveTo(this.worldSize / 2 - 430, this.worldSize / 2);
    ctx.lineTo(this.worldSize / 2 + 430, this.worldSize / 2);
    ctx.moveTo(this.worldSize / 2, this.worldSize / 2 - 430);
    ctx.lineTo(this.worldSize / 2, this.worldSize / 2 + 430);
    ctx.stroke();

    // Faint survey markings
    for (const mark of this.floorMarks) {
      if (
        mark.x + mark.radius < left ||
        mark.x - mark.radius > right ||
        mark.y + mark.radius < top ||
        mark.y - mark.radius > bottom
      ) {
        continue;
      }
      ctx.save();
      ctx.translate(mark.x, mark.y);
      ctx.rotate(mark.rotation);
      ctx.strokeStyle = `rgba(95, 246, 255, ${mark.alpha})`;
      ctx.lineWidth = 1.2 / this.zoom;
      if (mark.kind === 'ring') {
        ctx.beginPath();
        ctx.arc(0, 0, mark.radius, 0.15, Math.PI * 1.15);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, mark.radius * 0.72, Math.PI * 1.2, Math.PI * 2.1);
        ctx.stroke();
      } else if (mark.kind === 'cross') {
        ctx.beginPath();
        ctx.moveTo(-mark.radius, 0);
        ctx.lineTo(mark.radius, 0);
        ctx.moveTo(0, -mark.radius);
        ctx.lineTo(0, mark.radius);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, mark.radius * 0.28, 0, TAU);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -mark.radius);
        ctx.lineTo(mark.radius, 0);
        ctx.lineTo(0, mark.radius);
        ctx.lineTo(-mark.radius, 0);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Sparse debris / stars
    for (const decoration of this.decorations) {
      const twinkle =
        0.55 + Math.sin(this.ambientTime * 0.8 + decoration.phase) * 0.35;
      ctx.fillStyle = `rgba(126, 213, 232, ${decoration.alpha * twinkle})`;
      ctx.fillRect(
        decoration.x,
        decoration.y,
        decoration.size / this.zoom + 0.7,
        decoration.size / this.zoom + 0.7,
      );
    }

    // World border
    ctx.strokeStyle = 'rgba(95, 246, 255, 0.34)';
    ctx.lineWidth = 3 / this.zoom;
    ctx.strokeRect(24, 24, this.worldSize - 48, this.worldSize - 48);
    ctx.strokeStyle = 'rgba(95, 246, 255, 0.08)';
    ctx.lineWidth = 12 / this.zoom;
    ctx.strokeRect(26, 26, this.worldSize - 52, this.worldSize - 52);

    // Corner brackets
    const bracket = 60;
    const corners: Array<[number, number, number, number]> = [
      [24, 24, 1, 1],
      [this.worldSize - 24, 24, -1, 1],
      [24, this.worldSize - 24, 1, -1],
      [this.worldSize - 24, this.worldSize - 24, -1, -1],
    ];
    ctx.strokeStyle = 'rgba(95, 246, 255, 0.7)';
    ctx.lineWidth = 5 / this.zoom;
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + bracket * sx, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + bracket * sy);
      ctx.stroke();
    }
  }

  private drawTelegraphs() {
    const ctx = this.ctx;
    for (const telegraph of this.telegraphs) {
      const color = ENEMY_DEFS[telegraph.kind].color;
      const progress = 1 - telegraph.timer / telegraph.duration;
      const pulse = 0.65 + Math.sin(this.ambientTime * 22) * 0.25;
      ctx.save();
      ctx.translate(telegraph.x, telegraph.y);
      ctx.globalAlpha = 0.45 + progress * 0.5;
      ctx.strokeStyle = withAlpha(color, 0.9);
      ctx.lineWidth = 2 / this.zoom;
      ctx.beginPath();
      ctx.arc(0, 0, 34 - progress * 15, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(color, 0.55);
      ctx.beginPath();
      ctx.arc(0, 0, 42, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
      ctx.stroke();
      ctx.globalAlpha = 0.1 * pulse;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = withAlpha(color, 0.8);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const angle = (i * TAU) / 4 + this.ambientTime * 1.5;
        ctx.moveTo(Math.cos(angle) * 8, Math.sin(angle) * 8);
        ctx.lineTo(Math.cos(angle) * 18, Math.sin(angle) * 18);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawPickups() {
    const ctx = this.ctx;
    for (const pickup of this.pickups) {
      const bob = Math.sin(pickup.age * 3.2) * 4;
      const pulse = 0.7 + Math.sin(pickup.age * 5) * 0.2;
      ctx.save();
      ctx.translate(pickup.x, pickup.y + bob);
      ctx.globalAlpha = pickup.life < 4 ? 0.45 + Math.sin(pickup.age * 12) * 0.35 : 1;
      ctx.strokeStyle = 'rgba(125, 255, 155, 0.35)';
      ctx.lineWidth = 2 / this.zoom;
      ctx.beginPath();
      ctx.arc(0, 0, 24 * pulse, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(8, 24, 18, 0.95)';
      ctx.strokeStyle = '#7dff9b';
      ctx.lineWidth = 2.5 / this.zoom;
      ctx.beginPath();
      ctx.roundRect(-12, -12, 24, 24, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#7dff9b';
      ctx.fillRect(-2.5, -8, 5, 16);
      ctx.fillRect(-8, -2.5, 16, 5);
      ctx.restore();
    }
  }

  private drawBullets() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const bullet of this.bullets) {
      const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
      const tailX = bullet.x - (bullet.vx / speed) * 27;
      const tailY = bullet.y - (bullet.vy / speed) * 27;
      ctx.strokeStyle = withAlpha(bullet.color, 0.22);
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(bullet.color, 0.9);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 2.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawEnemyBullets() {
    const ctx = this.ctx;
    for (const bullet of this.enemyBullets) {
      const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
      ctx.save();
      ctx.strokeStyle = withAlpha(bullet.color, 0.35);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(
        bullet.x - (bullet.vx / speed) * 22,
        bullet.y - (bullet.vy / speed) * 22,
      );
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
      ctx.fillStyle = bullet.color;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius * 0.45, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawAimGuide() {
    if (
      this.phase !== 'playing' ||
      this.input.autoAim ||
      !this.input.mouseActive
    ) {
      return;
    }
    const ctx = this.ctx;
    const mouse = this.screenToWorld(this.input.mouseScreenX, this.input.mouseScreenY);
    const player = this.player;
    const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const startX = player.x + Math.cos(angle) * 24;
    const startY = player.y + Math.sin(angle) * 24;
    const endX = player.x + Math.cos(angle) * Math.min(1200, dist(startX, startY, mouse.x, mouse.y));
    const endY = player.y + Math.sin(angle) * Math.min(1200, dist(startX, startY, mouse.x, mouse.y));

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(95, 246, 255, 0.11)';
    ctx.lineWidth = 1 / this.zoom;
    ctx.setLineDash([5 / this.zoom, 9 / this.zoom]);
    ctx.lineDashOffset = -this.ambientTime * 30;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
  }

  private drawEnemies() {
    const ctx = this.ctx;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const spawnT = Math.min(1, enemy.age / 0.22);
      const scale = 0.55 + spawnT * 0.45;
      const alpha = spawnT;
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.globalAlpha = alpha;

      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(0, enemy.radius * 0.65, enemy.radius * 0.9, enemy.radius * 0.4, 0, 0, TAU);
      ctx.fill();

      ctx.scale(scale, scale);
      ctx.rotate(enemy.angle);

      // Soft neon glow shell
      ctx.fillStyle = withAlpha(enemy.color, ENEMY_GLOW);
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius + 10, 0, TAU);
      ctx.fill();

      const coreFill = enemy.hitFlash > 0 ? '#ffffff' : withAlpha(enemy.color, 0.16);
      ctx.fillStyle = coreFill;
      ctx.strokeStyle = enemy.hitFlash > 0 ? '#ffffff' : enemy.color;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';

      if (enemy.kind === 'grunt') {
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const angle = (i * TAU) / 4 + Math.PI / 4;
          const px = Math.cos(angle) * enemy.radius;
          const py = Math.sin(angle) * enemy.radius;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : withAlpha(enemy.color, 0.9);
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = withAlpha(enemy.color, 0.5);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(0, -enemy.radius - 5);
        ctx.lineTo(0, -enemy.radius + 2);
        ctx.stroke();
      } else if (enemy.kind === 'runner') {
        ctx.beginPath();
        ctx.moveTo(enemy.radius + 7, 0);
        ctx.lineTo(-enemy.radius, enemy.radius * 0.8);
        ctx.lineTo(-enemy.radius * 0.45, 0);
        ctx.lineTo(-enemy.radius, -enemy.radius * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = withAlpha(enemy.color, 0.5);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-enemy.radius - 8, 0);
        ctx.lineTo(-enemy.radius - 18, 0);
        ctx.stroke();
      } else if (enemy.kind === 'tank') {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (i * TAU) / 6;
          const px = Math.cos(angle) * enemy.radius;
          const py = Math.sin(angle) * enemy.radius;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.rotate(-enemy.angle);
        ctx.strokeStyle = withAlpha(enemy.color, 0.45);
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 7, this.elapsed * 0.9, this.elapsed * 0.9 + TAU * 0.72);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : withAlpha(enemy.color, 0.9);
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, TAU);
        ctx.fill();
      } else if (enemy.kind === 'spitter') {
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.rotate(-enemy.angle);
        ctx.strokeStyle = withAlpha(enemy.color, 0.55);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 5, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : '#eafff0';
        ctx.beginPath();
        ctx.arc(0, 0, 5.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#08140c';
        ctx.beginPath();
        ctx.arc(0, 0, 2.3, 0, TAU);
        ctx.fill();
      } else if (enemy.kind === 'boss') {
        const spin = this.elapsed * 0.6;
        ctx.strokeStyle = withAlpha(enemy.color, 0.36);
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 9]);
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 16, spin, spin + TAU * 0.8);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = withAlpha(enemy.color, 0.55);
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (i * TAU) / 8;
          ctx.moveTo(
            Math.cos(angle) * (enemy.radius - 3),
            Math.sin(angle) * (enemy.radius - 3),
          );
          ctx.lineTo(
            Math.cos(angle) * (enemy.radius + 10),
            Math.sin(angle) * (enemy.radius + 10),
          );
        }
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (i * TAU) / 8;
          const px = Math.cos(angle) * enemy.radius;
          const py = Math.sin(angle) * enemy.radius;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = enemy.hitFlash > 0 ? '#ffffff' : enemy.color;
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.rotate(-enemy.angle);
        ctx.strokeStyle = withAlpha(enemy.color, 0.5);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius * 0.58, 0, TAU);
        ctx.stroke();

        ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : 'rgba(38, 3, 13, 0.94)';
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius * 0.34, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = withAlpha(enemy.color, 0.85);
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : '#ffe4ea';
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, TAU);
        ctx.fill();
        ctx.fillStyle = enemy.color;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, TAU);
        ctx.fill();

        ctx.rotate(enemy.angle);
        ctx.fillStyle = withAlpha(enemy.color, 0.24);
        ctx.strokeStyle = withAlpha(enemy.color, 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(enemy.radius * 0.62, -8, enemy.radius * 0.58, 16, 4);
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();

      if (enemy.kind === 'boss' && this.bossWindup > 0) {
        const pulse = 0.5 + Math.sin(this.ambientTime * 24) * 0.28;
        const color = this.bossAttackKind === 'summon' ? '#ffc857' : BOSS_COLOR;
        ctx.save();
        ctx.strokeStyle = withAlpha(color, 0.82);
        ctx.lineWidth = 3 / this.zoom;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 20 + pulse * 8, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = withAlpha(color, 0.34);
        ctx.setLineDash([8 / this.zoom, 12 / this.zoom]);
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius + 34 + pulse * 10, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      if (enemy.kind !== 'boss' && enemy.hp < enemy.maxHp && enemy.age > 0.2) {
        const barWidth = Math.max(30, enemy.radius * 2.1);
        const barY = enemy.y - enemy.radius - 14;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(enemy.x - barWidth / 2, barY, barWidth, 4);
        ctx.fillStyle = enemy.color;
        ctx.fillRect(
          enemy.x - barWidth / 2,
          barY,
          barWidth * Math.max(0, enemy.hp / enemy.maxHp),
          4,
        );
      }
    }
  }

  private drawPlayer() {
    const ctx = this.ctx;
    const player = this.player;
    if (player.dead) return;
    const blink = player.invuln > 0 && Math.floor(this.elapsed * 18) % 2 === 0;
    const pulse = 1 + Math.sin(this.ambientTime * 3) * 0.04;

    ctx.save();
    ctx.translate(player.x, player.y);

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 22, 9, 0, 0, TAU);
    ctx.fill();

    // Aura
    const aura = ctx.createRadialGradient(0, 0, 6, 0, 0, 46);
    aura.addColorStop(0, 'rgba(95, 246, 255, 0.17)');
    aura.addColorStop(1, 'rgba(95, 246, 255, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, TAU);
    ctx.fill();

    if (player.invuln > 0) {
      ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.45);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, 27 + Math.sin(this.elapsed * 10) * 2, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.rotate(player.angle);
    ctx.globalAlpha = blink ? 0.55 : 1;

    // Barrel
    ctx.fillStyle = 'rgba(10, 35, 46, 0.95)';
    ctx.strokeStyle = PLAYER_COLOR;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(2, -5, 26, 10, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = withAlpha(PLAYER_COLOR, 0.55);
    ctx.fillRect(12, -2, 12, 4);

    // Rear fins
    ctx.fillStyle = withAlpha(PLAYER_COLOR, 0.18);
    ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.8);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-6, -10);
    ctx.lineTo(-20, -16);
    ctx.lineTo(-14, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, 10);
    ctx.lineTo(-20, 16);
    ctx.lineTo(-14, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hull
    ctx.fillStyle = '#071722';
    ctx.strokeStyle = PLAYER_COLOR;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 17 * pulse, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Inner details
    ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.4);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 11.5, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = '#d9fdff';
    ctx.beginPath();
    ctx.arc(0, 0, 5.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = PLAYER_COLOR;
    ctx.beginPath();
    ctx.arc(0, 0, 2.4, 0, TAU);
    ctx.fill();

    // Muzzle flash
    if (player.muzzle > 0) {
      const flash = Math.min(1, player.muzzle / 0.06);
      ctx.fillStyle = withAlpha('#ffffff', 0.82 * flash);
      ctx.beginPath();
      ctx.moveTo(29, 0);
      ctx.lineTo(40 + 8 * flash, -9);
      ctx.lineTo(38, 0);
      ctx.lineTo(40 + 8 * flash, 9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = withAlpha(player.muzzleColor, 0.5 * flash);
      ctx.beginPath();
      ctx.arc(30, 0, 12 * flash, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawParticles() {
    const ctx = this.ctx;
    if (!this.particles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const particle of this.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * (0.45 + alpha * 0.55), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawFloaters() {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const floater of this.floaters) {
      const alpha = clamp(floater.life / floater.maxLife, 0, 1);
      ctx.globalAlpha = Math.min(1, alpha * 1.8);
      ctx.font = `700 ${floater.size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.restore();
  }

  private drawAutoTarget() {
    if (!this.input.autoAim || !this.autoTarget || this.autoTarget.dead) return;
    const ctx = this.ctx;
    const target = this.autoTarget;
    const radius = target.radius + 12;
    const time = this.ambientTime;
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.85);
    ctx.lineWidth = 1.6 / this.zoom;
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = -time * 18;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    const bracket = 7;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const x = Math.cos(angle) * (radius + 5);
      const y = Math.sin(angle) * (radius + 5);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.95);
      ctx.lineWidth = 2 / this.zoom;
      ctx.beginPath();
      ctx.moveTo(-bracket, 0);
      ctx.lineTo(bracket, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawCrosshair() {
    const ctx = this.ctx;
    const x = this.input.mouseScreenX;
    const y = this.input.mouseScreenY;
    ctx.save();
    ctx.translate(x, y);
    const pulse = 1 + Math.sin(this.ambientTime * 5) * 0.06;
    ctx.strokeStyle = 'rgba(95, 246, 255, 0.9)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 11 * pulse, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(95, 246, 255, 0.55)';
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      ctx.moveTo(Math.cos(angle) * 16, Math.sin(angle) * 16);
      ctx.lineTo(Math.cos(angle) * 23, Math.sin(angle) * 23);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 1.8, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private drawOverlayEffects(shakeX: number, shakeY: number) {
    const ctx = this.ctx;
    const { width, height } = this;

    // Slow drifting dust
    ctx.save();
    for (const mote of this.motes) {
      const x = (mote.x * width + this.ambientTime * mote.drift) % (width + 30) - 15;
      const y = mote.y * height + Math.sin(this.ambientTime * 0.6 + mote.phase) * 10;
      ctx.globalAlpha = 0.1 + Math.sin(this.ambientTime + mote.phase) * 0.05;
      ctx.fillStyle = mote.color;
      ctx.beginPath();
      ctx.arc(x, y, mote.size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    if (this.vignette) {
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, width, height);
    }

    // Chromatic-ish edge glow while hurt
    if (this.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255, 41, 91, ${this.hurtFlash * 0.16})`;
      ctx.fillRect(0, 0, width, height);
    }
    if (this.healFlash > 0) {
      ctx.fillStyle = `rgba(88, 255, 151, ${this.healFlash * 0.09})`;
      ctx.fillRect(0, 0, width, height);
    }
    if (this.player.hp > 0 && this.player.hp < 34) {
      const danger = (1 - this.player.hp / 34) * (0.14 + Math.sin(this.ambientTime * 5) * 0.05);
      const grad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.32,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.72,
      );
      grad.addColorStop(0, 'rgba(255, 20, 60, 0)');
      grad.addColorStop(1, `rgba(255, 20, 60, ${Math.max(0, danger)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    if (this.killFlash > 0) {
      ctx.fillStyle = `rgba(190, 255, 255, ${this.killFlash * 0.045})`;
      ctx.fillRect(0, 0, width, height);
    }

    // Impact frame
    if (this.shake > 7) {
      ctx.save();
      ctx.translate(width / 2 + shakeX, height / 2 + shakeY);
      ctx.strokeStyle = `rgba(255, 77, 125, ${Math.min(0.4, this.shake / 45)})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(6, 6, width - 12, height - 12);
      ctx.restore();
    }
  }

  private drawBanner() {
    const banner = this.banner;
    if (!banner) return;
    const ctx = this.ctx;
    const t = banner.time;
    const progress = 1 - t / banner.duration;
    const alpha = Math.min(1, progress * 6, t * 2.2);
    const y =
      this.height *
      (this.mode === 'boss'
        ? this.width < 620
          ? 0.38
          : 0.3
        : this.width < 620
          ? 0.3
          : 0.25);
    const titleSize = this.width < 620 ? 30 : 44;
    const subSize = this.width < 620 ? 11 : 13;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeStyle = withAlpha(banner.color, 0.45);
    ctx.lineWidth = 1;
    const lineW = Math.min(this.width * 0.34, 240);
    ctx.beginPath();
    ctx.moveTo(this.width / 2 - lineW, y);
    ctx.lineTo(this.width / 2 - 24, y);
    ctx.moveTo(this.width / 2 + 24, y);
    ctx.lineTo(this.width / 2 + lineW, y);
    ctx.stroke();

    ctx.fillStyle = withAlpha(banner.color, 0.16);
    ctx.fillRect(this.width / 2 - 3, y - 3, 6, 6);

    ctx.font = `800 ${titleSize}px "Arial Narrow", "DIN Condensed", ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = '#eaffff';
    ctx.shadowColor = banner.color;
    ctx.shadowBlur = 24;
    ctx.fillText(banner.title, this.width / 2, y - 1);
    ctx.shadowBlur = 0;

    ctx.font = `500 ${subSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = withAlpha(banner.color, 0.9);
    ctx.fillText(banner.sub, this.width / 2, y + titleSize * 0.72);
    ctx.restore();
  }

  private drawMenuAtmosphere() {
    const ctx = this.ctx;
    const { width, height } = this;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Slow scan beam
    const beam = (this.ambientTime * 22) % (height + 260) - 130;
    const grad = ctx.createLinearGradient(0, beam - 80, 0, beam + 80);
    grad.addColorStop(0, 'rgba(95, 246, 255, 0)');
    grad.addColorStop(0.5, 'rgba(95, 246, 255, 0.045)');
    grad.addColorStop(1, 'rgba(95, 246, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, beam - 80, width, 160);
    ctx.restore();
  }
}

function segmentCircleHit(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  radius: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  let t = 0;
  if (lengthSq > 0) {
    t = clamp(((cx - x1) * dx + (cy - y1) * dy) / lengthSq, 0, 1);
  }
  const px = x1 + dx * t;
  const py = y1 + dy * t;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= radius * radius;
}
