/** Builds the HUD snapshot for React. */

import { DODGE_COOLDOWN, DUNGEON_ROOMS } from '../core/config';
import { clamp } from '../core/math';
import type { GameWorld } from '../core/world';
import type { EnemyKind, HudSnapshot, TestEnemyKind } from '../types';
import { roomKindAt } from '../types';
import { countCleared } from './world';

// ------------------------------------------------------------------ helpers
export function emitHud(world: GameWorld, force = false) {
  if (!force && world.hudTimer > 0) return;
  const boss = world.boss;
  const bossHp = boss ? Math.max(0, Math.ceil(boss.hp)) : 0;
  // Test-room roster: one pass over the live enemies, then read the counts in
  // the configured order so the HUD names exactly what the player picked.
  const testRoster: { kind: TestEnemyKind; count: number }[] = [];
  if (world.mode === 'test') {
    const counts = new Map<EnemyKind, number>();
    for (const enemy of world.enemies) {
      if (enemy.dead || enemy.kind === 'boss') continue;
      counts.set(enemy.kind, (counts.get(enemy.kind) ?? 0) + 1);
    }
    for (const kind of world.testEnemies) {
      const count = counts.get(kind) ?? 0;
      if (count > 0) testRoster.push({ kind, count });
    }
  }
  const hud: HudSnapshot = {
    mode: world.mode,
    weapon: world.player.weapon,
    hp: Math.ceil(world.player.hp),
    maxHp: world.player.maxHp,
    shield: Math.ceil(world.player.shield),
    shieldMax: world.player.shieldMax,
    armor: world.player.armor,
    armorLock: world.player.armorLock,
    slowCount: world.player.fieldCount,
    maxHpBonus: world.player.healBonus,
    score: world.score,
    floor: world.floor,
    room: world.roomIndex,
    roomKind: roomKindAt(world.roomIndex),
    roomsCleared: countCleared(world),
    enemiesRemaining:
      world.enemies.length +
      world.telegraphs.length +
      world.spawnQueue.length -
      (world.dummy && !world.dummy.dead ? 1 : 0),
    encounterActive: world.encounterActive,
    portalActive: countCleared(world) >= DUNGEON_ROOMS - 2,
    combo: world.combo,
    comboTime: world.comboTimer,
    kills: world.kills,
    muted: world.sfx.muted,
    dodgeCooldown: clamp(world.dodgeCooldown / DODGE_COOLDOWN, 0, 1),
    bossHp,
    bossMaxHp: boss?.maxHp ?? 0,
    bossPhase: boss && boss.hp <= boss.maxHp * 0.5 ? 2 : 1,
    wave: world.testWave,
    testRoster,
    weaponCount: world.weaponPool.length,
    fps: world.fps,
  };
  world.callbacks.onHud(hud);
}
