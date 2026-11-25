import type { TestEnemyKind, WeaponId } from '../types';
import { TEST_ENEMY_KINDS } from '../types';
import { ALL_WEAPONS } from '../weapons';

// The test room can carry any subset of the implemented guns and grunts.
// Filtering through the canonical orders both validates the config and keeps
// the starting weapon / spawn rotation predictable.
export const pickTestWeapons = (list?: WeaponId[]): WeaponId[] => {
  const selected = list ?? [];
  const pool = ALL_WEAPONS.filter((id) => selected.includes(id));
  return pool.length > 0 ? pool : ['pulse'];
};

export const pickTestEnemies = (list?: TestEnemyKind[]): TestEnemyKind[] => {
  const selected = list ?? [];
  const pool = TEST_ENEMY_KINDS.filter((kind) => selected.includes(kind));
  return pool.length > 0 ? pool : ['grunt'];
};
