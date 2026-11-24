import { SoundFX } from './audio';
import {
  roomKindAt,
  type EnemyKind,
  type GameCallbacks,
  type GameMode,
  type HudSnapshot,
  type WeaponId,
} from './types';
import { WEAPONS, nextWeapon, type WeaponSpec } from './weapons';

const TAU = Math.PI * 2;

// Dungeon layout: five 1000x1000 rooms in a straight horizontal line.
const ROOM_SIZE = 1000;
const DUNGEON_ROOMS = 5;
const DUNGEON_WIDTH = ROOM_SIZE * DUNGEON_ROOMS;
const BOSS_SIZE = 1000;
const WALL_THICK = 52;
const WALL_PAD = WALL_THICK / 2;
const DOOR_HALF = 118;
const DOOR_Y = ROOM_SIZE / 2;
const PORTAL_X = (DUNGEON_ROOMS - 1) * ROOM_SIZE + ROOM_SIZE / 2;
const PORTAL_Y = ROOM_SIZE / 2;
const PORTAL_RADIUS = 46;
const CLEAR_HEAL = 12;
const FLOOR_HEAL = 18;
const AUTOAIM_RANGE = 1400;

// Camera framing is the same on every device: the view keeps roughly one
// screen-height of world (VIEW_WORLD_H) visible vertically, and never shows
// less than the full 1000-wide room. Phones used to see ~518 world pixels of
// height against a desktop's 672, which made them read as much harder simply
// because threats appeared later, so the height target now drives the zoom.
const VIEW_WORLD_H = 660;
const VIEW_MIN_ZOOM = 0.62;
const VIEW_MAX_ZOOM = 1.28;

const PLAYER_COLOR = '#5ff6ff';
const SECONDARY_COLOR = '#ffc857';
const ENEMY_GLOW = 0.16;

const PLAYER_SPEED = 270;

// Splitter: lobs one shell at where the player stood when it fired. The shell
// bursts into a ring of faster, long-range bullets where it lands, or early if
// it touches anything of the player's.
const SHELL_SPEED = 250;
const SHELL_RADIUS = 9;
const SHELL_FLIGHT_TIME = 5;
const SPLIT_RING_COUNT = 20;
const SPLIT_BULLET_SPEED = 430;
const SPLIT_BULLET_LIFE = 999;
const SPLIT_BULLET_DAMAGE = 8;

// Homing: the missile steers after the player for a short window, then loses
// its lock and flies straight. Touching a wall or the player sets off a small
// blast; after running out of life it just fizzles out.
const HOMING_COLOR = '#ff5bd0';
const HOMING_SPEED = 255;
// Steering is capped, so a well-timed dodge breaks the lock instead of the
// missile simply outrunning the player.
const HOMING_TURN_RATE = 2.2;
const HOMING_SEEK_TIME = 2.2;
const HOMING_LIFE = 7;
const HOMING_RADIUS = 7;
const HOMING_BLAST_RADIUS = 34;
const HOMING_BLAST_DAMAGE = 6;
const HOMING_TRAIL_POINTS = 9;

const SECONDARY_COOLDOWN = 3.4;
const SECONDARY_PELLETS = 7;
// Dodge: speed is 1.4x the walk speed, the slide is 20% longer than the
// previous 132px pass (132 -> 158.4px), and the 1s cooldown only starts
// counting once the slide itself is over.
const DODGE_COOLDOWN = 1;
const DASH_SPEED_MULT = 1.4;
const DASH_SPEED = PLAYER_SPEED * DASH_SPEED_MULT;
const DASH_DISTANCE = 158.4;
const DASH_TIME = DASH_DISTANCE / DASH_SPEED;
// HUD sweep spans the slide plus the cooldown that follows it.
const DODGE_CYCLE = DASH_TIME + DODGE_COOLDOWN;

const BOSS_HP = 320;
const BOSS_RADIUS = 58;
const BOSS_COLOR = '#ff3860';
const TEST_COLOR = '#ff9f43';
const BOSS_CONTACT_DAMAGE = 28;
const BOSS_SCORE = 1600;
const BOSS_VICTORY_DELAY = 1.6;

// Enemy behaviour timer: every enemy replays a shuffled rotation of one move,
// one attack and two idle actions, then rolls a fresh rotation.
const ENEMY_ACTIONS: EnemyAction[] = ['move', 'attack', 'idle', 'idle'];
const ENEMY_LEGS_MIN = 3;
const ENEMY_LEGS_MAX = 5;
// Each hop lands on a ring around the position the move action started from.
const ENEMY_RING_MIN = 58;
const ENEMY_RING_MAX = 108;
// 80% of the hops correct the distance to the enemy's preferred range.
const ENEMY_APPROACH_CHANCE = 0.8;
const ENEMY_IDLE_JITTER = 0.5;
const ENEMY_LEG_TIMEOUT = 1.8;
const ENEMY_LANE_PAD = 20;

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

type EnemyAction = 'move' | 'attack' | 'idle';
type AttackPhase = 'windup' | 'active' | 'recover';

const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  grunt: { radius: 16, hp: 4, speed: 86, damage: 12, score: 10, color: '#ff4d7d' },
  runner: { radius: 12, hp: 3, speed: 154, damage: 8, score: 15, color: '#ffc857' },
  tank: { radius: 26, hp: 16, speed: 52, damage: 22, score: 35, color: '#b48cff' },
  spitter: { radius: 16, hp: 6, speed: 66, damage: 10, score: 25, color: '#7dff9b' },
  splitter: { radius: 18, hp: 9, speed: 62, damage: 10, score: 30, color: TEST_COLOR },
  homing: { radius: 17, hp: 10, speed: 64, damage: 10, score: 35, color: HOMING_COLOR },
  boss: {
    radius: BOSS_RADIUS,
    hp: BOSS_HP,
    speed: 60,
    damage: BOSS_CONTACT_DAMAGE,
    score: BOSS_SCORE,
    color: BOSS_COLOR,
  },
};

interface EnemyAttackDef {
  /**
   * sweep = a line segment spinning once around the enemy, shot = direct
   * bullets, shell = one lobbed projectile that splits into a ring,
   * homing = missiles that chase for a while and then fly straight.
   */
  mode: 'sweep' | 'shot' | 'shell' | 'homing';
  /** 前摇: telegraph before the hit lands. */
  windup: number;
  /** 判定: sweep duration / burst window. */
  active: number;
  /** 后摇: recovery before the next action. */
  recovery: number;
  /** Blade length, or max firing range for shots. */
  reach: number;
  damage: number;
  shots: number;
  interval: number;
}

interface EnemyBehaviorDef {
  /** Preferred distance to the player: melee hugs, ranged keeps its space. */
  range: number;
  /** Deliberately slow shuffle speed (px/s) for the straight-line hops. */
  moveSpeed: number;
  attack: EnemyAttackDef;
}

const ENEMY_BEHAVIOR: Record<EnemyKind, EnemyBehaviorDef> = {
  grunt: {
    range: 105,
    moveSpeed: 70,
    attack: {
      mode: 'sweep',
      windup: 0.55,
      active: 0.5,
      recovery: 0.4,
      reach: 120,
      damage: 12,
      shots: 1,
      interval: 0,
    },
  },
  runner: {
    range: 85,
    moveSpeed: 112,
    attack: {
      mode: 'sweep',
      windup: 0.32,
      active: 0.36,
      recovery: 0.26,
      reach: 96,
      damage: 8,
      shots: 1,
      interval: 0,
    },
  },
  tank: {
    range: 138,
    moveSpeed: 46,
    attack: {
      mode: 'sweep',
      windup: 0.85,
      active: 0.9,
      recovery: 0.6,
      reach: 172,
      damage: 22,
      shots: 1,
      interval: 0,
    },
  },
  spitter: {
    range: 430,
    moveSpeed: 60,
    attack: {
      mode: 'shot',
      windup: 0.6,
      active: 0.52,
      recovery: 0.45,
      reach: 640,
      damage: 9,
      shots: 3,
      interval: 0.18,
    },
  },
  splitter: {
    range: 400,
    moveSpeed: 62,
    attack: {
      mode: 'shell',
      windup: 0.75,
      active: 0.12,
      recovery: 0.6,
      reach: 900,
      damage: 12,
      shots: 1,
      interval: 0,
    },
  },
  homing: {
    range: 460,
    moveSpeed: 60,
    attack: {
      mode: 'homing',
      windup: 0.8,
      active: 0.5,
      recovery: 0.7,
      reach: 900,
      damage: 10,
      shots: 2,
      interval: 0.34,
    },
  },
  // The boss keeps its own scripted pattern; this entry is only a fallback.
  boss: {
    range: 300,
    moveSpeed: 60,
    attack: {
      mode: 'sweep',
      windup: 0.6,
      active: 0.5,
      recovery: 0.4,
      reach: 120,
      damage: BOSS_CONTACT_DAMAGE,
      shots: 1,
      interval: 0,
    },
  },
};

interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  knockX: number;
  knockY: number;
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
  weapon: WeaponId;
  dead: boolean;
}

interface EnemyBrain {
  /** Current rotation of actions, re-rolled once it is played through. */
  queue: EnemyAction[];
  index: number;
  started: boolean;

  // move action
  legsLeft: number;
  anchorX: number;
  anchorY: number;
  ringRadius: number;
  targetX: number;
  targetY: number;
  legSpeed: number;
  legTime: number;
  legTimer: number;
  lastLegTime: number;

  // attack action
  phase: AttackPhase;
  timer: number;
  sweepFrom: number;
  sweepAngle: number;
  sweepHit: boolean;
  shotsLeft: number;
  fireTimer: number;

  // idle action
  idleTimer: number;
}

function createEnemyBrain(): EnemyBrain {
  return {
    queue: [],
    index: 0,
    started: false,
    legsLeft: 0,
    anchorX: 0,
    anchorY: 0,
    ringRadius: 0,
    targetX: 0,
    targetY: 0,
    legSpeed: 0,
    legTime: 0,
    legTimer: 0,
    lastLegTime: 0,
    phase: 'windup',
    timer: 0,
    sweepFrom: 0,
    sweepAngle: 0,
    sweepHit: false,
    shotsLeft: 0,
    fireTimer: 0,
    idleTimer: 0,
  };
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
  brain: EnemyBrain;
  desiredX: number;
  desiredY: number;
  desiredSpeed: number;
  turnRate: number;
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
  pierce: number;
  hitIds: number[];
  /**
   * Homing shot: the id and point are snapshotted when the trigger is pulled.
   * A dead target keeps its death position here, so the missile flies on to
   * that spot instead of switching to somebody else.
   */
  missile?: {
    targetId: number;
    x: number;
    y: number;
    dead: boolean;
    angle: number;
    turnRate: number;
  };
  /** Short curved trail, so the visual offset reads as a homing turn. */
  trail?: Array<{ x: number; y: number }>;
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

// Lobbed projectile that bursts into a ring where it lands.
interface EnemyShell {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  targetX: number;
  targetY: number;
  traveled: number;
  total: number;
  life: number;
  color: string;
  spin: number;
}

// Missile that chases the player for a while, then locks its heading.
interface EnemyHoming {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  /** Heading in radians; the missile always travels along it. */
  angle: number;
  radius: number;
  damage: number;
  /** Seconds of steering left. At zero it flies straight. */
  seek: number;
  life: number;
  color: string;
  spin: number;
  trail: Array<{ x: number; y: number }>;
}

// Small round blast left where a homing missile breaks.
interface Blast {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
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

// Dash afterimage: a frozen copy of the ship that fades out behind the slide.
interface DashGhost {
  x: number;
  y: number;
  angle: number;
  dirX: number;
  dirY: number;
  life: number;
  maxLife: number;
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
  private mode: GameMode = 'dungeon';
  private worldW = DUNGEON_WIDTH;
  private worldH = ROOM_SIZE;
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
  private shells: EnemyShell[] = [];
  private homings: EnemyHoming[] = [];
  private blasts: Blast[] = [];
  private particles: Particle[] = [];
  private ghosts: DashGhost[] = [];
  private dashGhostTimer = 0;
  // Expanding ring left at the launch point so a dodge reads even at a glance.
  private dashRing = { x: 0, y: 0, life: 0, maxLife: 0.36 };
  private dashFlash = 0;
  // Light streak left behind by the finished slide, fading for a moment so the
  // dash stays readable even after it ends.
  private dashTrail = { x1: 0, y1: 0, x2: 0, y2: 0, life: 0, maxLife: 0.34 };
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
  // Test room (the old boss arena): endless splitter waves for playtesting.
  private testWave = 0;
  private testWaveTimer = 0;

  private input: InputState = {
    keys: new Set(),
    touchX: 0,
    touchY: 0,
    touchFire: false,
    fireKey: false,
  };

  private camera = { x: ROOM_SIZE / 2, y: ROOM_SIZE / 2 };
  private zoom = 1;
  private shake = 0;
  private hurtFlash = 0;
  private healFlash = 0;
  private killFlash = 0;

  private score = 0;
  private kills = 0;
  private combo = 0;
  private comboTimer = 0;
  private floor = 1;
  private roomIndex = 0;
  private roomCleared: boolean[] = [false, false, false, false, false];
  private encounterActive = false;
  private spawnQueue: EnemyKind[] = [];
  private spawnTimer = 0;
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

  start(mode: GameMode = 'dungeon') {
    this.mode = mode;
    this.worldW = mode === 'boss' ? BOSS_SIZE : DUNGEON_WIDTH;
    this.worldH = mode === 'boss' ? BOSS_SIZE : ROOM_SIZE;
    this.updateZoom();
    this.buildDecorations();
    this.sfx.unlock();
    this.resetWorld();
    this.phase = 'playing';
    this.paused = false;
    if (mode === 'boss') {
      this.beginTestRoom();
    } else {
      this.beginRun();
    }
    this.emitHud(true);
  }

  toMenu() {
    this.phase = 'idle';
    this.paused = false;
    this.mode = 'dungeon';
    this.worldW = DUNGEON_WIDTH;
    this.worldH = ROOM_SIZE;
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
  }

  setTouchFire(active: boolean) {
    this.input.touchFire = active;
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
    // i-frames cover the whole slide, which is now longer than the old 0.3s.
    player.invuln = Math.max(player.invuln, DASH_TIME + 0.05);
    player.vx = player.dashDirX * DASH_SPEED;
    player.vy = player.dashDirY * DASH_SPEED;
    // Cooldown starts after the slide, so the gap between two dodges is
    // DODGE_COOLDOWN plus the slide time.
    this.dodgeCooldown = DODGE_CYCLE;
    this.dashRing.x = player.x;
    this.dashRing.y = player.y;
    this.dashRing.life = this.dashRing.maxLife;
    this.dashFlash = 0.22;
    this.dashTrail.life = 0;
    this.dashGhostTimer = 0;
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

  clearInput() {
    this.input.keys.clear();
    this.input.fireKey = false;
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
      x: this.mode === 'boss' ? this.worldW / 2 : ROOM_SIZE / 2,
      y: this.worldH / 2,
      vx: 0,
      vy: 0,
      knockX: 0,
      knockY: 0,
      radius: 17,
      hp: 100,
      maxHp: 100,
      speed: PLAYER_SPEED,
      angle: -Math.PI / 2,
      fireCooldown: 0,
      invuln: 0,
      muzzle: 0,
      muzzleColor: PLAYER_COLOR,
      trailTimer: 0,
      dashTime: 0,
      dashDirX: 0,
      dashDirY: 0,
      weapon: 'pulse',
      dead: false,
    };
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;

    this.enemies = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.shells = [];
    this.homings = [];
    this.blasts = [];
    this.particles = [];
    this.ghosts = [];
    this.dashGhostTimer = 0;
    this.dashRing.life = 0;
    this.dashFlash = 0;
    this.dashTrail.life = 0;
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
    this.floor = 1;
    this.roomIndex = 0;
    this.roomCleared = [false, false, false, false, false];
    this.encounterActive = false;
    this.spawnQueue = [];
    this.spawnTimer = 0;
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
    this.updateShells(dt);
    this.updateHomings(dt);
    this.updatePickups(dt);
    if (this.mode === 'dungeon') this.updateDungeon(dt);
    else this.updateTestRoom(dt);
    this.updateFx(dt);
    this.updateCamera();

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
      this.camera.x += (ROOM_SIZE / 2 - this.camera.x) * Math.min(1, dt * 2);
      this.camera.y += (this.worldH / 2 - this.camera.y) * Math.min(1, dt * 2);
    }
  }

  private updateCamera() {
    // The camera is locked to the player instead of easing behind them, so the
    // view never keeps drifting after the stick is released.
    let targetX = this.player.x;
    let targetY = this.player.y;
    if (this.mode === 'boss' && this.boss && !this.boss.dead) {
      targetX += (this.boss.x - targetX) * 0.28;
      targetY += (this.boss.y - targetY) * 0.28;
    }
    this.camera.x = targetX;
    this.camera.y = targetY;
    this.clampCamera();
  }

  private updateZoom() {
    const maxZoom = this.mode === 'boss' ? 1.08 : VIEW_MAX_ZOOM;
    // Height sets the scale (same slice of world everywhere), the width term
    // keeps the whole room on screen on narrower viewports.
    this.zoom = clamp(
      Math.min(this.height / VIEW_WORLD_H, this.width / ROOM_SIZE),
      VIEW_MIN_ZOOM,
      maxZoom,
    );
    this.clampCamera();
  }

  private roomLeft(index: number) {
    return index * ROOM_SIZE;
  }

  private clampCamera() {
    const halfW = this.width / (2 * this.zoom);
    const halfH = this.height / (2 * this.zoom);
    // Dungeon rooms are viewed one at a time: the camera never leaves the
    // current room, which also makes the room transition read as a clean cut.
    const viewW = this.mode === 'boss' ? this.worldW : ROOM_SIZE;
    const left = this.mode === 'boss' ? 0 : this.roomLeft(this.roomIndex);
    if (halfW * 2 < viewW) {
      this.camera.x = clamp(this.camera.x, left + halfW, left + viewW - halfW);
    } else {
      this.camera.x = left + viewW / 2;
    }
    if (halfH * 2 < this.worldH) {
      this.camera.y = clamp(this.camera.y, halfH, this.worldH - halfH);
    } else {
      this.camera.y = this.worldH / 2;
    }
  }

  private countCleared() {
    let cleared = 0;
    for (let room = 1; room <= DUNGEON_ROOMS - 2; room++) {
      if (this.roomCleared[room]) cleared += 1;
    }
    return cleared;
  }

  private isDoorOpen(boundary: number) {
    if (boundary <= 0 || boundary >= DUNGEON_ROOMS) return false;
    // Combat rooms seal both doors until the encounter is cleared.
    if (this.encounterActive) return false;
    if (boundary === 1) return true;
    return this.roomCleared[boundary - 1];
  }

  private roomBounds() {
    const left = this.roomLeft(this.roomIndex);
    return {
      left: left + WALL_PAD,
      right: left + ROOM_SIZE - WALL_PAD,
      top: WALL_PAD,
      bottom: this.worldH - WALL_PAD,
    };
  }

  private outOfRoom(x: number, y: number, pad: number) {
    const bounds = this.roomBounds();
    return (
      x < bounds.left - pad ||
      x > bounds.right + pad ||
      y < bounds.top - pad ||
      y > bounds.bottom + pad
    );
  }

  private confinePlayer() {
    const player = this.player;
    const bounds = this.roomBounds();
    player.y = clamp(player.y, bounds.top + 24, bounds.bottom - 24);

    if (this.mode === 'boss') {
      player.x = clamp(player.x, bounds.left + 24, bounds.right - 24);
      return;
    }

    const left = bounds.left + player.radius;
    const right = bounds.right - player.radius;
    if (player.x >= left && player.x <= right) return;

    // Allow crossing only through an open doorway, judged at the seam between
    // the current room and its neighbour.
    const boundary = player.x < left ? this.roomIndex : this.roomIndex + 1;
    const inDoorway = Math.abs(player.y - DOOR_Y) <= DOOR_HALF - player.radius;
    if (inDoorway && this.isDoorOpen(boundary)) {
      const nextRoom = clamp(Math.floor(player.x / ROOM_SIZE), 0, DUNGEON_ROOMS - 1);
      if (nextRoom !== this.roomIndex) {
        this.roomIndex = nextRoom;
        this.clampCamera();
      }
      return;
    }
    player.x = clamp(player.x, left, right);
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
      if (player.dashTime === 0 && this.dashTrail.life === 0) {
        this.dashTrail.x1 = this.dashRing.x;
        this.dashTrail.y1 = this.dashRing.y;
        this.dashTrail.x2 = player.x;
        this.dashTrail.y2 = player.y;
        this.dashTrail.life = this.dashTrail.maxLife;
      }
      player.vx = player.dashDirX * DASH_SPEED;
      player.vy = player.dashDirY * DASH_SPEED;
      this.dashGhostTimer -= dt;
      if (this.dashGhostTimer <= 0) {
        this.dashGhostTimer = 0.045;
        this.ghosts.push({
          x: player.x,
          y: player.y,
          angle: player.angle,
          dirX: player.dashDirX,
          dirY: player.dashDirY,
          life: 0.26,
          maxLife: 0.26,
        });
      }
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
      // No inertia: velocity follows the stick exactly, so releasing it stops
      // the character in the same frame instead of sliding on.
      player.vx = targetVx;
      player.vy = targetVy;

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

    // External impulses (contact hits, blasts) are tracked separately from the
    // stick velocity so they can shove the player without reintroducing drift.
    const knockDecay = Math.exp(-7 * dt);
    player.knockX *= knockDecay;
    player.knockY *= knockDecay;
    if (Math.abs(player.knockX) < 0.5) player.knockX = 0;
    if (Math.abs(player.knockY) < 0.5) player.knockY = 0;

    player.x += (player.vx + player.knockX) * dt;
    player.y += (player.vy + player.knockY) * dt;
    this.confinePlayer();

    player.fireCooldown -= dt;
    player.invuln = Math.max(0, player.invuln - dt);
    player.muzzle = Math.max(0, player.muzzle - dt);

    // Range-limited weapons only auto-aim at targets they can actually lock.
    // Past that ring there is no reticle and no turn: the shot just goes
    // wherever the player is already facing.
    const aimRange = WEAPONS[player.weapon].range ?? AUTOAIM_RANGE;
    this.autoTarget = this.findNearestEnemy(player.x, player.y, aimRange, true);
    if (this.autoTarget) {
      player.angle = Math.atan2(this.autoTarget.y - player.y, this.autoTarget.x - player.x);
    } else if (move.magnitude > 0.12) {
      player.angle = Math.atan2(move.y, move.x);
    }

    const firing = this.input.fireKey || this.input.touchFire;
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

  cycleWeapon() {
    if (this.phase !== 'playing' || this.paused || this.player.dead) return;
    const next = nextWeapon(this.player.weapon);
    this.player.weapon = next;
    const spec = WEAPONS[next];
    this.floaters.push({
      x: this.player.x,
      y: this.player.y - 44,
      text: spec.name,
      color: spec.color,
      life: 0.9,
      maxLife: 0.9,
      size: 16,
    });
    this.spawnBurst(this.player.x, this.player.y, spec.color, 10, 120, 0.35);
    this.sfx.play('pickup');
    this.emitHud(true);
  }

  private firePlayerBullet() {
    const player = this.player;
    const weapon = WEAPONS[player.weapon];
    player.fireCooldown = weapon.cooldown;
    player.muzzle = weapon.pellets > 1 || weapon.id === 'rail' ? 0.1 : 0.06;
    player.muzzleColor = weapon.color;

    const offset = 26;
    for (let i = 0; i < weapon.pellets; i++) {
      if (weapon.homing) {
        this.spawnMissile(weapon, offset);
        continue;
      }
      const fan =
        weapon.pellets > 1
          ? (i / (weapon.pellets - 1) - 0.5) * weapon.spread
          : 0;
      const jitter = weapon.pellets > 1 ? weapon.spread * 0.08 : weapon.spread / 2;
      const angle = player.angle + fan + rand(-jitter, jitter);
      const x = player.x + Math.cos(angle) * offset;
      const y = player.y + Math.sin(angle) * offset;
      this.bullets.push({
        x,
        y,
        prevX: x,
        prevY: y,
        vx: Math.cos(angle) * weapon.speed,
        vy: Math.sin(angle) * weapon.speed,
        radius: weapon.radius,
        damage: weapon.damage,
        life: weapon.life,
        color: weapon.color,
        pierce: weapon.pierce,
        hitIds: [],
      });
    }

    const muzzleCount = weapon.pellets > 1 ? 10 : weapon.id === 'rail' ? 12 : 4;
    for (let i = 0; i < muzzleCount; i++) {
      const spread = player.angle + Math.PI + rand(-0.6, 0.6);
      const velocity = rand(40, weapon.id === 'rail' ? 320 : 150);
      this.particles.push({
        x: player.x + Math.cos(player.angle) * offset + rand(-3, 3),
        y: player.y + Math.sin(player.angle) * offset + rand(-3, 3),
        vx: Math.cos(spread) * velocity,
        vy: Math.sin(spread) * velocity,
        life: rand(0.06, 0.18),
        maxLife: 0.18,
        size: rand(1.5, 3.4),
        color: weapon.color,
        drag: 8,
      });
    }
    this.shake = Math.max(
      this.shake,
      weapon.id === 'rail' ? 4.2 : weapon.pellets > 1 ? 2.6 : 0.9,
    );
    this.sfx.play(
      weapon.id === 'rail' ? 'rail' : weapon.id === 'scatter' ? 'scatter' : 'shoot',
    );
  }

  /**
   * Fires one seeker missile. The target is chosen now and never swapped: on
   * death, damageEnemy rewrites the lock to the death spot, and the missile
   * flies there before fizzling out. With nobody in range it simply flies
   * straight ahead. The launch offset is cosmetic — the steering corrects it.
   */
  private spawnMissile(weapon: WeaponSpec, offset: number) {
    const player = this.player;
    const range = weapon.range ?? 240;
    const target = this.findNearestEnemy(player.x, player.y, range, false);
    const side = Math.random() < 0.5 ? -1 : 1;
    const lateral = 15 * side;
    // The angled launch only exists to show the homing turn. Without a target
    // there is nothing to correct it, so the shot goes straight forward.
    const launchAngle = target ? player.angle + side * 0.18 : player.angle;
    const x =
      player.x +
      Math.cos(player.angle) * offset +
      Math.cos(player.angle + Math.PI / 2) * lateral;
    const y =
      player.y +
      Math.sin(player.angle) * offset +
      Math.sin(player.angle + Math.PI / 2) * lateral;
    const speed = weapon.speed;
    // Give the curved path a little cushion, but keep the projectile close to
    // the advertised range; a shot with no target ends exactly at that range.
    const life = target
      ? Math.min(
          weapon.life,
          Math.max(0.22, dist(player.x, player.y, target.x, target.y) / speed + 0.04),
        )
      : range / speed;

    this.bullets.push({
      x,
      y,
      prevX: x,
      prevY: y,
      vx: Math.cos(launchAngle) * speed,
      vy: Math.sin(launchAngle) * speed,
      radius: weapon.radius,
      damage: weapon.damage,
      life,
      color: weapon.color,
      pierce: 0,
      hitIds: [],
      trail: [{ x, y }],
      missile: target
        ? {
            targetId: target.id,
            x: target.x,
            y: target.y,
            dead: false,
            angle: launchAngle,
            turnRate: weapon.turnRate ?? 8,
          }
        : undefined,
    });
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
        pierce: 0,
        hitIds: [],
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
      this.shells = [];
      this.homings = [];
      this.blasts = [];
      this.sfx.play('death');
      this.emitHud(true);
      this.callbacks.onGameOver(
        {
          mode: this.mode,
          score: this.score,
          kills: this.kills,
          time: this.elapsed,
          floor: this.floor,
          roomsCleared: this.countCleared(),
          wave: this.testWave,
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

      const missile = bullet.missile;
      const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
      if (missile) {
        // Refresh the lock point only while the locked target is alive. A dead
        // target leaves the last point (its death spot) in place.
        if (!missile.dead) {
          const target = this.enemies.find(
            (enemy) => enemy.id === missile.targetId && !enemy.dead,
          );
          if (target) {
            missile.x = target.x;
            missile.y = target.y;
          } else {
            missile.dead = true;
          }
        }
        const want = Math.atan2(missile.y - bullet.y, missile.x - bullet.x);
        const maxTurn = missile.turnRate * dt;
        missile.angle += clamp(angleDelta(missile.angle, want), -maxTurn, maxTurn);
        bullet.vx = Math.cos(missile.angle) * speed;
        bullet.vy = Math.sin(missile.angle) * speed;
        bullet.trail?.push({ x: bullet.x, y: bullet.y });
        if (bullet.trail && bullet.trail.length > 10) bullet.trail.shift();
      }

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
          if (bullet.hitIds.includes(enemy.id)) continue;
          this.damageEnemy(enemy, bullet.damage, bullet.x, bullet.y);
          if (bullet.pierce > 0) {
            bullet.pierce -= 1;
            bullet.hitIds.push(enemy.id);
          } else {
            consumed = true;
            break;
          }
        }
      }

      // Reached the spot where its locked target died: pop instead of
      // continuing on to an unrelated enemy.
      if (
        !consumed &&
        missile &&
        missile.dead &&
        dist(bullet.x, bullet.y, missile.x, missile.y) <=
          speed * dt + bullet.radius + 4
      ) {
        this.spawnBurst(missile.x, missile.y, bullet.color, 6, 110, 0.3);
        consumed = true;
      }

      if (
        consumed ||
        bullet.life <= 0 ||
        // Seeker missiles are not stopped by room walls, only by their range.
        (!missile && this.outOfRoom(bullet.x, bullet.y, 24))
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
      // Missiles already in the air keep their locked target; they get the
      // death spot as their final waypoint and never pick a new enemy.
      for (const bullet of this.bullets) {
        const missile = bullet.missile;
        if (missile && !missile.dead && missile.targetId === enemy.id) {
          missile.dead = true;
          missile.x = enemy.x;
          missile.y = enemy.y;
        }
      }
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

      if (hit || bullet.life <= 0 || this.outOfRoom(bullet.x, bullet.y, 18)) {
        this.enemyBullets.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------ enemies

  private updateEnemies(dt: number) {
    const player = this.player;
    const bounds = this.roomBounds();

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

      enemy.desiredX = 0;
      enemy.desiredY = 0;
      enemy.desiredSpeed = 0;
      enemy.turnRate = 4;
      let aimAtPlayer = true;

      if (enemy.kind === 'boss') {
        enemy.angle = Math.atan2(dy, dx);
        if (distance > 300) {
          enemy.desiredX = nx;
          enemy.desiredY = ny;
        } else if (distance < 185) {
          enemy.desiredX = -nx;
          enemy.desiredY = -ny;
        } else {
          const strafe = Math.sin(this.elapsed * 0.9 + enemy.seed) > 0 ? 1 : -1;
          enemy.desiredX = -ny * strafe * 0.85 + nx * 0.1;
          enemy.desiredY = nx * strafe * 0.85 + ny * 0.1;
        }
        const phase2 = enemy.hp <= enemy.maxHp * 0.5;
        enemy.desiredSpeed = enemy.speed * (phase2 ? 1.32 : 1);
        if (!player.dead) this.updateBossAttack(enemy, dt);
      } else {
        aimAtPlayer = this.updateEnemyBrain(enemy, dt, distance);
      }

      const desiredLen = Math.hypot(enemy.desiredX, enemy.desiredY);
      if (desiredLen > 0.001) {
        enemy.desiredX /= desiredLen;
        enemy.desiredY /= desiredLen;
      } else {
        enemy.desiredX = 0;
        enemy.desiredY = 0;
      }
      const turn = 1 - Math.exp(-enemy.turnRate * dt);
      enemy.vx += (enemy.desiredX * enemy.desiredSpeed - enemy.vx) * turn;
      enemy.vy += (enemy.desiredY * enemy.desiredSpeed - enemy.vy) * turn;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.x = clamp(enemy.x, bounds.left + 18, bounds.right - 18);
      enemy.y = clamp(enemy.y, bounds.top + 18, bounds.bottom - 18);

      if (enemy.kind !== 'boss') {
        if (aimAtPlayer) {
          enemy.angle = turnTowards(enemy.angle, Math.atan2(dy, dx), 1 - Math.exp(-10 * dt));
        } else if (Math.hypot(enemy.vx, enemy.vy) > 26) {
          enemy.angle = turnTowards(
            enemy.angle,
            Math.atan2(enemy.vy, enemy.vx),
            1 - Math.exp(-6 * dt),
          );
        }
      }

      if (enemy.age > 0.18 && !player.dead && distance < enemy.radius + player.radius - 2) {
        if (player.invuln <= 0) {
          this.playerHit(enemy.damage);
          const push = 140;
          enemy.vx -= nx * push;
          enemy.vy -= ny * push;
          // Impact force is an external impulse, so it still shoves the player
          // even though normal movement has no inertia.
          player.knockX += nx * 240;
          player.knockY += ny * 240;
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

  /**
   * Advances the enemy's move / attack / idle rotation. Returns true while the
   * enemy is attacking, which makes it face the player instead of its heading.
   */
  private updateEnemyBrain(enemy: Enemy, dt: number, distance: number): boolean {
    const brain = enemy.brain;
    let guard = 0;
    while (guard++ < 8) {
      if (brain.index >= brain.queue.length) {
        brain.queue = this.rollEnemyActions();
        brain.index = 0;
        brain.started = false;
      }
      if (!brain.started) {
        brain.started = true;
        this.beginEnemyAction(enemy, brain.queue[brain.index]);
      }
      if (this.tickEnemyAction(enemy, dt, distance)) {
        return brain.queue[brain.index] === 'attack';
      }
      brain.index += 1;
      brain.started = false;
    }
    return false;
  }

  /** One move, one attack and two idle actions in a random order. */
  private rollEnemyActions(): EnemyAction[] {
    const queue = ENEMY_ACTIONS.slice();
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = queue[i];
      queue[i] = queue[j];
      queue[j] = swap;
    }
    return queue;
  }

  private beginEnemyAction(enemy: Enemy, action: EnemyAction) {
    if (action === 'move') {
      this.beginEnemyMove(enemy);
      return;
    }
    if (action === 'attack') {
      const atk = ENEMY_BEHAVIOR[enemy.kind].attack;
      enemy.brain.phase = 'windup';
      enemy.brain.timer = atk.windup * rand(0.9, 1.1);
      return;
    }
    // Idle: random duration whose expectation matches one straight-line hop.
    const brain = enemy.brain;
    const def = ENEMY_BEHAVIOR[enemy.kind];
    const mean =
      brain.lastLegTime > 0.05
        ? brain.lastLegTime
        : (brain.ringRadius > 0 ? brain.ringRadius : (ENEMY_RING_MIN + ENEMY_RING_MAX) / 2) /
          Math.max(1, def.moveSpeed);
    brain.idleTimer = clamp(
      mean * rand(1 - ENEMY_IDLE_JITTER, 1 + ENEMY_IDLE_JITTER),
      0.35,
      2.6,
    );
  }

  private beginEnemyMove(enemy: Enemy) {
    const brain = enemy.brain;
    brain.legsLeft =
      ENEMY_LEGS_MIN + Math.floor(Math.random() * (ENEMY_LEGS_MAX - ENEMY_LEGS_MIN + 1));
    this.beginEnemyLeg(enemy, dist(enemy.x, enemy.y, this.player.x, this.player.y));
  }

  private beginEnemyLeg(enemy: Enemy, distance: number) {
    const brain = enemy.brain;
    const def = ENEMY_BEHAVIOR[enemy.kind];
    const bounds = this.roomBounds();
    const player = this.player;

    // Each hop starts where the previous one ended; the ring is built around
    // that spot and a bigger enemy paces a wider ring.
    brain.anchorX = enemy.x;
    brain.anchorY = enemy.y;
    brain.ringRadius =
      rand(ENEMY_RING_MIN, ENEMY_RING_MAX) * clamp(enemy.radius / 16, 0.8, 1.5);

    // Random point on the ring around the anchor. The player-facing direction
    // is the one that corrects the distance to the preferred range; 80% of the
    // hops take it, 20% take the same vector reversed, away from the range.
    const toPlayer = Math.atan2(player.y - brain.anchorY, player.x - brain.anchorX);
    const tooFar = distance > def.range;
    const corrective = tooFar ? toPlayer : toPlayer + Math.PI;
    const reversed = Math.random() >= ENEMY_APPROACH_CHANCE;
    let angle = reversed ? corrective + Math.PI : corrective;
    // Do not overshoot the preferred range and barge into the player.
    const hopLen =
      tooFar !== reversed
        ? Math.min(brain.ringRadius, Math.max(26, distance - def.range))
        : brain.ringRadius;
    // Still a ring pick, not a pure radial line.
    angle += rand(-0.6, 0.6);

    // Never aim outside the room: swing the hop toward the room centre until
    // the ring point fits, instead of clamping it onto the wall.
    const pad = ENEMY_LANE_PAD + enemy.radius;
    const fits = (a: number) => {
      const x = brain.anchorX + Math.cos(a) * hopLen;
      const y = brain.anchorY + Math.sin(a) * hopLen;
      return (
        x >= bounds.left + pad &&
        x <= bounds.right - pad &&
        y >= bounds.top + pad &&
        y <= bounds.bottom - pad
      );
    };
    if (!fits(angle)) {
      const toCentre = Math.atan2(
        (bounds.top + bounds.bottom) / 2 - brain.anchorY,
        (bounds.left + bounds.right) / 2 - brain.anchorX,
      );
      const delta = ((((toCentre - angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
      for (let step = 1; step <= 8; step++) {
        const probe = angle + delta * (step / 8);
        if (fits(probe)) {
          angle = probe;
          break;
        }
      }
    }

    brain.targetX = clamp(
      brain.anchorX + Math.cos(angle) * hopLen,
      bounds.left + pad,
      bounds.right - pad,
    );
    brain.targetY = clamp(
      brain.anchorY + Math.sin(angle) * hopLen,
      bounds.top + pad,
      bounds.bottom - pad,
    );

    const hop = Math.max(12, dist(brain.targetX, brain.targetY, enemy.x, enemy.y));
    brain.legSpeed = def.moveSpeed * rand(0.9, 1.15);
    brain.legTime = hop / brain.legSpeed;
    brain.legTimer = brain.legTime * ENEMY_LEG_TIMEOUT + 0.3;
    brain.lastLegTime = brain.legTime;
  }

  private tickEnemyAction(enemy: Enemy, dt: number, distance: number): boolean {
    const brain = enemy.brain;
    const action = brain.queue[brain.index];

    if (action === 'move') {
      const dx = brain.targetX - enemy.x;
      const dy = brain.targetY - enemy.y;
      const d = Math.hypot(dx, dy);
      if (d > 2) {
        enemy.desiredX = dx / d;
        enemy.desiredY = dy / d;
        // Ease into the ring point instead of overshooting it.
        enemy.desiredSpeed = brain.legSpeed * clamp(d / 34, 0.35, 1);
      }
      brain.legTimer -= dt;
      if (d <= 8 || brain.legTimer <= 0) {
        brain.legsLeft -= 1;
        if (brain.legsLeft <= 0) return false;
        this.beginEnemyLeg(enemy, distance);
      }
      return true;
    }

    if (action === 'attack') {
      const atk = ENEMY_BEHAVIOR[enemy.kind].attack;
      enemy.turnRate = 10;
      if (brain.phase === 'windup') {
        brain.timer -= dt;
        if (brain.timer <= 0) {
          brain.phase = 'active';
          brain.timer = atk.active;
          if (atk.mode !== 'sweep') {
            brain.shotsLeft = atk.shots;
            brain.fireTimer = 0;
          } else {
            // Start the blade behind the enemy and sweep one full turn.
            brain.sweepFrom = enemy.angle - Math.PI;
            brain.sweepAngle = brain.sweepFrom;
            brain.sweepHit = false;
            this.sfx.play('sweep');
          }
        }
        return true;
      }
      if (brain.phase === 'active') {
        brain.timer -= dt;
        if (atk.mode !== 'sweep') {
          brain.fireTimer -= dt;
          if (brain.shotsLeft > 0 && brain.fireTimer <= 0) {
            this.fireEnemyShot(enemy, atk);
            brain.shotsLeft -= 1;
            brain.fireTimer = atk.interval;
          }
        } else {
          const progress = 1 - clamp(brain.timer / Math.max(0.001, atk.active), 0, 1);
          brain.sweepAngle = brain.sweepFrom + TAU * progress;
          this.enemySweepHit(enemy, atk);
        }
        if (brain.timer <= 0) {
          brain.phase = 'recover';
          brain.timer = atk.recovery;
        }
        return true;
      }
      brain.timer -= dt;
      return brain.timer > 0;
    }

    brain.idleTimer -= dt;
    enemy.turnRate = 6;
    return brain.idleTimer > 0;
  }

  private enemySweepHit(enemy: Enemy, atk: EnemyAttackDef) {
    const brain = enemy.brain;
    if (brain.sweepHit) return;
    const player = this.player;
    if (player.dead || player.invuln > 0) return;
    const tipX = enemy.x + Math.cos(brain.sweepAngle) * atk.reach;
    const tipY = enemy.y + Math.sin(brain.sweepAngle) * atk.reach;
    if (
      !segmentCircleHit(
        enemy.x,
        enemy.y,
        tipX,
        tipY,
        player.x,
        player.y,
        player.radius + 9,
      )
    ) {
      return;
    }
    brain.sweepHit = true;
    this.playerHit(atk.damage);
    this.shake = Math.max(this.shake, 6);
    this.spawnBurst(tipX, tipY, enemy.color, 8, 150, 0.3);
  }

  private fireEnemyShot(enemy: Enemy, atk: EnemyAttackDef) {
    if (atk.mode === 'shell') {
      this.fireShell(enemy, atk);
      return;
    }
    if (atk.mode === 'homing') {
      this.fireHoming(enemy, atk);
      return;
    }
    const angle =
      Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x) + rand(-0.05, 0.05);
    const x = enemy.x + Math.cos(angle) * (enemy.radius + 5);
    const y = enemy.y + Math.sin(angle) * (enemy.radius + 5);
    this.enemyBullets.push({
      x,
      y,
      prevX: x,
      prevY: y,
      vx: Math.cos(angle) * 300,
      vy: Math.sin(angle) * 300,
      radius: 6.5,
      damage: atk.damage,
      life: 4,
      color: enemy.color,
    });
    this.spawnBurst(x, y, enemy.color, 4, 90, 0.25);
    this.sfx.play('spit');
  }

  /** Lobs one shell at where the player stands right now. */
  private fireShell(enemy: Enemy, atk: EnemyAttackDef) {
    const player = this.player;
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const x = enemy.x + Math.cos(angle) * (enemy.radius + SHELL_RADIUS + 6);
    const y = enemy.y + Math.sin(angle) * (enemy.radius + SHELL_RADIUS + 6);
    const travel = Math.max(1, dist(x, y, player.x, player.y));
    this.shells.push({
      x,
      y,
      prevX: x,
      prevY: y,
      vx: Math.cos(angle) * SHELL_SPEED,
      vy: Math.sin(angle) * SHELL_SPEED,
      radius: SHELL_RADIUS,
      damage: atk.damage,
      // Fixed aim point: if the player moves, the shell still lands here.
      targetX: player.x,
      targetY: player.y,
      traveled: 0,
      total: travel,
      life: SHELL_FLIGHT_TIME,
      color: enemy.color,
      spin: rand(0, TAU),
    });
    this.spawnBurst(x, y, enemy.color, 6, 110, 0.3);
    this.sfx.play('shell');
  }

  private updateShells(dt: number) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const shell = this.shells[i];
      // Stop exactly on the aim point instead of overshooting it by a frame.
      const step = Math.min(SHELL_SPEED * dt, Math.max(0, shell.total - shell.traveled));
      shell.prevX = shell.x;
      shell.prevY = shell.y;
      const len = Math.hypot(shell.vx, shell.vy) || 1;
      shell.x += (shell.vx / len) * step;
      shell.y += (shell.vy / len) * step;
      shell.traveled += step;
      shell.life -= dt;
      shell.spin += dt * 3.4;

      let burst = false;

      // The only early trigger is touching the player; the shell ignores
      // bullets and only bursts where it was aimed. A dodging player is not
      // there at all, so the shell sails through instead of bursting on them.
      const player = this.player;
      if (
        !player.dead &&
        player.invuln <= 0 &&
        segmentCircleHit(
          shell.prevX,
          shell.prevY,
          shell.x,
          shell.y,
          player.x,
          player.y,
          player.radius + shell.radius - 3,
        )
      ) {
        this.playerHit(shell.damage);
        burst = true;
      }

      if (
        burst ||
        shell.traveled >= shell.total - 0.01 ||
        shell.life <= 0 ||
        this.outOfRoom(shell.x, shell.y, 40)
      ) {
        this.splitShell(shell);
        this.shells.splice(i, 1);
      }
    }
  }

  /** Bursts a shell into a full ring of fast, unlimited-range bullets. */
  private splitShell(shell: EnemyShell) {
    const base = rand(0, TAU);
    for (let i = 0; i < SPLIT_RING_COUNT; i++) {
      const angle = base + (TAU * i) / SPLIT_RING_COUNT;
      this.enemyBullets.push({
        x: shell.x,
        y: shell.y,
        prevX: shell.x,
        prevY: shell.y,
        vx: Math.cos(angle) * SPLIT_BULLET_SPEED,
        vy: Math.sin(angle) * SPLIT_BULLET_SPEED,
        radius: 5,
        damage: SPLIT_BULLET_DAMAGE,
        life: SPLIT_BULLET_LIFE,
        color: shell.color,
      });
    }
    this.spawnBurst(shell.x, shell.y, shell.color, 20, 260, 0.5);
    this.spawnBurst(shell.x, shell.y, '#ffffff', 8, 190, 0.32);
    this.shake = Math.max(this.shake, 3);
    this.sfx.play('split');
  }

  /**
   * Launches a missile that starts out aimed at the player and then chases at
   * a capped turn rate. The lock only lasts HOMING_SEEK_TIME, after which the
   * missile keeps whatever heading it had and flies straight.
   */
  private fireHoming(enemy: Enemy, atk: EnemyAttackDef) {
    const player = this.player;
    const angle =
      Math.atan2(player.y - enemy.y, player.x - enemy.x) + rand(-0.1, 0.1);
    const x = enemy.x + Math.cos(angle) * (enemy.radius + 9);
    const y = enemy.y + Math.sin(angle) * (enemy.radius + 9);
    this.homings.push({
      x,
      y,
      prevX: x,
      prevY: y,
      vx: Math.cos(angle) * HOMING_SPEED,
      vy: Math.sin(angle) * HOMING_SPEED,
      angle,
      radius: HOMING_RADIUS,
      damage: atk.damage,
      seek: HOMING_SEEK_TIME,
      life: HOMING_LIFE,
      color: enemy.color,
      spin: rand(0, TAU),
      trail: [{ x, y }],
    });
    this.spawnBurst(x, y, enemy.color, 5, 100, 0.28);
    this.sfx.play('lock');
  }

  private updateHomings(dt: number) {
    const bounds = this.roomBounds();
    const player = this.player;

    for (let i = this.homings.length - 1; i >= 0; i--) {
      const missile = this.homings[i];
      missile.prevX = missile.x;
      missile.prevY = missile.y;
      missile.life -= dt;
      missile.spin += dt * 5;
      // Keep the smoke trail short: a curved ribbon, not a full path record.
      missile.trail.push({ x: missile.x, y: missile.y });
      if (missile.trail.length > HOMING_TRAIL_POINTS) missile.trail.shift();

      if (missile.seek > 0) {
        missile.seek = Math.max(0, missile.seek - dt);
        if (!player.dead) {
          const want = Math.atan2(player.y - missile.y, player.x - missile.x);
          const maxTurn = HOMING_TURN_RATE * dt;
          missile.angle += clamp(angleDelta(missile.angle, want), -maxTurn, maxTurn);
        }
        if (missile.seek <= 0) {
          // Lock lost: a white ping marks the moment it stops chasing.
          this.spawnBurst(missile.x, missile.y, '#ffffff', 6, 90, 0.26);
        }
      }

      missile.vx = Math.cos(missile.angle) * HOMING_SPEED;
      missile.vy = Math.sin(missile.angle) * HOMING_SPEED;
      missile.x += missile.vx * dt;
      missile.y += missile.vy * dt;

      // Walls are the room's inner face; the missile's own radius decides how
      // close it has to get before it counts as a touch.
      const hitWall =
        missile.x <= bounds.left + missile.radius ||
        missile.x >= bounds.right - missile.radius ||
        missile.y <= bounds.top + missile.radius ||
        missile.y >= bounds.bottom - missile.radius;

      // A dodging player is not there: the missile crosses the i-frame gap
      // without detonating, so a well-timed slide really does ignore the shot.
      const hitPlayer =
        !player.dead &&
        player.invuln <= 0 &&
        segmentCircleHit(
          missile.prevX,
          missile.prevY,
          missile.x,
          missile.y,
          player.x,
          player.y,
          player.radius + missile.radius - 2,
        );

      if (hitWall || hitPlayer) {
        if (hitPlayer) this.playerHit(missile.damage);
        this.explodeHoming(missile, hitPlayer);
        this.homings.splice(i, 1);
        continue;
      }

      if (missile.life <= 0) {
        // Out of fuel: no blast, just a fizzle where it gave up.
        this.spawnBurst(missile.x, missile.y, missile.color, 5, 80, 0.3);
        this.homings.splice(i, 1);
      }
    }
  }

  /**
   * Small blast that ends a homing missile. A body hit already paid its
   * damage, so only a wall burst can clip the player standing next to it.
   */
  private explodeHoming(missile: EnemyHoming, alreadyHitPlayer: boolean) {
    this.blasts.push({
      x: missile.x,
      y: missile.y,
      radius: HOMING_BLAST_RADIUS,
      life: 0.3,
      maxLife: 0.3,
      color: missile.color,
    });
    this.spawnBurst(missile.x, missile.y, missile.color, 12, 200, 0.36);
    this.spawnBurst(missile.x, missile.y, '#ffffff', 5, 130, 0.22);
    this.shake = Math.max(this.shake, 2.6);
    this.sfx.play('blast');

    const player = this.player;
    if (alreadyHitPlayer || player.dead) return;
    if (
      dist(missile.x, missile.y, player.x, player.y) <=
      HOMING_BLAST_RADIUS + player.radius - 10
    ) {
      if (player.invuln <= 0) this.playerHit(HOMING_BLAST_DAMAGE);
    }
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
            clamp(enemy.x + Math.cos(angle) * radius, 80, this.worldW - 80),
            clamp(enemy.y + Math.sin(angle) * radius, 80, this.worldH - 80),
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

  private beginTestRoom() {
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.bossWindup = 0;
    this.boss = null;
    this.testWave = 0;
    this.testWaveTimer = 0;
    this.spawnTestWave();
    this.banner = {
      title: 'TEST ROOM',
      sub: '分裂者 · 追踪者测试场 · 清空自动续波',
      time: 2,
      duration: 2,
      color: TEST_COLOR,
    };
    this.sfx.play('wave');
    this.emitHud(true);
  }

  private spawnTestWave() {
    this.testWave += 1;
    // Wave 1 opens with two, then one more per wave up to a ceiling.
    const count = Math.min(6, this.testWave + 1);
    const cx = this.worldW / 2;
    const cy = this.worldH / 2;
    for (let i = 0; i < count; i++) {
      const angle = (TAU * i) / count + this.testWave * 0.45 + rand(-0.12, 0.12);
      const radius = 280 + rand(0, 90);
      // Both test enemies share the room so a wave always shows the mix.
      const kind: EnemyKind = i % 2 === 0 ? 'splitter' : 'homing';
      this.spawnEnemy(
        kind,
        clamp(cx + Math.cos(angle) * radius, 80, this.worldW - 80),
        clamp(cy + Math.sin(angle) * radius, 80, this.worldH - 80),
      );
    }
    this.testWaveTimer = 1.6;
    this.emitHud(true);
  }

  private updateTestRoom(dt: number) {
    if (this.phase !== 'playing') return;
    if (this.enemies.some((enemy) => !enemy.dead)) {
      this.testWaveTimer = 1.6;
      return;
    }
    this.testWaveTimer -= dt;
    if (this.testWaveTimer <= 0) this.spawnTestWave();
  }

  private bossDefeated(boss: Enemy) {
    this.victoryTimer = BOSS_VICTORY_DELAY;
    this.bossWindup = 0;
    this.player.invuln = Math.max(this.player.invuln, BOSS_VICTORY_DELAY + 1);
    this.enemyBullets = [];
    this.shells = [];
    this.homings = [];
    this.blasts = [];

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
        kills: this.kills,
        time: this.elapsed,
        floor: 1,
        roomsCleared: 0,
        wave: this.testWave,
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

  // ------------------------------------------------------------- dungeon logic

  private beginRun() {
    this.floor = 1;
    this.roomIndex = 0;
    this.roomCleared = [false, false, false, false, false];
    this.encounterActive = false;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.banner = {
      title: 'FLOOR 01',
      sub: '起始房 · 沿右侧闸门深入',
      time: 2.4,
      duration: 2.4,
      color: PLAYER_COLOR,
    };
    this.sfx.play('wave');
    this.emitHud(true);
  }

  private updateDungeon(dt: number) {
    if (this.encounterActive) {
      this.updateEncounter(dt);
    } else if (
      this.roomIndex >= 1 &&
      this.roomIndex <= DUNGEON_ROOMS - 2 &&
      !this.roomCleared[this.roomIndex]
    ) {
      this.startEncounter(this.roomIndex);
    }
    this.updatePortal();
  }

  private startEncounter(room: number) {
    this.encounterActive = true;
    this.spawnQueue = this.buildEncounter(this.floor, room);
    this.spawnTimer = 0.55;
    this.telegraphs = [];
    this.banner = {
      title: `ROOM 0${room}`,
      sub: room === 1 ? '敌对信号锁定 · 闸门闭合' : `第 ${this.floor} 层 · 战斗房 ${room}/3`,
      time: 1.9,
      duration: 1.9,
      color: '#ff5f7d',
    };
    this.sfx.play('wave');
    this.emitHud(true);
  }

  private buildEncounter(floor: number, room: number): EnemyKind[] {
    const count = Math.min(
      32,
      6 + (floor - 1) * 3 + room * 2 + Math.floor(Math.random() * 3),
    );
    const list: EnemyKind[] = [];
    const spitters = floor >= 2 || room >= 3;
    const tanks = floor >= 3 || (floor >= 2 && room >= 3);
    const splitters = floor >= 2 || room >= 3;
    const homings = floor >= 2 && room >= 2;
    for (let i = 0; i < count; i++) {
      let kind: EnemyKind = 'grunt';
      if (tanks && i % 7 === 3) kind = 'tank';
      else if (homings && i % 8 === 6) kind = 'homing';
      else if (splitters && i % 6 === 4) kind = 'splitter';
      else if (spitters && i % 5 === 2) kind = 'spitter';
      else if (room >= 2 || floor >= 2 ? i % 3 === 1 : i % 5 === 3) kind = 'runner';
      list.push(kind);
    }
    if (spitters && !list.includes('spitter')) list[Math.min(2, list.length - 1)] = 'spitter';
    if (splitters && !list.includes('splitter')) {
      list[Math.min(3, list.length - 1)] = 'splitter';
    }
    if (homings && !list.includes('homing')) {
      list[Math.min(5, list.length - 1)] = 'homing';
    }
    if (tanks && !list.includes('tank')) list[Math.min(4, list.length - 1)] = 'tank';

    // Shuffle so every room opens a little differently.
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  private updateEncounter(dt: number) {
    this.spawnTimer -= dt;
    if (this.spawnQueue.length > 0 && this.spawnTimer <= 0) {
      const groupSize = Math.min(
        this.spawnQueue.length,
        1 + Math.floor((this.floor - 1) / 2) + (this.roomIndex >= 3 ? 1 : 0),
      );
      for (let i = 0; i < groupSize; i++) {
        const kind = this.spawnQueue.shift();
        if (!kind) break;
        const point = this.pickSpawnPoint();
        this.telegraphs.push({
          x: point.x,
          y: point.y,
          kind,
          timer: 0.65,
          duration: 0.65,
        });
      }
      this.spawnTimer = Math.max(0.4, 0.86 - this.floor * 0.05);
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
      this.spawnQueue.length === 0 &&
      this.telegraphs.length === 0 &&
      this.enemies.length === 0
    ) {
      this.clearRoom();
    }
  }

  private clearRoom() {
    this.encounterActive = false;
    this.roomCleared[this.roomIndex] = true;
    const cleared = this.countCleared();
    const bonus = 80 + this.floor * 25 + this.roomIndex * 15;
    this.score += bonus;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + CLEAR_HEAL);
    this.healFlash = Math.max(this.healFlash, 0.45);
    const allCleared = cleared >= DUNGEON_ROOMS - 2;
    this.banner = {
      title: allCleared ? 'FLOOR CLEAR' : 'ROOM CLEAR',
      sub: allCleared
        ? `传送门已激活 · 房间奖励 +${bonus}`
        : `战斗房 ${cleared}/3 · 闸门开启 · +${bonus}`,
      time: 2.7,
      duration: 2.7,
      color: '#7dff9b',
    };
    if (this.player.hp < this.player.maxHp * 0.7 && this.pickups.length < 2) {
      const bounds = this.roomBounds();
      this.dropPickup(
        clamp(this.player.x + rand(-110, 110), bounds.left + 40, bounds.right - 40),
        clamp(this.player.y + rand(-110, 110), bounds.top + 40, bounds.bottom - 40),
      );
    }
    this.sfx.play('clear');
    this.emitHud(true);
  }

  private updatePortal() {
    if (this.countCleared() < DUNGEON_ROOMS - 2) return;
    if (this.roomIndex !== DUNGEON_ROOMS - 1) return;
    const reach = PORTAL_RADIUS + this.player.radius;
    if (dist(this.player.x, this.player.y, PORTAL_X, PORTAL_Y) <= reach) {
      this.nextFloor();
    }
  }

  private nextFloor() {
    this.floor += 1;
    this.roomCleared = [false, false, false, false, false];
    this.roomIndex = 0;
    this.encounterActive = false;
    this.spawnQueue = [];
    this.telegraphs = [];
    this.enemies = [];
    this.enemyBullets = [];
    this.shells = [];
    this.homings = [];
    this.blasts = [];
    this.bullets = [];
    this.pickups = [];
    this.player.x = ROOM_SIZE / 2;
    this.player.y = this.worldH / 2;
    this.player.invuln = 1.2;
    // Nothing from the previous floor should linger at the old coordinates.
    this.ghosts = [];
    this.dashTrail.life = 0;
    this.dashRing.life = 0;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + FLOOR_HEAL);
    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.clampCamera();
    this.score += 150 * this.floor;
    this.healFlash = 1;
    this.spawnBurst(this.player.x, this.player.y, '#c08bff', 42, 300, 0.9);
    this.banner = {
      title: `FLOOR ${String(this.floor).padStart(2, '0')}`,
      sub: `传送完成 · 装甲修复 +${FLOOR_HEAL}`,
      time: 2.4,
      duration: 2.4,
      color: '#c08bff',
    };
    this.buildDecorations();
    this.sfx.play('clear');
    this.emitHud(true);
  }

  private pickSpawnPoint() {
    const bounds = this.roomBounds();
    let best = {
      x: this.player.x + 300,
      y: this.player.y,
    };
    let bestScore = -1;
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = rand(bounds.left + 70, bounds.right - 70);
      const y = rand(bounds.top + 70, bounds.bottom - 70);
      const d = dist(x, y, this.player.x, this.player.y);
      const score = d < 300 ? d : 1000 + Math.min(d, 700);
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
      if (d > 360) return best;
    }
    return best;
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number) {
    const def = ENEMY_DEFS[kind];
    const depth =
      this.mode === 'dungeon' ? (this.floor - 1) * 3 + this.roomIndex : 1;
    const bonusHp =
      kind === 'tank'
        ? depth - 1
        : kind === 'spitter'
          ? Math.floor((depth - 1) / 2)
          : Math.floor((depth - 1) / 3);
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
      speed: def.speed * (1 + Math.min(0.3, depth * 0.02)),
      damage: def.damage,
      score: def.score,
      color: def.color,
      angle: 0,
      attackTimer: rand(0.8, 2.2),
      hitFlash: 0,
      age: 0,
      seed: rand(0, TAU),
      brain: createEnemyBrain(),
      desiredX: 0,
      desiredY: 0,
      desiredSpeed: 0,
      turnRate: 4,
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
    const bounds = this.roomBounds();
    this.pickups.push({
      x: clamp(x, bounds.left + 24, bounds.right - 24),
      y: clamp(y, bounds.top + 24, bounds.bottom - 24),
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
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      this.blasts[i].life -= dt;
      if (this.blasts[i].life <= 0) this.blasts.splice(i, 1);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].life -= dt;
      if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
    }
    this.dashRing.life = Math.max(0, this.dashRing.life - dt);
    this.dashFlash = Math.max(0, this.dashFlash - dt);
    this.dashTrail.life = Math.max(0, this.dashTrail.life - dt);
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

  private emitHud(force = false) {
    if (!force && this.hudTimer > 0) return;
    const boss = this.boss;
    const bossHp = boss ? Math.max(0, Math.ceil(boss.hp)) : 0;
    const hud: HudSnapshot = {
      mode: this.mode,
      weapon: this.player.weapon,
      hp: Math.ceil(this.player.hp),
      maxHp: this.player.maxHp,
      score: this.score,
      floor: this.floor,
      room: this.roomIndex,
      roomKind: roomKindAt(this.roomIndex),
      roomsCleared: this.countCleared(),
      enemiesRemaining:
        this.enemies.length + this.telegraphs.length + this.spawnQueue.length,
      encounterActive: this.encounterActive,
      portalActive: this.countCleared() >= DUNGEON_ROOMS - 2,
      combo: this.combo,
      comboTime: this.comboTimer,
      kills: this.kills,
      muted: this.sfx.muted,
      secondaryCooldown: clamp(this.secondaryCooldown / SECONDARY_COOLDOWN, 0, 1),
      dodgeCooldown: clamp(this.dodgeCooldown / DODGE_CYCLE, 0, 1),
      bossHp,
      bossMaxHp: boss?.maxHp ?? 0,
      bossPhase: boss && boss.hp <= boss.maxHp * 0.5 ? 2 : 1,
      wave: this.testWave,
      testSplitter: this.enemies.filter(
        (enemy) => !enemy.dead && enemy.kind === 'splitter',
      ).length,
      testHoming: this.enemies.filter(
        (enemy) => !enemy.dead && enemy.kind === 'homing',
      ).length,
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
    const debris = this.mode === 'boss' ? 90 : 160;
    for (let i = 0; i < debris; i++) {
      this.decorations.push({
        x: rand(70, this.worldW - 70),
        y: rand(70, this.worldH - 70),
        size: rand(1, 3.4),
        alpha: rand(0.06, 0.28),
        phase: rand(0, TAU),
      });
    }

    this.floorMarks = [];
    const kinds: FloorMark['kind'][] = ['ring', 'cross', 'diamond'];
    const rooms = this.mode === 'boss' ? 1 : DUNGEON_ROOMS;
    for (let room = 0; room < rooms; room++) {
      for (let i = 0; i < 9; i++) {
        this.floorMarks.push({
          x: room * ROOM_SIZE + rand(120, ROOM_SIZE - 120),
          y: rand(120, this.worldH - 120),
          radius: rand(28, 120),
          rotation: rand(0, TAU),
          alpha: rand(0.025, 0.075),
          kind: kinds[i % kinds.length],
        });
      }
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
    this.drawWeaponRange();
    this.drawPortal();
    this.drawTelegraphs();
    this.drawPickups();
    this.drawEnemyBullets();
    this.drawBullets();
    this.drawEnemies();
    this.drawShells();
    this.drawHomings();
    this.drawBlasts();
    this.drawDashGhosts();
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
  }

  private roomAccent(room: number) {
    if (this.mode === 'boss') return TEST_COLOR;
    if (room === 0) return '#5ff6ff';
    if (room === DUNGEON_ROOMS - 1) return '#c08bff';
    return this.roomCleared[room] ? '#7dff9b' : '#ff5f7d';
  }

  private roomBaseColor(room: number) {
    if (this.mode === 'boss') return '#140e07';
    if (room === 0) return '#071119';
    if (room === DUNGEON_ROOMS - 1) return '#0c0817';
    return this.roomCleared[room] ? '#08140f' : '#0c0c17';
  }

  private drawRoomLabel(room: number, accent: string) {
    if (this.mode === 'boss') return;
    const ctx = this.ctx;
    const title =
      room === 0 ? 'START' : room === DUNGEON_ROOMS - 1 ? 'PORTAL' : `COMBAT 0${room}`;
    const cn = room === 0 ? '起始房' : room === DUNGEON_ROOMS - 1 ? '传送门' : '战斗房';
    const x = room * ROOM_SIZE + ROOM_SIZE / 2;
    const y = WALL_PAD + 34;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = withAlpha(accent, 0.75);
    ctx.fillText(`${title} · ${cn}`, x, y);
    ctx.strokeStyle = withAlpha(accent, 0.28);
    ctx.lineWidth = 1.2 / this.zoom;
    const line = 92;
    ctx.beginPath();
    ctx.moveTo(x - line, y + 16);
    ctx.lineTo(x - 14, y + 16);
    ctx.moveTo(x + 14, y + 16);
    ctx.lineTo(x + line, y + 16);
    ctx.stroke();
    ctx.restore();
  }

  private drawFloor() {
    const ctx = this.ctx;
    const halfW = this.width / (2 * this.zoom);
    const halfH = this.height / (2 * this.zoom);
    const viewLeft = this.camera.x - halfW;
    const viewRight = this.camera.x + halfW;
    const viewTop = this.camera.y - halfH;
    const viewBottom = this.camera.y + halfH;

    ctx.fillStyle = '#03060b';
    ctx.fillRect(0, 0, this.worldW, this.worldH);

    const rooms = this.mode === 'boss' ? 1 : DUNGEON_ROOMS;
    for (let room = 0; room < rooms; room++) {
      const roomLeft = room * ROOM_SIZE;
      const roomRight = roomLeft + ROOM_SIZE;
      if (roomRight < viewLeft - 80 || roomLeft > viewRight + 80) continue;

      const accent = this.roomAccent(room);
      const base = this.roomBaseColor(room);
      const inset = WALL_PAD;

      ctx.fillStyle = base;
      ctx.fillRect(roomLeft + inset, inset, ROOM_SIZE - WALL_THICK, this.worldH - WALL_THICK);

      ctx.save();
      ctx.beginPath();
      ctx.rect(roomLeft + inset, inset, ROOM_SIZE - WALL_THICK, this.worldH - WALL_THICK);
      ctx.clip();

      // Grid
      const step = 80;
      ctx.lineWidth = 1 / this.zoom;
      for (let x = roomLeft + step; x < roomRight; x += step) {
        if (x < viewLeft - step || x > viewRight + step) continue;
        const major = (x - roomLeft) % 400 === 0;
        ctx.strokeStyle = withAlpha(accent, major ? 0.1 : 0.04);
        ctx.beginPath();
        ctx.moveTo(x, inset);
        ctx.lineTo(x, this.worldH - inset);
        ctx.stroke();
      }
      for (let y = step; y < this.worldH - step; y += step) {
        if (y < viewTop - step || y > viewBottom + step) continue;
        const major = y % 400 === 0;
        ctx.strokeStyle = withAlpha(accent, major ? 0.1 : 0.04);
        ctx.beginPath();
        ctx.moveTo(roomLeft + inset, y);
        ctx.lineTo(roomRight - inset, y);
        ctx.stroke();
      }

      // Faint room number etched into the floor.
      if (this.mode !== 'boss') {
        ctx.globalAlpha = 0.045;
        ctx.fillStyle = accent;
        ctx.font = '900 300px "Arial Narrow", "DIN Condensed", ui-sans-serif, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          String(room).padStart(2, '0'),
          roomLeft + ROOM_SIZE / 2,
          this.worldH / 2 + 8,
        );
        ctx.globalAlpha = 1;
      }

      // Faint survey markings
      for (const mark of this.floorMarks) {
        if (
          mark.x + mark.radius < viewLeft ||
          mark.x - mark.radius > viewRight ||
          mark.y + mark.radius < viewTop ||
          mark.y - mark.radius > viewBottom
        ) {
          continue;
        }
        ctx.save();
        ctx.translate(mark.x, mark.y);
        ctx.rotate(mark.rotation);
        ctx.strokeStyle = withAlpha(accent, mark.alpha);
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
        if (
          decoration.x < roomLeft + inset ||
          decoration.x > roomRight - inset ||
          decoration.y < inset ||
          decoration.y > this.worldH - inset
        ) {
          continue;
        }
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

      ctx.restore();
      this.drawRoomLabel(room, accent);
    }

    this.drawWalls();
  }

  private drawWallSegment(x: number, y: number, w: number, h: number) {
    if (h <= 0) return;
    const ctx = this.ctx;
    ctx.fillStyle = '#0b141d';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(140, 210, 230, 0.16)';
    ctx.lineWidth = 1 / this.zoom;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = 'rgba(95, 246, 255, 0.07)';
    ctx.beginPath();
    for (let lineY = y + 60; lineY < y + h - 10; lineY += 80) {
      ctx.moveTo(x + 6, lineY);
      ctx.lineTo(x + w - 6, lineY);
    }
    ctx.stroke();
  }

  private drawWalls() {
    const ctx = this.ctx;
    ctx.fillStyle = '#0b141d';
    ctx.fillRect(0, 0, this.worldW, WALL_PAD);
    ctx.fillRect(0, this.worldH - WALL_PAD, this.worldW, WALL_PAD);
    ctx.fillRect(0, 0, WALL_PAD, this.worldH);
    ctx.fillRect(this.worldW - WALL_PAD, 0, WALL_PAD, this.worldH);

    ctx.strokeStyle = 'rgba(120, 200, 220, 0.3)';
    ctx.lineWidth = 2 / this.zoom;
    ctx.strokeRect(WALL_PAD, WALL_PAD, this.worldW - WALL_THICK, this.worldH - WALL_THICK);

    if (this.mode === 'dungeon') {
      const doorTop = DOOR_Y - DOOR_HALF;
      const doorBottom = DOOR_Y + DOOR_HALF;
      for (let boundary = 1; boundary < DUNGEON_ROOMS; boundary++) {
        const x = boundary * ROOM_SIZE - WALL_PAD;
        this.drawWallSegment(x, WALL_PAD, WALL_THICK, doorTop - WALL_PAD);
        this.drawWallSegment(
          x,
          doorBottom,
          WALL_THICK,
          this.worldH - WALL_PAD - doorBottom,
        );
        this.drawDoor(boundary);
      }
    }

    // Corner brackets
    const bracket = 58;
    const corners: Array<[number, number, number, number]> = [
      [WALL_PAD, WALL_PAD, 1, 1],
      [this.worldW - WALL_PAD, WALL_PAD, -1, 1],
      [WALL_PAD, this.worldH - WALL_PAD, 1, -1],
      [this.worldW - WALL_PAD, this.worldH - WALL_PAD, -1, -1],
    ];
    ctx.strokeStyle = 'rgba(95, 246, 255, 0.6)';
    ctx.lineWidth = 4 / this.zoom;
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + bracket * sx, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + bracket * sy);
      ctx.stroke();
    }
  }

  private drawDoor(boundary: number) {
    const ctx = this.ctx;
    const x = boundary * ROOM_SIZE;
    const top = DOOR_Y - DOOR_HALF;
    const bottom = DOOR_Y + DOOR_HALF;
    const open = this.isDoorOpen(boundary);
    const pulse = 0.5 + Math.sin(this.ambientTime * 6.5) * 0.2;

    // Door posts
    ctx.fillStyle = '#16232f';
    ctx.fillRect(x - WALL_PAD - 7, top - 16, WALL_THICK + 14, 16);
    ctx.fillRect(x - WALL_PAD - 7, bottom, WALL_THICK + 14, 16);

    if (!open) {
      const field = ctx.createLinearGradient(x - WALL_PAD, 0, x + WALL_PAD, 0);
      field.addColorStop(0, 'rgba(255, 77, 125, 0.04)');
      field.addColorStop(0.5, `rgba(255, 77, 125, ${0.18 + pulse * 0.16})`);
      field.addColorStop(1, 'rgba(255, 77, 125, 0.04)');
      ctx.fillStyle = field;
      ctx.fillRect(x - WALL_PAD + 5, top, WALL_THICK - 10, DOOR_HALF * 2);

      ctx.strokeStyle = `rgba(255, 128, 152, ${0.3 * pulse})`;
      ctx.lineWidth = 1.4 / this.zoom;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const y = top + ((this.ambientTime * 46 + i * 44) % (DOOR_HALF * 2));
        ctx.moveTo(x - WALL_PAD + 6, y);
        ctx.lineTo(x + WALL_PAD - 6, y);
      }
      ctx.stroke();

      // Lock glyph in the middle of the field.
      ctx.strokeStyle = `rgba(255, 190, 205, ${0.5 + pulse * 0.2})`;
      ctx.lineWidth = 2 / this.zoom;
      ctx.beginPath();
      ctx.arc(x, DOOR_Y, 13, Math.PI, TAU);
      ctx.stroke();
      ctx.strokeRect(x - 14, DOOR_Y, 28, 20);
    } else {
      ctx.strokeStyle = 'rgba(95, 246, 255, 0.32)';
      ctx.lineWidth = 1.6 / this.zoom;
      ctx.beginPath();
      ctx.moveTo(x - WALL_PAD + 4, top + 4);
      ctx.lineTo(x - WALL_PAD + 4, bottom - 4);
      ctx.moveTo(x + WALL_PAD - 4, top + 4);
      ctx.lineTo(x + WALL_PAD - 4, bottom - 4);
      ctx.stroke();

      ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.5);
      ctx.lineWidth = 2.4 / this.zoom;
      ctx.beginPath();
      ctx.moveTo(x - 10, DOOR_Y - 16);
      ctx.lineTo(x + 8, DOOR_Y);
      ctx.lineTo(x - 10, DOOR_Y + 16);
      ctx.stroke();
    }

    ctx.save();
    ctx.shadowColor = open ? PLAYER_COLOR : '#ff4d7d';
    ctx.shadowBlur = 14;
    ctx.fillStyle = open ? PLAYER_COLOR : '#ff4d7d';
    ctx.beginPath();
    ctx.arc(x, top - 28, 3.6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Faint ring for the equipped weapon's maximum range. Only the seeker has a
   * range limit, so every other weapon draws nothing.
   */
  private drawWeaponRange() {
    const spec = WEAPONS[this.player.weapon];
    if (!spec.range || this.player.dead) return;
    const ctx = this.ctx;
    const player = this.player;
    const breathe = 0.5 + Math.sin(this.ambientTime * 2.2) * 0.5;
    ctx.save();
    ctx.fillStyle = withAlpha(spec.color, 0.025);
    ctx.strokeStyle = withAlpha(spec.color, 0.2 + breathe * 0.08);
    ctx.lineWidth = 2 / this.zoom;
    ctx.setLineDash([12, 14]);
    ctx.lineDashOffset = -this.ambientTime * 16;
    ctx.beginPath();
    ctx.arc(player.x, player.y, spec.range, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawPortal() {
    if (this.mode !== 'dungeon') return;
    const ctx = this.ctx;
    const active = this.countCleared() >= DUNGEON_ROOMS - 2;
    const t = this.ambientTime;
    const color = active ? '#c08bff' : '#6b6485';

    ctx.save();
    ctx.translate(PORTAL_X, PORTAL_Y);

    ctx.fillStyle = active ? 'rgba(90, 50, 150, 0.16)' : 'rgba(40, 36, 60, 0.2)';
    ctx.beginPath();
    ctx.arc(0, 0, PORTAL_RADIUS + 26, 0, TAU);
    ctx.fill();

    for (let i = 0; i < 4; i++) {
      const r = 34 + i * 22;
      const spin = t * (active ? 0.8 : 0.16) * (i % 2 === 0 ? 1 : -1) + i;
      ctx.strokeStyle = withAlpha(color, active ? 0.5 - i * 0.09 : 0.18);
      ctx.lineWidth = (i === 0 ? 3 : 1.6) / this.zoom;
      ctx.setLineDash(i === 2 ? [10, 14] : []);
      ctx.beginPath();
      ctx.arc(0, 0, r + Math.sin(t * 1.6 + i) * 2.5, spin, spin + TAU * (0.55 + i * 0.08));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    if (active) {
      ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createLinearGradient(0, -280, 0, 10);
      beam.addColorStop(0, 'rgba(192, 139, 255, 0)');
      beam.addColorStop(0.65, 'rgba(192, 139, 255, 0.1)');
      beam.addColorStop(1, 'rgba(192, 139, 255, 0.3)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(-12, -280);
      ctx.lineTo(12, -280);
      ctx.lineTo(PORTAL_RADIUS, 0);
      ctx.lineTo(-PORTAL_RADIUS, 0);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      const glow = 6 + Math.sin(t * 4) * 1.8;
      ctx.fillStyle = 'rgba(236, 224, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, glow, 0, TAU);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(160, 150, 190, 0.55)';
      ctx.lineWidth = 2 / this.zoom;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(9, 0);
      ctx.stroke();
    }
    ctx.restore();
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
      if (bullet.missile) {
        this.drawMissile(bullet);
        continue;
      }
      const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
      const tailLength = bullet.pierce > 0 || bullet.hitIds.length > 0 ? 62 : 27;
      const tailX = bullet.x - (bullet.vx / speed) * tailLength;
      const tailY = bullet.y - (bullet.vy / speed) * tailLength;
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

  /** Seeker missile: curved trail plus a small arrowhead pointing where it flies. */
  private drawMissile(bullet: Bullet) {
    const ctx = this.ctx;
    const trail = bullet.trail ?? [];
    if (trail.length > 1) {
      ctx.strokeStyle = withAlpha(bullet.color, 0.16);
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(bullet.color, 0.55);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
      ctx.lineTo(bullet.x, bullet.y);
      ctx.stroke();
    }
    const angle = Math.atan2(bullet.vy, bullet.vx);
    ctx.save();
    ctx.translate(bullet.x, bullet.y);
    ctx.rotate(angle);
    ctx.fillStyle = withAlpha(bullet.color, 0.35);
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = bullet.color;
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-4, 4.5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, -4.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(1, 0, 2.2, 0, TAU);
    ctx.fill();
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

  private drawShells() {
    const ctx = this.ctx;
    if (!this.shells.length) return;
    for (const shell of this.shells) {
      // Target reticle stays at the aim point, so moving away visibly dodges it.
      const t = clamp(shell.traveled / Math.max(1, shell.total), 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.2 + t * 0.55;
      ctx.strokeStyle = withAlpha(shell.color, 0.75);
      ctx.lineWidth = 1.3;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.arc(shell.targetX, shell.targetY, 17 + Math.sin(this.elapsed * 7) * 2, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(shell.targetX - 24, shell.targetY);
      ctx.lineTo(shell.targetX - 12, shell.targetY);
      ctx.moveTo(shell.targetX + 12, shell.targetY);
      ctx.lineTo(shell.targetX + 24, shell.targetY);
      ctx.moveTo(shell.targetX, shell.targetY - 24);
      ctx.lineTo(shell.targetX, shell.targetY - 12);
      ctx.moveTo(shell.targetX, shell.targetY + 12);
      ctx.lineTo(shell.targetX, shell.targetY + 24);
      ctx.stroke();
      ctx.restore();

      const speed = Math.hypot(shell.vx, shell.vy) || 1;
      ctx.save();
      ctx.translate(shell.x, shell.y);

      // Comet tail.
      ctx.strokeStyle = withAlpha(shell.color, 0.4);
      ctx.lineWidth = shell.radius * 1.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-(shell.vx / speed) * 26, -(shell.vy / speed) * 26);
      ctx.lineTo(0, 0);
      ctx.stroke();

      // Glow.
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, shell.radius * 3.2);
      glow.addColorStop(0, withAlpha(shell.color, 0.5));
      glow.addColorStop(1, withAlpha(shell.color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, shell.radius * 3.2, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      ctx.rotate(shell.spin);
      ctx.fillStyle = 'rgba(34, 14, 4, 0.92)';
      ctx.strokeStyle = shell.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, shell.radius, 0, TAU);
      ctx.fill();
      ctx.stroke();

      // Orbiting arc that hints at the ring it will burst into.
      ctx.strokeStyle = withAlpha('#ffffff', 0.55);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, shell.radius + 6, 0, TAU * 0.62);
      ctx.stroke();

      ctx.fillStyle = '#fff1e0';
      ctx.beginPath();
      ctx.arc(0, 0, shell.radius * 0.45, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawHomings() {
    const ctx = this.ctx;
    if (!this.homings.length) return;
    for (const missile of this.homings) {
      const seeking = missile.seek > 0;
      // Locked missiles keep their hot colour; without a lock they go grey,
      // which is the cue that the next move just has to be a sidestep.
      const color = seeking ? missile.color : '#c1b2bd';

      // Curved smoke trail. Dashed while seeking, straight once the lock drops,
      // which is the main read for "it stopped following me".
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = 1; i < missile.trail.length; i++) {
        const a = missile.trail[i - 1];
        const b = missile.trail[i];
        const t = i / Math.max(1, missile.trail.length - 1);
        ctx.strokeStyle = withAlpha(color, t * (seeking ? 0.42 : 0.24));
        ctx.lineWidth = 1 + t * 5.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      const glow = ctx.createRadialGradient(
        missile.x,
        missile.y,
        1,
        missile.x,
        missile.y,
        missile.radius * 3.4,
      );
      glow.addColorStop(0, withAlpha(color, seeking ? 0.55 : 0.3));
      glow.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(missile.x, missile.y, missile.radius * 3.4, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(missile.x, missile.y);
      ctx.rotate(missile.angle);
      ctx.beginPath();
      ctx.moveTo(missile.radius * 2, 0);
      ctx.lineTo(-missile.radius * 1.1, missile.radius * 0.9);
      ctx.lineTo(-missile.radius * 0.45, 0);
      ctx.lineTo(-missile.radius * 1.1, -missile.radius * 0.9);
      ctx.closePath();
      ctx.fillStyle = withAlpha(color, 0.82);
      ctx.fill();
      ctx.strokeStyle = seeking ? '#ffffff' : withAlpha(color, 0.5);
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.fillStyle = seeking ? '#ffffff' : '#f2e9f7';
      ctx.beginPath();
      ctx.arc(0, 0, missile.radius * 0.38, 0, TAU);
      ctx.fill();
      ctx.restore();

      if (seeking) {
        // Dashed seeker ring spins only while the missile still has a lock.
        ctx.save();
        ctx.translate(missile.x, missile.y);
        ctx.strokeStyle = withAlpha('#ffffff', 0.6);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, missile.radius + 6, missile.spin, missile.spin + TAU * 0.7);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }

  private drawBlasts() {
    if (!this.blasts.length) return;
    const ctx = this.ctx;
    for (const blast of this.blasts) {
      const t = 1 - blast.life / blast.maxLife;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = withAlpha(blast.color, (1 - t) * 0.9);
      ctx.lineWidth = 3.6 * (1 - t) + 0.6;
      ctx.beginPath();
      ctx.arc(blast.x, blast.y, blast.radius * (0.35 + t * 0.9), 0, TAU);
      ctx.stroke();
      ctx.fillStyle = withAlpha('#ffffff', (1 - t) * 0.18);
      ctx.beginPath();
      ctx.arc(blast.x, blast.y, blast.radius * (0.85 - t * 0.7), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
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
      } else if (enemy.kind === 'splitter') {
        // Hexagonal shell casing with a charged core and an orbiting ring.
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
        const spin = this.elapsed * 1.1 + enemy.seed;
        ctx.strokeStyle = withAlpha(enemy.color, 0.55);
        ctx.lineWidth = 1.8;
        ctx.setLineDash([7, 7]);
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 8, spin, spin + TAU);
        ctx.stroke();
        ctx.setLineDash([]);

        // Split hazard mark inside the casing.
        ctx.strokeStyle = withAlpha(enemy.color, 0.85);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(7, 0);
        ctx.lineTo(0, 7);
        ctx.lineTo(-7, 0);
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : '#ffd9ac';
        ctx.beginPath();
        ctx.arc(0, 0, 3.6, 0, TAU);
        ctx.fill();
      } else if (enemy.kind === 'homing') {
        // Arrowhead hull with two side pods and a seeker eye: reads as a
        // launcher rather than a brawler.
        const spin = this.elapsed * 0.9 + enemy.seed;
        ctx.strokeStyle = withAlpha(enemy.color, 0.4);
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 7]);
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius + 9, spin, spin + TAU);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(enemy.radius * 1.15, 0);
        ctx.lineTo(-enemy.radius * 0.55, enemy.radius * 0.92);
        ctx.lineTo(-enemy.radius * 0.95, 0);
        ctx.lineTo(-enemy.radius * 0.55, -enemy.radius * 0.92);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Launch tubes either side of the hull.
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.roundRect(
            enemy.radius * 0.1,
            side * enemy.radius * 0.46 - 3,
            enemy.radius * 0.72,
            6,
            3,
          );
          ctx.fill();
          ctx.stroke();
        }

        ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : withAlpha(enemy.color, 0.9);
        ctx.beginPath();
        ctx.arc(enemy.radius * 0.2, 0, 4.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fff0fb';
        ctx.beginPath();
        ctx.arc(enemy.radius * 0.2, 0, 1.9, 0, TAU);
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

      if (enemy.kind !== 'boss') this.drawEnemyAttack(enemy);

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

  /** Wind-up telegraph and blade trail for the mob attack actions. */
  private drawEnemyAttack(enemy: Enemy) {
    const brain = enemy.brain;
    if (!brain.started || brain.queue[brain.index] !== 'attack') return;
    if (brain.phase === 'recover') return;
    const atk = ENEMY_BEHAVIOR[enemy.kind].attack;
    const ctx = this.ctx;
    const color = enemy.color;

    ctx.save();
    if (brain.phase === 'windup') {
      const total = Math.max(0.001, atk.windup);
      const t = clamp(1 - brain.timer / total, 0, 1);
      ctx.strokeStyle = withAlpha(color, 0.16 + t * 0.34);
      ctx.lineWidth = 1.6 / this.zoom;
      ctx.setLineDash([7 / this.zoom, 9 / this.zoom]);
      ctx.beginPath();
      if (atk.mode === 'sweep') {
        ctx.arc(enemy.x, enemy.y, atk.reach, 0, TAU);
      } else if (atk.mode === 'shell') {
        // The shell lands on a snapshot, so a long aim line would lie; show a
        // short muzzle pointer plus a charging ring instead.
        const aim = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
        ctx.moveTo(enemy.x, enemy.y);
        ctx.lineTo(
          enemy.x + Math.cos(aim) * (enemy.radius + 34),
          enemy.y + Math.sin(aim) * (enemy.radius + 34),
        );
      } else if (atk.mode === 'homing') {
        // The missile steers, so only the launch direction is promised.
        const aim = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
        ctx.moveTo(enemy.x, enemy.y);
        ctx.lineTo(
          enemy.x + Math.cos(aim) * (enemy.radius + 22),
          enemy.y + Math.sin(aim) * (enemy.radius + 22),
        );
      } else {
        const aim = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
        ctx.moveTo(enemy.x, enemy.y);
        ctx.lineTo(
          enemy.x + Math.cos(aim) * atk.reach * 0.55,
          enemy.y + Math.sin(aim) * atk.reach * 0.55,
        );
      }
      ctx.stroke();
      ctx.setLineDash([]);

      if (atk.mode === 'sweep') {
        // A marker races one full turn during the wind-up: this is a spin.
        const spin = enemy.angle - Math.PI + TAU * t;
        ctx.strokeStyle = withAlpha(color, 0.45 + t * 0.45);
        ctx.lineWidth = (2.5 + t * 2) / this.zoom;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, atk.reach * 0.94, spin, spin + 0.45 + t * 0.5);
        ctx.stroke();
      } else if (atk.mode === 'homing') {
        // Lock brackets close in on the player: this shot will chase.
        const target = this.player;
        const lockRadius = 48 - t * 24;
        ctx.strokeStyle = withAlpha(color, 0.22 + t * 0.5);
        ctx.lineWidth = (1.4 + t * 1.2) / this.zoom;
        ctx.lineCap = 'round';
        for (let q = 0; q < 4; q++) {
          const start = q * (TAU / 4) + this.elapsed * 1.6;
          ctx.beginPath();
          ctx.arc(target.x, target.y, lockRadius, start, start + 0.4);
          ctx.stroke();
        }
      }
    } else if (atk.mode === 'sweep') {
      // Swept sector, the blade edge and the full reach ring.
      ctx.fillStyle = withAlpha(color, 0.15);
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.arc(enemy.x, enemy.y, atk.reach, brain.sweepFrom, brain.sweepAngle);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = withAlpha(color, 0.4);
      ctx.lineWidth = 2 / this.zoom;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, atk.reach, brain.sweepFrom, brain.sweepAngle);
      ctx.stroke();

      ctx.strokeStyle = withAlpha(color, 0.12);
      ctx.lineWidth = 1.4 / this.zoom;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, atk.reach, 0, TAU);
      ctx.stroke();

      const tipX = enemy.x + Math.cos(brain.sweepAngle) * atk.reach;
      const tipY = enemy.y + Math.sin(brain.sweepAngle) * atk.reach;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = color;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
    } else {
      ctx.strokeStyle = withAlpha(color, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        enemy.x,
        enemy.y,
        enemy.radius + 10 + Math.sin(this.elapsed * 30) * 3,
        0,
        TAU,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawDashGhosts() {
    const ctx = this.ctx;

    // Launch ring: expands once from the point where the dodge started, which
    // stays put even while the ship slides away from it.
    if (this.dashRing.life > 0) {
      const t = 1 - this.dashRing.life / this.dashRing.maxLife;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = withAlpha(PLAYER_COLOR, (1 - t) * 0.5);
      ctx.lineWidth = 3 * (1 - t) + 0.4;
      ctx.beginPath();
      ctx.arc(this.dashRing.x, this.dashRing.y, 18 + t * 40, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // Comet ribbon from the launch point to the live ship: the clearest
    // "this is a dodge, not a walk" cue while the slide is happening.
    const player = this.player;
    if (player.dashTime > 0 && this.dashRing.life > 0) {
      const dx = player.x - this.dashRing.x;
      const dy = player.y - this.dashRing.y;
      const span = Math.hypot(dx, dy);
      if (span > 4) {
        const nx = -dy / span;
        const ny = dx / span;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const ribbon = ctx.createLinearGradient(
          this.dashRing.x,
          this.dashRing.y,
          player.x,
          player.y,
        );
        ribbon.addColorStop(0, 'rgba(95, 246, 255, 0)');
        ribbon.addColorStop(0.55, 'rgba(120, 250, 255, 0.16)');
        ribbon.addColorStop(1, 'rgba(210, 255, 255, 0.34)');
        ctx.fillStyle = ribbon;
        ctx.beginPath();
        ctx.moveTo(this.dashRing.x + nx * 5, this.dashRing.y + ny * 5);
        ctx.lineTo(player.x + nx * 15, player.y + ny * 15);
        ctx.lineTo(player.x - nx * 15, player.y - ny * 15);
        ctx.lineTo(this.dashRing.x - nx * 5, this.dashRing.y - ny * 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    if (this.dashTrail.life > 0) {
      const trail = this.dashTrail;
      const t = trail.life / trail.maxLife;
      const dx = trail.x2 - trail.x1;
      const dy = trail.y2 - trail.y1;
      const span = Math.hypot(dx, dy) || 1;
      const nx = -dy / span;
      const ny = dx / span;
      // Tapered, gradient tail: thin and transparent where the dodge began,
      // widest and brightest where the ship came to rest.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const tail = ctx.createLinearGradient(trail.x1, trail.y1, trail.x2, trail.y2);
      tail.addColorStop(0, 'rgba(95, 246, 255, 0)');
      tail.addColorStop(0.5, `rgba(95, 246, 255, ${0.16 * t})`);
      tail.addColorStop(1, `rgba(140, 250, 255, ${0.4 * t})`);
      const w0 = 1.5;
      const w1 = 5 + 11 * t;
      ctx.fillStyle = tail;
      ctx.beginPath();
      ctx.moveTo(trail.x1 + nx * w0, trail.y1 + ny * w0);
      ctx.lineTo(trail.x2 + nx * w1, trail.y2 + ny * w1);
      ctx.lineTo(trail.x2 - nx * w1, trail.y2 - ny * w1);
      ctx.lineTo(trail.x1 - nx * w0, trail.y1 - ny * w0);
      ctx.closePath();
      ctx.fill();

      const core = ctx.createLinearGradient(trail.x1, trail.y1, trail.x2, trail.y2);
      core.addColorStop(0, 'rgba(230, 255, 255, 0)');
      core.addColorStop(1, `rgba(240, 255, 255, ${0.5 * t})`);
      ctx.strokeStyle = core;
      ctx.lineWidth = 1 + 1.6 * t;
      ctx.beginPath();
      ctx.moveTo(trail.x1, trail.y1);
      ctx.lineTo(trail.x2, trail.y2);
      ctx.stroke();
      ctx.restore();
    }

    if (!this.ghosts.length) return;
    ctx.save();
    for (const ghost of this.ghosts) {
      const t = clamp(ghost.life / ghost.maxLife, 0, 1);
      ctx.save();
      ctx.translate(ghost.x, ghost.y);
      ctx.rotate(ghost.angle);

      // Solid, darkened copy of the ship: the silhouette (hull, fins, barrel,
      // white core) is what makes an echo read as the player instead of a
      // string of glowing bubbles.
      ctx.globalAlpha = 0.25 + t * 0.7;
      ctx.fillStyle = 'rgba(14, 44, 58, 0.92)';
      ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.7);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, TAU);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(10, 32, 44, 0.92)';
      ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.5);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.roundRect(2, -5, 26, 10, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = withAlpha(PLAYER_COLOR, 0.16);
      ctx.strokeStyle = withAlpha(PLAYER_COLOR, 0.55);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-6, -10);
      ctx.lineTo(-20, -16);
      ctx.lineTo(-14, -3);
      ctx.closePath();
      ctx.moveTo(-6, 10);
      ctx.lineTo(-20, 16);
      ctx.lineTo(-14, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = withAlpha('#d9fdff', 0.55 + t * 0.4);
      ctx.beginPath();
      ctx.arc(0, 0, 4.6, 0, TAU);
      ctx.fill();

      ctx.restore();
    }
    ctx.restore();
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

    if (player.dashTime > 0) {
      // Dodge wake: layered afterburner cones plus flickering jets, so an
      // ordinary stick move never looks like this.
      const charge = clamp(player.dashTime / DASH_TIME, 0, 1);
      const flicker = 0.82 + Math.sin(this.elapsed * 46) * 0.18;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.rotate(Math.atan2(player.dashDirY, player.dashDirX));

      const len = 54 + 74 * charge;
      const wake = ctx.createLinearGradient(0, 0, -len, 0);
      wake.addColorStop(0, 'rgba(200, 255, 255, 0.42)');
      wake.addColorStop(0.35, 'rgba(95, 246, 255, 0.2)');
      wake.addColorStop(1, 'rgba(95, 246, 255, 0)');
      ctx.fillStyle = wake;
      ctx.beginPath();
      ctx.moveTo(-8, -18);
      ctx.quadraticCurveTo(-len * 0.62, 0, -8, 18);
      ctx.closePath();
      ctx.fill();

      // Two hot jets out of the rear fins.
      for (const side of [-1, 1]) {
        const jet = 30 + 26 * charge * flicker;
        const flame = ctx.createLinearGradient(-10, 0, -10 - jet, 0);
        flame.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
        flame.addColorStop(0.35, 'rgba(150, 252, 255, 0.5)');
        flame.addColorStop(1, 'rgba(95, 246, 255, 0)');
        ctx.fillStyle = flame;
        ctx.beginPath();
        ctx.moveTo(-12, side * 4);
        ctx.lineTo(-12 - jet, side * 11);
        ctx.lineTo(-12, side * 13);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(225, 255, 255, 0.55)';
      ctx.lineWidth = 1.5;
      for (const offset of [-11, 0, 11]) {
        ctx.beginPath();
        ctx.moveTo(-14, offset);
        ctx.lineTo(-len * (offset === 0 ? 0.95 : 0.66), offset * 1.3);
        ctx.stroke();
      }
      ctx.restore();

      const burst = ctx.createRadialGradient(0, 0, 2, 0, 0, 36);
      burst.addColorStop(0, 'rgba(240, 255, 255, 0.6)');
      burst.addColorStop(1, 'rgba(95, 246, 255, 0)');
      ctx.fillStyle = burst;
      ctx.beginPath();
      ctx.arc(0, 0, 36, 0, TAU);
      ctx.fill();
    }

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

    // Hull (white-hot while dodging)
    const dashing = player.dashTime > 0;
    ctx.fillStyle = '#071722';
    ctx.strokeStyle = dashing ? '#f2ffff' : PLAYER_COLOR;
    ctx.lineWidth = dashing ? 3 : 2.5;
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
    if (!this.autoTarget || this.autoTarget.dead) return;
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

    // Dodge: a brief cyan bloom at the ship, so a dash still lights up the
    // frame without the wind streaks.
    if (this.dashFlash > 0) {
      const k = this.dashFlash / 0.22;
      const bloom = ctx.createRadialGradient(
        width / 2,
        height / 2,
        0,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.62,
      );
      bloom.addColorStop(0, `rgba(200, 255, 255, ${0.16 * k})`);
      bloom.addColorStop(0.4, `rgba(95, 246, 255, ${0.07 * k})`);
      bloom.addColorStop(1, 'rgba(95, 246, 255, 0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
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

function turnTowards(from: number, to: number, t: number) {
  return from + angleDelta(from, to) * clamp(t, 0, 1);
}

/** Shortest signed turn from `from` to `to`, in (-PI, PI]. */
function angleDelta(from: number, to: number) {
  return ((((to - from + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}
