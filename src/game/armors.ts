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
};

export const ALL_ARMORS: ArmorId[] = ['shield'];

/** What a dungeon run wears. There is no armor cycle: one slot, one pick. */
export const DUNGEON_ARMOR: ArmorId = 'shield';

export function armorOf(id: ArmorId | undefined): ArmorSpec {
  return ARMORS[id ?? DUNGEON_ARMOR] ?? ARMORS[DUNGEON_ARMOR];
}
