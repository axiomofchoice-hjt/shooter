/** Player healing, including the overflow armor's max-HP conversion. */

import { armorOf } from '../armors';
import type { GameWorld } from '../core/world';
import { spawnBurst } from './fx';

export interface HealResult {
  /** HP actually restored to the hull. */
  healed: number;
  /** Extra max HP banked from the overflow (whole points). */
  bonus: number;
}

/**
 * Restores hull HP. Healing past the current maximum is normally discarded;
 * the overflow armor converts half of that spill into extra max HP and adds
 * the same amount to the current HP, so the bar stays full instead of opening
 * a gap the moment the hull grows.
 */
export function healPlayer(world: GameWorld, amount: number): HealResult {
  const player = world.player;
  if (player.dead || amount <= 0) return { healed: 0, bonus: 0 };
  const missing = Math.max(0, player.maxHp - player.hp);
  const healed = Math.min(amount, missing);
  player.hp = Math.min(player.maxHp, player.hp + amount);

  const armor = armorOf(player.armor);
  const ratio = armor.overheal?.ratio ?? 0;
  const overflow = amount - healed;
  if (overflow <= 0 || ratio <= 0) return { healed, bonus: 0 };

  // Whole points only: half of a spill is often fractional, and the HUD would
  // otherwise show a max like 112.5.
  const bonus = Math.floor(overflow * ratio);
  if (bonus <= 0) return { healed, bonus: 0 };

  player.maxHp += bonus;
  player.hp += bonus;
  player.healBonus += bonus;
  world.healFlash = 1;
  world.floaters.push({
    x: player.x,
    y: player.y - 52,
    text: `MAX +${bonus}`,
    color: armor.color,
    life: 1.1,
    maxLife: 1.1,
    size: 16,
  });
  spawnBurst(world, player.x, player.y, armor.color, 12, 150, 0.5);
  return { healed, bonus };
}
