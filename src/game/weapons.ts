import type { WeaponId } from './types';

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
}

export const WEAPON_ORDER: WeaponId[] = ['pulse', 'smg', 'scatter', 'rail', 'seeker'];

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
    range: 320,
    homing: true,
    turnRate: 9,
  },
};

export function nextWeapon(current: WeaponId): WeaponId {
  const index = WEAPON_ORDER.indexOf(current);
  return WEAPON_ORDER[(index + 1) % WEAPON_ORDER.length];
}
