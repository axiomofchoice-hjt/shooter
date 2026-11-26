import { SoundFX } from '../audio';
import type { EnemyKind, GameCallbacks, GameMode, TestEnemyKind, WeaponId } from '../types';
import { DUNGEON_LOADOUT } from '../weapons';
import { DUNGEON_WIDTH, PLAYER_START_ANGLE, ROOM_SIZE } from './config';
import type {
  ArcBolt,
  Banner,
  Blast,
  Bomb,
  Bomber,
  BossAttack,
  Bullet,
  DashGhost,
  Decoration,
  Enemy,
  EnemyBullet,
  EnemyHoming,
  EnemyShell,
  FireRing,
  Floater,
  FloorMark,
  Funnel,
  InputState,
  LaserBeam,
  LobItem,
  Mote,
  Particle,
  Phase,
  Pickup,
  Player,
  Shockwave,
  StormDart,
  Telegraph,
  Turret,
} from './entities';

/** Shared mutable game state. Systems read and write this directly. */
export class GameWorld {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly callbacks: GameCallbacks;
  dpr = 1;
  width = 1;
  height = 1;

  phase: Phase = 'idle';
  mode: GameMode = 'dungeon';
  worldW = DUNGEON_WIDTH;
  worldH = ROOM_SIZE;
  paused = false;
  elapsed = 0;
  ambientTime = 0;
  hudTimer = 0;
  fps = 0;
  fpsFrames = 0;
  fpsElapsed = 0;

  player!: Player;
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  enemyBullets: EnemyBullet[] = [];
  shells: EnemyShell[] = [];
  homings: EnemyHoming[] = [];
  blasts: Blast[] = [];
  arcs: ArcBolt[] = [];
  // Flat x/y pairs for the bolt polyline, reused every frame: a zap lives for
  // ~11 frames and allocating a fresh point list each one was pure GC churn.
  arcPoints: number[] = [];
  shockwaves: Shockwave[] = [];
  stormDarts: StormDart[] = [];
  bombers: Bomber[] = [];
  bombs: Bomb[] = [];
  fireRings: FireRing[] = [];
  laserBeams: LaserBeam[] = [];
  turrets: Turret[] = [];
  nextTurretId = 1;
  funnels: Funnel[] = [];
  /** Seconds until the downed partner drone redeploys. */
  partnerRespawn = 0;
  particles: Particle[] = [];
  ghosts: DashGhost[] = [];
  dashGhostTimer = 0;
  // Expanding ring left at the launch point so a dodge reads even at a glance.
  readonly dashRing = { x: 0, y: 0, life: 0, maxLife: 0.36 };
  dashFlash = 0;
  // Light streak left behind by the finished slide, fading for a moment so the
  // dash stays readable even after it ends.
  readonly dashTrail = { x1: 0, y1: 0, x2: 0, y2: 0, life: 0, maxLife: 0.34 };
  floaters: Floater[] = [];
  pickups: Pickup[] = [];
  telegraphs: Telegraph[] = [];
  decorations: Decoration[] = [];
  floorMarks: FloorMark[] = [];
  motes: Mote[] = [];
  banner: Banner | null = null;
  boss: Enemy | null = null;
  bossWindup = 0;
  bossAttackKind: BossAttack = 'radial';
  victoryTimer = 0;
  // Test room (the old boss arena): endless waves of whichever enemies the
  // player picked on the start screen.
  testWave = 0;
  testWaveTimer = 0;
  testEnemies: TestEnemyKind[] = ['grunt'];
  weaponPool: WeaponId[] = DUNGEON_LOADOUT;

  readonly input: InputState = {
    keys: new Set(),
    touchX: 0,
    touchY: 0,
    touchFire: false,
    padX: 0,
    padY: 0,
    padFire: false,
    fireKey: false,
  };

  readonly camera = { x: ROOM_SIZE / 2, y: ROOM_SIZE / 2 };
  // Enemy-derived camera offset is kept separately so a kill does not snap
  // the framing back to the player.
  cameraBiasX = 0;
  cameraBiasY = 0;
  cameraLeadX = 0;
  cameraLeadY = 0;
  zoom = 1;
  shake = 0;
  hurtFlash = 0;
  healFlash = 0;
  killFlash = 0;

  score = 0;
  kills = 0;
  combo = 0;
  comboTimer = 0;
  floor = 1;
  roomIndex = 0;
  roomCleared: boolean[] = [false, false, false, false, false];
  encounterActive = false;
  spawnQueue: EnemyKind[] = [];
  spawnTimer = 0;
  nextEnemyId = 1;
  autoTarget: Enemy | null = null;
  secondaryCooldown = 0;
  dodgeCooldown = 0;
  // The bomber's recharge is tracked separately: its 6.5s cooldown must not
  // lock out every other weapon just because the player switched guns.
  bomberCooldown = 0;
  flameTick = 0;
  laserCharge = 0;
  // Orthogonal cannon: the cardinal direction the next shot will leave along.
  cardinalAim = PLAYER_START_ANGLE;
  // Volley gun: shots landed during the current trigger hold, and whether the
  // trigger was held last frame so a release can be detected.
  volleyShots = 0;
  volleyFiring = false;
  // Training dummy in the dungeon start room: the live body plus a throttle
  // for its damage numbers. It cannot be destroyed.
  dummy: Enemy | null = null;
  dummyFloatTimer = 0;
  // Parabola gun: enemy hits since the last drop, plus the lobbed items.
  dropHits = 0;
  lobItems: LobItem[] = [];
  // Orbit weapon: current spin/radius, how far it is spun out (0..1), and the
  // remaining seconds of the timed spin-up started by a trigger press.
  orbitAngle = 0;
  orbitRadius = 0;
  orbitExpand = 0;
  orbitActive = 0;
  readonly sfx = new SoundFX();

  bgGradient: CanvasGradient | null = null;
  dangerGlow: CanvasGradient | null = null;
  // Small glows for static props, built once and reused with a translate
  // instead of paying for a blurred shadow on every frame.
  readonly glowCache = new Map<string, CanvasGradient>();

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.callbacks = callbacks;
  }
}
