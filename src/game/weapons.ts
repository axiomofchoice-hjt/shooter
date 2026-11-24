import type { WeaponId } from './types';

// Shared by the close-range weapons so the range circle and lock distance agree.
const SHORT_RANGE = 240;

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  tag: string;
  color: string;
  damage: number;
  cooldown: number;
  speed: number;
  radius: number;
  life: number;
  pellets: number;
  spread: number;
  pierce: number;
  /**
   * Homing weapons lock a target at launch and steer toward it. `range` is the
   * lock-on distance; it also caps how far a shot with no target flies.
   */
  range?: number;
  homing?: boolean;
  /** Steering rate in rad/s for homing shots. */
  turnRate?: number;
  /** Continuous cone weapon: no bullets, damage is applied while firing. */
  flame?: boolean;
  /** Half-angle of the damage cone, in radians. */
  cone?: number;
  /** Hitscan chain lightning: hits one target, then jumps to nearby ones. */
  chain?: {
    /** Maximum total targets, including the first. */
    targets: number;
    /** Search radius for each jump. */
    jumpRange: number;
    /** Damage multiplier applied on every jump. */
    falloff: number;
  };
  /** Projectile that detonates on an enemy or wall. */
  shock?: {
    /** Damage radius of the blast. */
    blastRadius: number;
    /** Outward shove applied to enemies caught in the blast. */
    knockback: number;
  };
  /** Deployable dart that decelerates and periodically zaps an area. */
  storm?: {
    /** End point distance as a multiple of the target distance (1.1 = 10% past). */
    overshootRatio: number;
    /** Seconds to cover the first 90% of the distance to the target. */
    fastTime: number;
    /** Radius of each electric pulse. */
    aoeRadius: number;
    /** Seconds between pulses. */
    pulseInterval: number;
  };
  /** Hitscan piercing beam that grows stronger while idle. */
  laser?: {
    /** Seconds of idle time to reach full charge. */
    chargeTime: number;
    /** Damage multiplier at full charge. */
    maxMultiplier: number;
    /** Beam width at no charge / full charge. */
    minWidth: number;
    maxWidth: number;
  };
}

const ALL_WEAPONS: WeaponId[] = [
  'pulse',
  'storm',
  'laser',
  'smg',
  'scatter',
  'rail',
  'seeker',
  'flamer',
  'arc',
  'shock',
];

// Temporarily expose the pulse rifle, storm dart and laser. The other seven
// stay implemented and fully specced, but cannot be reached from the in-game
// weapon cycle. Raise this count to bring them back.
const VISIBLE_WEAPONS = 3;

export const WEAPON_ORDER: WeaponId[] = ALL_WEAPONS.slice(0, VISIBLE_WEAPONS);

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  pulse: {
    id: 'pulse',
    name: '脉冲枪',
    tag: 'PULSE',
    color: '#5ff6ff',
    damage: 2,
    cooldown: 0.115,
    speed: 1080,
    radius: 4,
    life: 1.15,
    pellets: 1,
    spread: 0,
    pierce: 0,
  },
  smg: {
    id: 'smg',
    name: '冲锋枪',
    tag: 'SMG',
    color: '#b6ff5f',
    damage: 1.3,
    cooldown: 0.06,
    speed: 1200,
    radius: 3,
    life: 0.95,
    pellets: 1,
    spread: 0.075,
    pierce: 0,
  },
  scatter: {
    id: 'scatter',
    name: '霰弹枪',
    tag: 'SHOTGUN',
    color: '#ff9f43',
    damage: 2.2,
    cooldown: 0.5,
    speed: 950,
    radius: 4,
    life: 0.72,
    pellets: 5,
    spread: 0.62,
    pierce: 0,
  },
  rail: {
    id: 'rail',
    name: '轨道炮',
    tag: 'RAIL',
    color: '#ff5fd2',
    damage: 24,
    cooldown: 0.8,
    speed: 1900,
    radius: 5,
    life: 1.2,
    pellets: 1,
    spread: 0,
    pierce: 2,
  },
  // Lock-on missile: the target is picked at the trigger pull and never
  // changes, so a dead target still gets a missile flown to its last spot.
  // Walls are not part of the lock or the flight path.
  seeker: {
    id: 'seeker',
    name: '追猎炮',
    tag: 'SEEKER',
    color: '#b28dff',
    damage: 8,
    cooldown: 0.5,
    speed: 1500,
    radius: 4.5,
    life: 0.8,
    pellets: 1,
    spread: 0,
    pierce: 0,
    range: SHORT_RANGE,
    homing: true,
    turnRate: 9,
  },
  // Short-range plasma projector: holds a cone of damage in front of the
  // player. Same reach as the seeker, but it hits everything in the fan
  // instead of locking one target.
  flamer: {
    id: 'flamer',
    name: '等离子喷火器',
    tag: 'PLASMA',
    color: '#ffb347',
    damage: 0.9,
    cooldown: 0,
    speed: 0,
    radius: 0,
    life: 0,
    pellets: 1,
    spread: 0,
    pierce: 0,
    range: SHORT_RANGE,
    flame: true,
    cone: 0.4,
  },
  // Chain lightning: no projectile, one zap that walks through a cluster.
  arc: {
    id: 'arc',
    name: '电弧炮',
    tag: 'ARC',
    color: '#8fd8ff',
    damage: 8,
    cooldown: 0.55,
    speed: 0,
    radius: 0,
    life: 0,
    pellets: 1,
    spread: 0,
    pierce: 0,
    // No range cap: the first target can be anywhere the player can see.
    chain: { targets: 4, jumpRange: 260, falloff: 0.62 },
  },
  // Lightning dart: flies past the target, then becomes a short-lived storm
  // emitter that shocks everything around it.
  storm: {
    id: 'storm',
    name: '雷暴镖',
    tag: 'STORM',
    color: '#7dffd4',
    damage: 5,
    cooldown: 1,
    speed: 0,
    radius: 0,
    life: 2.5,
    pellets: 1,
    spread: 0,
    pierce: 0,
    storm: {
      overshootRatio: 0.1,
      fastTime: 0.5,
      aoeRadius: 150,
      pulseInterval: 0.5,
    },
  },
  // Charge laser: one piercing beam. Idle time makes the beam thicker and
  // stronger (up to 2x), but firing as fast as possible is the higher DPS.
  laser: {
    id: 'laser',
    name: '聚能激光',
    tag: 'LASER',
    color: '#ff5c8a',
    damage: 10,
    cooldown: 0.75,
    speed: 0,
    radius: 0,
    life: 0,
    pellets: 1,
    spread: 0,
    pierce: 0,
    laser: {
      chargeTime: 2,
      maxMultiplier: 2,
      minWidth: 3,
      maxWidth: 22,
    },
  },
  // Concussion shell: explodes on contact and shoves the blast outward.
  shock: {
    id: 'shock',
    name: '震荡炮',
    tag: 'SHOCK',
    color: '#ffe066',
    damage: 20,
    cooldown: 1,
    speed: 780,
    radius: 8,
    life: 2.5,
    pellets: 1,
    spread: 0,
    pierce: 0,
    shock: { blastRadius: 150, knockback: 430 },
  },
};

export function nextWeapon(current: WeaponId): WeaponId {
  const index = WEAPON_ORDER.indexOf(current);
  return WEAPON_ORDER[(index + 1) % WEAPON_ORDER.length];
}
