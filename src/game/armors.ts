import type { ArmorId } from './types';

export interface ArmorSpec {
  id: ArmorId;
  name: string;
  tag: string;
  color: string;
  /** Shield points this armor adds on top of the hull. */
  shield: number;
  /** Damage taken recharges nothing until this many seconds have passed. */
  regenDelay: number;
  /** Shield points restored per second once the delay is over. */
  regenRate: number;
  /**
   * Orbiting deflector arc. It turns to face the nearest hostile projectile —
   * enemy bullet, homing missile or lobbed shell — and erases anything it
   * touches. The first break freezes its steering for `lockTime` seconds;
   * continued breaks while frozen do not extend that window. The arc still
   * erases shots while frozen, it just cannot turn.
   */
  orb?: {
    /** Distance of the arc from the hull centre, in world px. */
    orbitRadius: number;
    /** Half-angle of the arc, in radians. */
    halfAngle: number;
    /** Radial thickness used for hit tests and drawing. */
    width: number;
    /** Steering rate, in rad/s. */
    turnRate: number;
    /** Seconds the arc cannot turn after it breaks a bullet. */
    lockTime: number;
    /** How far away the nearest bullet is still worth tracking. */
    scanRadius: number;
  };
  /**
   * Slow-field aura. It never erases anything: every hostile projectile
   * inside the radius keeps only `factor` of its normal speed, so incoming
   * fire crawls through the ring and gives the player time to step aside.
   * The field is centred on the hull and moves with it.
   */
  field?: {
    /** Radius of the aura, in world px. */
    radius: number;
    /** Speed a projectile keeps inside the field, as a 0..1 fraction. */
    factor: number;
  };
}

/**
 * The armor slot: exactly one armor can be equipped at a time (`Player.armor`
 * holds a single id). Each armor owns its shield pool and its own recharge
 * numbers, so tuning one never leaks into another.
 */
export const ARMORS: Record<ArmorId, ArmorSpec> = {
  shield: {
    id: 'shield',
    name: '护盾装甲',
    tag: 'SHIELD',
    color: '#7fd8ff',
    shield: 60,
    regenDelay: 2,
    regenRate: 7.5,
  },
  // Orbiting deflector: no HP pool at all. It turns to face the nearest
  // bullet, sweeps it away, then spends two seconds stuck in place (still a
  // wall, just not a smart one).
  deflector: {
    id: 'deflector',
    name: '偏转装甲',
    tag: 'DEFLECT',
    color: '#9df6ff',
    shield: 0,
    regenDelay: 0,
    regenRate: 0,
    orb: {
      orbitRadius: 52,
      halfAngle: 0.55,
      width: 12,
      turnRate: 12,
      lockTime: 2,
      scanRadius: 320,
    },
  },
  // No shield pool at all: the field only buys time. Melee enemies ignore it,
  // so it trades raw defence for reaction time against shooters.
  slowfield: {
    id: 'slowfield',
    name: '减速场装甲',
    tag: 'SLOWFIELD',
    color: '#b0a4ff',
    shield: 0,
    regenDelay: 0,
    regenRate: 0,
    field: {
      radius: 150,
      factor: 0.35,
    },
  },
};

export const ALL_ARMORS: ArmorId[] = ['shield', 'deflector', 'slowfield'];

/** What a dungeon run wears. There is no armor cycle: one slot, one pick. */
export const DUNGEON_ARMOR: ArmorId = 'shield';

export function armorOf(id: ArmorId | undefined): ArmorSpec {
  return ARMORS[id ?? DUNGEON_ARMOR] ?? ARMORS[DUNGEON_ARMOR];
}
