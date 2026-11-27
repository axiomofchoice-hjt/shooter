/** Armor behaviours that live outside the hull: the orbiting deflector. */

import { armorOf } from '../armors';
import type { ArmorSpec } from '../armors';
import { angleDelta, clamp } from '../core/math';
import type { GameWorld } from '../core/world';
import { spawnBurst } from './fx';

type ThreatKind = 'bullet' | 'shell' | 'homing';

interface Threat {
  kind: ThreatKind;
  index: number;
  x: number;
  y: number;
}

/**
 * Deflector armor: a shield arc hangs near the hull. It points straight at the
 * nearest hostile projectile — the arc parks between the hull and that shot —
 * and turns fast enough to catch most of them. It erases enemy bullets,
 * homing missiles and lobbed shells alike. Breaking a shot freezes its
 * steering for `lockTime` seconds; a frozen arc still erases anything that
 * touches it, it just cannot re-aim.
 */
export function updateArmor(world: GameWorld, dt: number) {
  const player = world.player;
  if (player.dead) return;
  const spec = armorOf(player.armor);
  player.armorFlash = Math.max(0, player.armorFlash - dt * 4);
  player.armorLock = Math.max(0, player.armorLock - dt);

  const orb = spec.orb;
  if (!orb) return;

  // Aim: only the nearest shot in range matters, and the arc simply faces
  // it, so the shield sits between the hull and the incoming shot.
  if (player.armorLock <= 0) {
    const target = nearestThreat(world, orb.scanRadius);
    if (target) {
      const want = Math.atan2(target.y - player.y, target.x - player.x);
      const maxTurn = orb.turnRate * dt;
      player.armorAngle += clamp(angleDelta(player.armorAngle, want), -maxTurn, maxTurn);
    }
  }

  // Block: runs even while the steering is frozen. Each of the three hostile
  // projectile lists is swept separately so a fast shot cannot skip the arc.
  const ready = player.armorLock <= 0;
  let broken = 0;
  broken += sweepList(world, orb, spec, 'bullet');
  broken += sweepList(world, orb, spec, 'shell');
  broken += sweepList(world, orb, spec, 'homing');
  if (broken === 0) return;
  // Only the first break starts the 2s window: continued breaks while frozen
  // do not extend it, or sustained fire would freeze the arc forever.
  if (ready) player.armorLock = orb.lockTime;
  player.armorFlash = 1;
  world.shake = Math.max(world.shake, 1.6);
  if (ready) world.sfx.play('shield');
}

/**
 * Sweeps one projectile list against the arc. Returns how many were erased.
 * The test walks the segment from the shot's previous position to its current
 * one, so a fast projectile (or a slow frame) cannot tunnel between frames.
 */
function sweepList(
  world: GameWorld,
  orb: NonNullable<ArmorSpec['orb']>,
  spec: ArmorSpec,
  kind: ThreatKind,
) {
  const list =
    kind === 'bullet'
      ? world.enemyBullets
      : kind === 'shell'
        ? world.shells
        : world.homings;
  const player = world.player;
  let broken = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const shot = list[i];
    const steps = Math.max(
      1,
      Math.ceil(
        Math.hypot(shot.x - shot.prevX, shot.y - shot.prevY) / 6,
      ),
    );
    let hit = false;
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = shot.prevX + (shot.x - shot.prevX) * t;
      const y = shot.prevY + (shot.y - shot.prevY) * t;
      const dx = x - player.x;
      const dy = y - player.y;
      const distance = Math.hypot(dx, dy);
      if (Math.abs(distance - orb.orbitRadius) > orb.width / 2 + shot.radius) {
        continue;
      }
      const reach = orb.halfAngle + shot.radius / Math.max(1, distance);
      if (Math.abs(angleDelta(player.armorAngle, Math.atan2(dy, dx))) > reach) {
        continue;
      }
      hit = true;
      break;
    }
    if (!hit) continue;
    list.splice(i, 1);
    spawnBurst(world, shot.x, shot.y, spec.color, 4, 120, 0.22);
    broken += 1;
  }
  return broken;
}

/** Closest hostile projectile inside the scan radius. */
function nearestThreat(world: GameWorld, range: number): Threat | null {
  const player = world.player;
  let best: Threat | null = null;
  let bestDistance = range;

  const consider = (kind: ThreatKind, list: Array<{ x: number; y: number }>) => {
    for (let i = 0; i < list.length; i++) {
      const shot = list[i];
      const distance = Math.hypot(shot.x - player.x, shot.y - player.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { kind, index: i, x: shot.x, y: shot.y };
      }
    }
  };

  consider('bullet', world.enemyBullets);
  consider('shell', world.shells);
  consider('homing', world.homings);
  return best;
}
