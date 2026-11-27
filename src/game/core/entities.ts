/** Data shapes for the entities, projectiles and effects in GameWorld. */

import type { EnemyKind, WeaponId } from '../types';
import type { WeaponSpec } from '../weapons';
import type { AttackPhase, EnemyAction } from './enemyDefs';

export interface Player {
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
  /** Unit vector of the last actual travel direction; dodges follow it. */
  lastMoveX: number;
  lastMoveY: number;
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

  /** Turret this attack is aimed at; cleared back to the player when it dies. */
  turretId?: number;
}

export function createEnemyBrain(): EnemyBrain {
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

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** External shove from a shockwave, separate from steering. */
  knockX: number;
  knockY: number;
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
  /** Seconds until the orbit weapon can hit this enemy again. */
  orbitCooldown: number;
  /** Hive-gun hits landed since the last turret summon. */
  summonHits: number;
  age: number;
  seed: number;
  brain: EnemyBrain;
  desiredX: number;
  desiredY: number;
  desiredSpeed: number;
  turnRate: number;
  /** Training dummy: stationary, no attacks, no rewards, respawns on death. */
  dummy?: boolean;
  dead: boolean;
}

export interface Bullet {
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
  /**
   * Salvage bolt: the gun cannot fire again until this shot is back at the
   * player. It flies out to its lock (or straight ahead), then turns around and
   * flies home; a shot without a live lock stops at a wall. The launch cooldown
   * is the minimum interval. Any removal also clears it, so a room change can
   * never lock the weapon up.
   */
  recycle?: boolean;
  /** Salvage bolt only: true once it has hit its mark (or a wall) and is flying home. */
  returning?: boolean;
  /** Detonates on the first enemy or wall it touches. */
  shock?: {
    blastRadius: number;
    damage: number;
    knockback: number;
  };
  /** Volley missile: a small blast where it lands or expires. */
  blast?: {
    radius: number;
    damage: number;
  };
  /** Ricochet shot: wall bounces left before it breaks on the wall. */
  bounce?: {
    left: number;
  };
  /** Mother shot: bursts into children on the first enemy or wall it hits. */
  split?: {
    count: number;
    damage: number;
    speed: number;
    life: number;
    radius: number;
  };
  /** Split child: the mother's victim is skipped so the ring can spread. */
  ignoreId?: number;
  /** Hive shot: hits per turret summon, carried so mid-flight swaps are safe. */
  summonEvery?: number;
  /**
   * Bubble shot: `drag` bleeds speed exponentially every frame, and `seed`
   * drives the gentle visual wobble of the soap film.
   */
  bubble?: {
    drag: number;
    seed: number;
  };
  /**
   * Grinding dart: the blade keeps a `tick` timer that pays `tickDamage` to
   * every enemy touching its cutting area. It travels at `speed` — its launch
   * speed while free, `slowSpeed` while `cutting`. It is removed by the first
   * wall it touches.
   */
  dart?: {
    slowSpeed: number;
    tickInterval: number;
    tickDamage: number;
    bladeRadius: number;
    /** Seconds until the next grind tick; starts partly charged. */
    tick: number;
    /** Blade rotation in radians, and its spin rate in rad/s. */
    spin: number;
    /** Current travel speed; also the speed it returns to after a cut. */
    speed: number;
    fastSpeed: number;
    freeSpin: number;
    grindSpin: number;
    cutting: boolean;
    /** Seconds the crawl is held after the last contact, so the blade does
     * not snap back to full speed between two ticks of a moving target. */
    hold: number;
  };
  /**
   * Mine-layer shot: on the first enemy it hits it marks a ring of mine spots
   * around that impact point, and each mine surfaces one `spawnDelay` later.
   * The bullet itself is then spent.
   */
  minefield?: {
    count: number;
    ringRadius: number;
    spawnDelay: number;
    life: number;
    triggerRadius: number;
    blastRadius: number;
    blastDamage: number;
    radius: number;
  };
}

export interface EnemyBullet {
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
export interface EnemyShell {
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
export interface EnemyHoming {
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
  /** Turret this missile is chasing instead of the player, when set. */
  turretId?: number;
}

// Autonomous partner drone. It uses the same taunt/damage plumbing as a
// sentry turret so enemies can target and hit it, but it moves and fights on
// its own.
export interface PartnerBrain {
  vx: number;
  vy: number;
  targetId: number | null;
  phase: 'chase' | 'brace' | 'recover' | 'ready';
  timer: number;
}

// Sentry turret summoned by the hive gun. It shoots for a few seconds, pulls
// enemy attacks, and has enough HP to soak a hit or two. The partner drone
// shares this body with a `partner` brain; hive turrets leave it undefined.
export interface Turret {
  id: number;
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  hitFlash: number;
  cooldown: number;
  life: number;
  maxLife: number;
  muzzle: number;
  color: string;
  seed: number;
  partner?: PartnerBrain;
}

// Autonomous escort drone. It has no HP and is never an enemy target: enemies
// pick the player (or a sentry turret), and enemy bullets only test the player
// and turrets. It fires on its own and is not bound to the trigger.
export interface Funnel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  cooldown: number;
  muzzle: number;
  /** Live target, or null while escorting the player. */
  targetId: number | null;
  /** Fly to a spot, wind up, fire, recover, or hold ready at the spot. */
  phase: 'chase' | 'brace' | 'recover' | 'ready';
  /** Seconds left in the brace or recover phase. */
  timer: number;
  seed: number;
}

// Small round blast left where a homing missile breaks.
export interface Blast {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
}

// Decelerating lightning dart that keeps zapping the area around its resting point.
export interface StormDart {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  x: number;
  y: number;
  age: number;
  life: number;
  totalDistance: number;
  fastTime: number;
  fastDistance: number;
  startSpeed: number;
  glideSpeed: number;
  pulseInterval: number;
  pulseCount: number;
  aoeRadius: number;
  damage: number;
  color: string;
  dirX: number;
  dirY: number;
  seed: number;
}

// Mine spot marked by the mine-layer gun. The mine is not there yet until
// `age` reaches `delay`; in the meantime the renderer draws a moving short
// line from `originX`/`originY` to the spot. Once it surfaces it explodes when
// an enemy touches its trigger radius and expires `life` seconds later.
export interface Mine {
  id: number;
  x: number;
  y: number;
  originX: number;
  originY: number;
  /** Seconds since the shot landed. */
  age: number;
  /** Seconds until the mine surfaces. */
  delay: number;
  /** Seconds the surfaced mine lives. */
  life: number;
  /** True once the mine has surfaced and can be triggered. */
  surfaced: boolean;
  triggerRadius: number;
  blastRadius: number;
  blastDamage: number;
  radius: number;
  color: string;
  seed: number;
}

// Expanding blast ring; damage is applied at detonation, this is the visual.
export interface Shockwave {
  x: number;
  y: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
}

// Rectangular shove from the impact cannon: the area is resolved instantly,
// this record only keeps the flash alive for a couple of frames.
export interface RamBlast {
  x: number;
  y: number;
  angle: number;
  length: number;
  halfWidth: number;
  life: number;
  maxLife: number;
  color: string;
}

type BomberSpec = NonNullable<WeaponSpec['bomber']>;

// Plane called in by the carpet bomber. It crosses the room along the aim line
// and drops bombs the whole way.
export interface Bomber {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  dirX: number;
  dirY: number;
  length: number;
  elapsed: number;
  callIn: number;
  speed: number;
  dropTimer: number;
  seed: number;
  color: string;
  spec: BomberSpec;
}

// Bomb falling from the plane toward its ground impact point.
export interface Bomb {
  startX: number;
  startY: number;
  x: number;
  y: number;
  age: number;
  fuse: number;
  color: string;
  spec: BomberSpec;
}

// Burning ring left on the floor by an airstrike bomb. It damages enemies in
// fixed ticks, like the flamer, so damage does not depend on frame rate.
export interface FireRing {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  tickTimer: number;
  tickInterval: number;
  tickDamage: number;
  pulse: number;
  seed: number;
  color: string;
}

// One chain-lightning zap, kept briefly so the bolt can be drawn.
export interface ArcBolt {
  /** Player muzzle followed by every enemy the chain reached. */
  nodes: Array<{ x: number; y: number }>;
  life: number;
  maxLife: number;
  color: string;
  seed: number;
}

// One piercing hitscan beam, kept briefly so the shot can be drawn.
export interface LaserBeam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  life: number;
  maxLife: number;
  color: string;
  seed: number;
}

export interface Particle {
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
export interface DashGhost {
  x: number;
  y: number;
  angle: number;
  dirX: number;
  dirY: number;
  life: number;
  maxLife: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

export interface Pickup {
  x: number;
  y: number;
  age: number;
  life: number;
}

export interface Telegraph {
  x: number;
  y: number;
  kind: EnemyKind;
  timer: number;
  duration: number;
}

export interface Banner {
  title: string;
  sub: string;
  time: number;
  duration: number;
  color: string;
}

export interface Decoration {
  x: number;
  y: number;
  size: number;
  alpha: number;
  phase: number;
}

export interface FloorMark {
  x: number;
  y: number;
  radius: number;
  rotation: number;
  alpha: number;
  kind: 'ring' | 'cross' | 'diamond';
}

export interface Mote {
  x: number;
  y: number;
  size: number;
  drift: number;
  phase: number;
  color: string;
}

export type Phase = 'idle' | 'playing' | 'gameover';
export type BossAttack = 'radial' | 'aimed' | 'summon';

export interface InputState {
  keys: Set<string>;
  touchX: number;
  touchY: number;
  touchFire: boolean;
  padX: number;
  padY: number;
  padFire: boolean;
  fireKey: boolean;
}
