import type { WeaponId } from './types';

// Shared by the close-range weapons so the range circle and lock distance agree.
const SHORT_RANGE = 240;

/**
 * Sentry turrets dropped by the hive gun. One turret per three hits on the
 * same enemy (or one kill), placed about one body away from that enemy.
 */
export const TURRET = {
  /** Hits on the same enemy needed for a summon. */
  hitsPerSummon: 3,
  /** Live turret cap; summoning past it retires the oldest turret. */
  maxCount: 4,
  /** Turrets expire on their own after this many seconds. */
  life: 7,
  /** Body radius for drawing and hit tests. */
  radius: 11,
  /** Gap between the target enemy's edge and the turret's edge. */
  spawnGap: 34,
  /** How much punishment a turret survives. */
  hp: 40,
  /** Enemies this close pick a turret as their attack target. */
  tauntRange: 200,
  /** Target acquisition radius, also drawn as the range ring. */
  range: 280,
  fireInterval: 0.3,
  damage: 2.5,
  shotSpeed: 1100,
  shotRadius: 3,
  /** Turret shots fizzle just past the ring so the drawn range stays honest. */
  shotLife: 0.28,
};

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
  /**
   * Salvage bolt: locks the nearest visible enemy with no range cap, flies back
   * to the player after landing, and blocks the next shot for the whole round
   * trip. `cooldown` is the minimum interval, so a point-blank target fires
   * faster than a far one but never faster than this floor.
   */
  recycle?: boolean;
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
  /**
   * Fires `pellets` shots evenly around the full circle, the first one along
   * the aim heading. Used by the ricochet gun, so the aim heading is always one
   * of the directions when a target is locked.
   */
  ring?: boolean;
  /**
   * Fires only along one of the four cardinal axes. The aim picks an axis with
   * a hittable enemy first, then the axis closest to the nearest enemy, then
   * the axis closest to the movement direction. The shot itself is an ordinary
   * bullet, so `speed`, `radius` and `life` apply as usual.
   */
  cardinal?: boolean;
  /**
   * Release volley: count shots while the trigger is held, then launch
   * `missiles` homing missiles when it is released after at least `shots`
   * shots. The regular fire uses the normal bullet fields above.
   */
  volley?: {
    /** Shots that must land while holding before a release volley. */
    shots: number;
    /** Homing missiles fired when the trigger is released. */
    missiles: number;
    missileDamage: number;
    missileSpeed: number;
    missileTurnRate: number;
    missileRadius: number;
    blastRadius: number;
    blastDamage: number;
  };
  /**
   * Every N enemy hits with this weapon's bullets drop a parabola item at the
   * hit point. Hits from different enemies all count toward the same streak.
   */
  dropEvery?: number;
  /** Wall bounces a shot survives; it breaks on the wall after the last one. */
  bounces?: number;
  /** Mother shot that bursts into `count` children the moment it lands on an
   * enemy or a wall. Children fly evenly around the mother's own heading and
   * never split again.
   */
  split?: {
    count: number;
    childDamage: number;
    childSpeed: number;
    childLife: number;
    childRadius: number;
  };
  /**
   * Hive gun: its hits are counted per enemy and every few of them (or a kill)
   * drop a sentry turret. Turret numbers live in TURRET below.
   */
  summon?: boolean;
  /**
   * Carpet bomber: calls a plane down the player→lock line. It crosses the
   * whole room, dropping bombs that blast enemies and leave burning rings on
   * the floor. This is a long-cooldown area weapon, not a direct shot.
   */
  bomber?: {
    /** Seconds between the call-in and the plane entering the room. */
    callIn: number;
    /** Plane speed across the room, in world px/s. */
    planeSpeed: number;
    /** How far outside the room the run starts and ends. */
    margin: number;
    /** Seconds between bomb drops. */
    dropInterval: number;
    /** Half-width of the carpet band, in world px. */
    spread: number;
    /** Seconds from drop to impact. */
    fuse: number;
    blastRadius: number;
    blastDamage: number;
    /** Burning ring left at each impact. */
    ringRadius: number;
    ringLife: number;
    ringTickInterval: number;
    ringTickDamage: number;
  };
  /**
   * Orbiting guards: balls circle the player, damage whatever they touch and
   * erase enemy bullets. Holding fire spins them out to `maxRadius`.
   */
  orbit?: {
    /** Number of balls. */
    count: number;
    /** Resting orbit radius, in world px. */
    idleRadius: number;
    /** Reach while the trigger is held. */
    maxRadius: number;
    /** Resting / spun-up angular speed, in rad/s. */
    idleSpeed: number;
    activeSpeed: number;
    /** Ball radius for both contact checks and drawing. */
    ballRadius: number;
    /** Seconds between two hits on the same enemy. */
    hitInterval: number;
    /** Seconds one trigger press keeps the balls spun up. */
    sustain: number;
    /** Ramp-out and ramp-back times, in seconds. */
    expandTime: number;
    contractTime: number;
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
  /**
   * Escort funnels: autonomous drones that fly toward nearby enemies, hold a
   * clear firing position, and shoot on their own. The trigger does nothing;
   * the drones are invulnerable and are never enemy targets. Their shots have
   * no range cap and only stop on a hit or at the room wall.
   */
  funnel?: {
    /** Drones kept with the player. */
    count: number;
    /** Radius and angular spread of the idle escort formation behind the player. */
    escortRadius: number;
    escortSpread: number;
    /** Preferred firing distance from the target. */
    standoff: number;
    /** Inside this band a drone with a clear shot stops and holds. */
    minStandoff: number;
    maxStandoff: number;
    /** Seconds it holds still before the first shot from a new firing spot. */
    braceTime: number;
    /** Seconds it holds still after every shot. */
    recoverTime: number;
    /** Maximum distance from the player a drone will chase. */
    leash: number;
    /** Drone flight speed, in px/s. */
    droneSpeed: number;
    /** Aim turn rate, rad/s. */
    turnRate: number;
    /** Longest target lead, in seconds. */
    leadTime: number;
    /** Angle between adjacent firing slots around one target, radians. */
    slotArc: number;
  };
}

export const ALL_WEAPONS: WeaponId[] = [
  'pulse',
  'storm',
  'laser',
  'carom',
  'orbit',
  'fission',
  'summoner',
  'recycler',
  'bomber',
  'smg',
  'scatter',
  'rail',
  'seeker',
  'flamer',
  'arc',
  'shock',
  'ortho',
  'volley',
  'parabola',
  'funnel',
];

/**
 * What a dungeon run carries, in cycle order. This is a run loadout, not a
 * property of the weapon: every gun in ALL_WEAPONS is finished and usable, and
 * the test room can pick any of them.
 *
 * It starts with just the pulse rifle. When a new gun lands, append it here so
 * it can be tried in the dungeon; when the player asks to carry only the first
 * gun again, trim the list back to ['pulse'].
 */
export const DUNGEON_LOADOUT: WeaponId[] = [
  'pulse',
  'ortho',
  'volley',
  'parabola',
  'funnel',
];

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
      chargeTime: 3,
      maxMultiplier: 5,
      minWidth: 3,
      maxWidth: 32,
    },
  },
  // Ricochet ring: ten shots evenly around the player, one of them on the aim
  // heading (the locked enemy, or the move direction when nothing is locked).
  // Shots bounce off room walls up to five times, then break on the next wall.
  carom: {
    id: 'carom',
    name: '跳弹枪',
    tag: 'CAROM',
    color: '#7fb2ff',
    damage: 2,
    cooldown: 0.4,
    speed: 900,
    radius: 4,
    life: 4.5,
    pellets: 10,
    spread: 0,
    pierce: 0,
    ring: true,
    bounces: 5,
  },
  // Orbiting guards: three balls circle the player at about one body's width,
  // then spin out to the seeker's 240px reach while the trigger is held (or for
  // one second after a tap). They hit enemies and erase enemy bullets.
  orbit: {
    id: 'orbit',
    name: '轨道球',
    tag: 'ORBIT',
    color: '#c9a2ff',
    damage: 6,
    cooldown: 0,
    speed: 0,
    radius: 0,
    life: 0,
    pellets: 1,
    spread: 0,
    pierce: 0,
    orbit: {
      count: 3,
      idleRadius: 60,
      maxRadius: SHORT_RANGE,
      idleSpeed: 1.1,
      activeSpeed: 4.2,
      ballRadius: 10,
      hitInterval: 0.28,
      sustain: 1,
      expandTime: 0.55,
      contractTime: 0.7,
    },
  },
  // Fission shell: lands on an enemy or wall, then bursts into ten children
  // spread evenly around the shell's own heading — never aimed at anything.
  fission: {
    id: 'fission',
    name: '裂变炮',
    tag: 'FISSION',
    color: '#ff6b4a',
    damage: 10,
    cooldown: 0.6,
    speed: 980,
    radius: 6,
    life: 1.3,
    pellets: 1,
    spread: 0,
    pierce: 0,
    split: {
      count: 10,
      childDamage: 1.5,
      childSpeed: 720,
      childLife: 0.65,
      childRadius: 3.2,
    },
  },
  // Hive gun: weak, steady hits that build up to turrets. Every third hit on
  // the same enemy (or any kill) plants a sentry one body away from the enemy.
  summoner: {
    id: 'summoner',
    name: '蜂巢枪',
    tag: 'HIVE',
    color: '#ffc94d',
    damage: 5,
    cooldown: 0.5,
    speed: 1000,
    radius: 4,
    life: 1.15,
    pellets: 1,
    spread: 0,
    pierce: 0,
    summon: true,
  },
  // Salvage cannon: one locking bolt per shot, no range cap. The bolt flies
  // home after hitting its mark, so the next shot waits for the whole round
  // trip: far targets fire slowly and close ones fast. The 0.24s cooldown is
  // the floor that keeps point-blank shots sane.
  recycler: {
    id: 'recycler',
    name: '回收炮',
    tag: 'SALVAGE',
    color: '#8dff6b',
    damage: 12,
    cooldown: 0.24,
    speed: 1600,
    radius: 5,
    life: 2.5,
    pellets: 1,
    spread: 0,
    pierce: 0,
    homing: true,
    turnRate: 14,
    recycle: true,
  },
  // Carpet bomber: one call-in per trigger pull. The plane follows the player→
  // lock line from behind the player out the far side of the room, dropping
  // bombs that blast and leave short-lived burning rings on the floor.
  bomber: {
    id: 'bomber',
    name: '地毯轰炸',
    tag: 'CARPET',
    color: '#ff9f1c',
    damage: 0,
    cooldown: 6.5,
    speed: 0,
    radius: 0,
    life: 0,
    pellets: 1,
    spread: 0,
    pierce: 0,
    bomber: {
      callIn: 0.55,
      planeSpeed: 540,
      margin: 170,
      dropInterval: 0.22,
      spread: 40,
      fuse: 0.16,
      blastRadius: 95,
      blastDamage: 8,
      ringRadius: 80,
      ringLife: 3,
      ringTickInterval: 0.5,
      ringTickDamage: 2.5,
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
  // Orthogonal cannon: an SMG-paced gun whose hull locks to the four cardinal
  // axes. The aim prefers an axis with a hittable enemy, then snaps the nearest
  // enemy's angle to the closest axis, then snaps the movement direction when
  // nothing is in sight.
  ortho: {
    id: 'ortho',
    name: '正交炮',
    tag: 'ORTHO',
    color: '#e6f6ff',
    damage: 1.3,
    cooldown: 0.06,
    speed: 1200,
    radius: 3,
    life: 0.95,
    pellets: 1,
    spread: 0,
    pierce: 0,
    cardinal: true,
  },
  // Volley gun: a slow SMG whose release after a held burst launches three
  // homing missiles. Each missile locks the nearest enemy and pops a small
  // blast where it lands, so a finished burst clears the space around the
  // target even when the target itself dies first.
  volley: {
    id: 'volley',
    name: '连射追踪炮',
    tag: 'VOLLEY',
    color: '#ff9ecb',
    damage: 1.3,
    cooldown: 0.2,
    speed: 1200,
    radius: 3,
    life: 0.95,
    pellets: 1,
    spread: 0.075,
    pierce: 0,
    volley: {
      shots: 3,
      missiles: 3,
      missileDamage: 6,
      missileSpeed: 700,
      // 5 rad/s at 700 px/s: a visible arc, but tight enough for the 120° fan
      // to pull the outer missiles back onto the target instead of looping.
      missileTurnRate: 5,
      missileRadius: 4,
      blastRadius: 48,
      blastDamage: 5,
    },
  },
  // Parabola gun: SMG rounds that drop a lobbed item every five enemy hits.
  // The item is kicked away from the player and then pulled back by a fixed
  // acceleration, so its path is a visible arc.
  parabola: {
    id: 'parabola',
    name: '抛物枪',
    tag: 'LOB',
    color: '#ffd479',
    damage: 1.3,
    cooldown: 0.06,
    speed: 1200,
    radius: 3,
    life: 0.95,
    pellets: 1,
    spread: 0.075,
    pierce: 0,
    dropEvery: 5,
  },
  // Escort funnels: two drones trail the player, fly out to a clear firing
  // spot near an enemy, and keep shooting on their own. The trigger is not
  // used; the drones are invulnerable and enemy fire ignores them. Their
  // shots never expire by range, so a long sight line is a valid firing line.
  funnel: {
    id: 'funnel',
    name: '浮游炮',
    tag: 'FUNNEL',
    color: '#c7b3ff',
    damage: 4,
    cooldown: 0.55,
    speed: 1000,
    radius: 3,
    life: 1.4,
    pellets: 1,
    spread: 0,
    pierce: 0,
    funnel: {
      count: 2,
      escortRadius: 58,
      escortSpread: 0.6,
      standoff: 210,
      minStandoff: 120,
      maxStandoff: 260,
      braceTime: 0.2,
      recoverTime: 0.28,
      leash: 460,
      droneSpeed: 380,
      turnRate: 11,
      leadTime: 0.18,
      slotArc: 0.9,
    },
  },
};

export function previousWeapon(
  current: WeaponId,
  order: WeaponId[] = ALL_WEAPONS,
): WeaponId {
  const index = order.indexOf(current);
  if (index < 0) return current;
  return order[(index - 1 + order.length) % order.length];
}

export function nextWeapon(
  current: WeaponId,
  order: WeaponId[] = ALL_WEAPONS,
): WeaponId {
  const index = order.indexOf(current);
  if (index < 0) return current;
  return order[(index + 1) % order.length];
}
