/** Main-weapon firing, lasers, arcs and missiles. */

import { AUTOAIM_RANGE } from '../core/config';
import type { Enemy } from '../core/entities';
import { TAU, clamp, dist, rand } from '../core/math';
import type { GameWorld } from '../core/world';
import type { WeaponSpec } from '../weapons';
import { TURRET, WEAPONS } from '../weapons';
import { knockbackResistance } from './combat';
import { damageEnemy } from './damage';
import { spawnBurst } from './fx';
import { launchBomber, spawnStormDart } from './weaponItems';
import { findNearestEnemy, outOfRoom, roomBounds } from './world';

export function firePlayerBullet(world: GameWorld) {
  const player = world.player;
  const weapon = WEAPONS[player.weapon];
  // The bomber's long recharge lives on its own timer so switching guns
  // after a call-in does not leave the player unable to shoot for 6.5s.
  player.fireCooldown = weapon.bomber ? 0.25 : weapon.cooldown;
  if (weapon.bomber) world.bomberCooldown = weapon.cooldown;
  player.muzzle =
    weapon.pellets > 1 || weapon.id === 'rail' || weapon.laser || weapon.ram
      ? 0.12
      : 0.06;
  player.muzzleColor = weapon.color;
  if (weapon.volley) world.volleyShots += 1;

  const offset = 26;
  fireWeapon(world, weapon, offset);
  spawnMuzzleParticles(world, weapon, offset);
  world.shake = Math.max(world.shake, shotShake(weapon));
  world.sfx.play(shotSound(weapon));
}

/** Special weapons resolve immediately; everything else spawns bullets. */
function fireWeapon(world: GameWorld, weapon: WeaponSpec, offset: number) {
  if (weapon.ram) {
    fireRam(world, weapon);
  } else if (weapon.bomber) {
    launchBomber(world, weapon);
  } else if (weapon.laser) {
    fireLaser(world, weapon);
  } else if (weapon.storm) {
    spawnStormDart(world, weapon);
  } else if (weapon.chain) {
    fireArc(world, weapon);
  } else {
    spawnStandardBullets(world, weapon, offset);
  }
}

function spawnStandardBullets(
  world: GameWorld,
  weapon: WeaponSpec,
  offset: number,
) {
  const player = world.player;
  for (let i = 0; i < weapon.pellets; i++) {
    if (weapon.recycle) {
      spawnRecycleBolt(world, weapon, offset);
      continue;
    }
    if (weapon.homing) {
      spawnMissile(world, weapon, offset);
      continue;
    }
    const fan =
      weapon.pellets > 1
        ? (i / (weapon.pellets - 1) - 0.5) * weapon.spread
        : 0;
    const jitter =
      weapon.pellets > 1 ? weapon.spread * 0.08 : weapon.spread / 2;
    const angle = weapon.ring
      ? player.angle + (i / weapon.pellets) * TAU
      : player.angle + fan + rand(-jitter, jitter);
    const x = player.x + Math.cos(angle) * offset;
    const y = player.y + Math.sin(angle) * offset;
    world.bullets.push({
      x,
      y,
      prevX: x,
      prevY: y,
      vx: Math.cos(angle) * weapon.speed,
      vy: Math.sin(angle) * weapon.speed,
      radius: weapon.radius,
      damage: weapon.damage,
      life: weapon.life,
      color: weapon.color,
      pierce: weapon.pierce,
      hitIds: [],
      shock: weapon.shock
        ? {
            blastRadius: weapon.shock.blastRadius,
            damage: weapon.damage,
            knockback: weapon.shock.knockback,
          }
        : undefined,
      bounce: weapon.bounces ? { left: weapon.bounces } : undefined,
      split: weapon.split
        ? {
            count: weapon.split.count,
            damage: weapon.split.childDamage,
            speed: weapon.split.childSpeed,
            life: weapon.split.childLife,
            radius: weapon.split.childRadius,
          }
        : undefined,
      summonEvery: weapon.summon ? TURRET.hitsPerSummon : undefined,
    });
  }
}

function spawnMuzzleParticles(
  world: GameWorld,
  weapon: WeaponSpec,
  offset: number,
) {
  const player = world.player;
  const muzzleCount = weapon.ram
    ? 12
    : weapon.laser
      ? 10
      : weapon.storm
        ? 6
        : weapon.chain
          ? 8
          : weapon.pellets > 1
            ? 10
            : weapon.id === 'rail'
              ? 12
              : 4;
  for (let i = 0; i < muzzleCount; i++) {
    const spread = player.angle + Math.PI + rand(-0.6, 0.6);
    const velocity = rand(40, weapon.id === 'rail' ? 320 : 150);
    world.particles.push({
      x: player.x + Math.cos(player.angle) * offset + rand(-3, 3),
      y: player.y + Math.sin(player.angle) * offset + rand(-3, 3),
      vx: Math.cos(spread) * velocity,
      vy: Math.sin(spread) * velocity,
      life: rand(0.06, 0.18),
      maxLife: 0.18,
      size: rand(1.5, 3.4),
      color: weapon.color,
      drag: 8,
    });
  }
}

function shotShake(weapon: WeaponSpec) {
  if (weapon.ram) return 5.5;
  if (weapon.id === 'rail') return 4.2;
  if (weapon.laser) return 3;
  if (weapon.storm) return 1.6;
  if (weapon.chain) return 2.2;
  if (weapon.pellets > 1) return 2.6;
  return 0.9;
}

function shotSound(weapon: WeaponSpec) {
  if (weapon.ram) return 'sweep';
  if (weapon.bomber) return 'airstrike';
  if (weapon.laser) return 'laser';
  if (weapon.storm || weapon.chain) return 'arc';
  if (weapon.id === 'rail') return 'rail';
  if (weapon.id === 'scatter') return 'scatter';
  return 'shoot';
}

/**
 * Impact cannon: the hitbox is a rectangle projected from the hull along the
 * aim heading. It is resolved on the trigger — no projectile, so it cannot be
 * dodged by a moving enemy after the shot — and every enemy inside takes the
 * hit and a shove along the same heading.
 */
function fireRam(world: GameWorld, weapon: WeaponSpec) {
  const spec = weapon.ram;
  if (!spec) return;
  const player = world.player;
  const cos = Math.cos(player.angle);
  const sin = Math.sin(player.angle);
  const start = player.radius;
  const reach = start + spec.length;

  world.ramBlasts.push({
    x: player.x + cos * start,
    y: player.y + sin * start,
    angle: player.angle,
    length: spec.length,
    halfWidth: spec.halfWidth,
    life: 0.22,
    maxLife: 0.22,
    color: weapon.color,
  });
  spawnBurst(
    world,
    player.x + cos * (start + 24),
    player.y + sin * (start + 24),
    weapon.color,
    14,
    260,
    0.28,
  );

  let hits = 0;
  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    // Never reach through a wall into the neighbouring room.
    if (outOfRoom(world, enemy.x, enemy.y, 0)) continue;
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const forward = dx * cos + dy * sin;
    if (forward < 0 || forward > reach) continue;
    if (Math.abs(-dx * sin + dy * cos) > spec.halfWidth + enemy.radius) continue;

    hits += 1;
    damageEnemy(world, enemy, weapon.damage, enemy.x, enemy.y, true);
    // The shove is strongest at the muzzle and tapers toward the far edge.
    const falloff = 1 - clamp(forward / reach, 0, 1) * 0.35;
    const push = spec.knockback * falloff * knockbackResistance(enemy);
    enemy.knockX += cos * push;
    enemy.knockY += sin * push;
    spawnBurst(world, enemy.x, enemy.y, weapon.color, 7, 170, 0.3);
  }

  if (hits > 0) {
    world.sfx.play('hit');
    world.shake = Math.max(world.shake, 3 + Math.min(hits, 5) * 1.4);
  }
}

/**
 * Piercing hitscan: one beam through every enemy on the line. The beam grows
 * thicker and stronger with idle charge, but firing at the 0.75s cadence
 * always beats waiting for a full charge in DPS.
 */
function fireLaser(world: GameWorld, weapon: WeaponSpec) {
  const spec = weapon.laser;
  if (!spec) return;
  const player = world.player;
  const charge = clamp(world.laserCharge, 0, 1);
  const multiplier = 1 + (spec.maxMultiplier - 1) * charge;
  const width = spec.minWidth + (spec.maxWidth - spec.minWidth) * charge;
  world.laserCharge = 0;

  const dx = Math.cos(player.angle);
  const dy = Math.sin(player.angle);
  const bounds = roomBounds(world);
  let length = AUTOAIM_RANGE;
  if (dx > 0.00001) length = Math.min(length, (bounds.right - player.x) / dx);
  else if (dx < -0.00001) length = Math.min(length, (bounds.left - player.x) / dx);
  if (dy > 0.00001) length = Math.min(length, (bounds.bottom - player.y) / dy);
  else if (dy < -0.00001) length = Math.min(length, (bounds.top - player.y) / dy);
  length = Math.max(16, length);

  const startX = player.x + dx * 22;
  const startY = player.y + dy * 22;
  const endX = player.x + dx * length;
  const endY = player.y + dy * length;
  world.laserBeams.push({
    x1: startX,
    y1: startY,
    x2: endX,
    y2: endY,
    width,
    life: 0.22,
    maxLife: 0.22,
    color: weapon.color,
    seed: rand(0, 100),
  });
  world.shake = Math.max(world.shake, 1.8 + charge * 4);

  for (const enemy of world.enemies) {
    if (enemy.dead) continue;
    if (outOfRoom(world, enemy.x, enemy.y, 0)) continue;
    const relX = enemy.x - player.x;
    const relY = enemy.y - player.y;
    const along = relX * dx + relY * dy;
    if (along < 0 || along > length + enemy.radius) continue;
    const perpendicular = Math.abs(relX * dy - relY * dx);
    if (perpendicular > width * 0.5 + enemy.radius) continue;
    damageEnemy(world,
      enemy,
      weapon.damage * multiplier,
      enemy.x,
      enemy.y,
      true,
    );
    spawnBurst(world, enemy.x, enemy.y, weapon.color, 9, 180, 0.32);
  }
}

/**
 * Chain lightning: the arc itself has no range cap, so it zaps the nearest
 * visible enemy anywhere. It then jumps to the closest not-yet-hit enemy
 * within the (larger) jump radius. Walls do not stop a jump. Damage falls
 * off with every link.
 */
function fireArc(world: GameWorld, weapon: WeaponSpec) {
  const player = world.player;
  const chain = weapon.chain;
  if (!chain) return;
  let target = findNearestEnemy(world,
    player.x,
    player.y,
    AUTOAIM_RANGE,
    true,
  );
  if (!target) return;

  const hit = new Set<number>();
  const nodes = [{ x: player.x, y: player.y }];
  let damage = weapon.damage;
  for (let i = 0; i < chain.targets && target; i++) {
    hit.add(target.id);
    nodes.push({ x: target.x, y: target.y });
    damageEnemy(world, target, damage, target.x, target.y, true);
    spawnBurst(world, target.x, target.y, weapon.color, 10, 190, 0.3);
    spawnBurst(world, target.x, target.y, '#ffffff', 4, 120, 0.2);
    damage *= chain.falloff;
    target = pickChainTarget(world, target.x, target.y, chain.jumpRange, hit);
  }
  world.arcs.push({
    nodes,
    life: 0.18,
    maxLife: 0.18,
    color: weapon.color,
    seed: rand(0, 100),
  });
}

function pickChainTarget(
  world: GameWorld,
  x: number,
  y: number,
  maxDistance: number,
  exclude: Set<number>,
): Enemy | null {
  let nearest: Enemy | null = null;
  let nearestDist = maxDistance;
  for (const enemy of world.enemies) {
    if (enemy.dead || exclude.has(enemy.id)) continue;
    const d = dist(x, y, enemy.x, enemy.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = enemy;
    }
  }
  return nearest;
}

/**
 * Fires one seeker missile. The target is chosen now and never swapped: on
 * death, damageEnemy rewrites the lock to the death spot, and the missile
 * flies there before fizzling out. With nobody in range it simply flies
 * straight ahead. The launch offset is cosmetic — the steering corrects it.
 */
function spawnMissile(world: GameWorld, weapon: WeaponSpec, offset: number) {
  const player = world.player;
  const range = weapon.range ?? 240;
  const target = findNearestEnemy(world, player.x, player.y, range, false);
  const side = Math.random() < 0.5 ? -1 : 1;
  const lateral = 15 * side;
  // The angled launch only exists to show the homing turn. Without a target
  // there is nothing to correct it, so the shot goes straight forward.
  const launchAngle = target ? player.angle + side * 0.18 : player.angle;
  const x =
    player.x +
    Math.cos(player.angle) * offset +
    Math.cos(player.angle + Math.PI / 2) * lateral;
  const y =
    player.y +
    Math.sin(player.angle) * offset +
    Math.sin(player.angle + Math.PI / 2) * lateral;
  const speed = weapon.speed;
  // Give the curved path a little cushion, but keep the projectile close to
  // the advertised range; a shot with no target ends exactly at that range.
  const life = target
    ? Math.min(
        weapon.life,
        Math.max(0.22, dist(player.x, player.y, target.x, target.y) / speed + 0.04),
      )
    : range / speed;

  world.bullets.push({
    x,
    y,
    prevX: x,
    prevY: y,
    vx: Math.cos(launchAngle) * speed,
    vy: Math.sin(launchAngle) * speed,
    radius: weapon.radius,
    damage: weapon.damage,
    life,
    color: weapon.color,
    pierce: 0,
    hitIds: [],
    trail: [{ x, y }],
    missile: target
      ? {
          targetId: target.id,
          x: target.x,
          y: target.y,
          dead: false,
          angle: launchAngle,
          turnRate: weapon.turnRate ?? 8,
        }
      : undefined,
  });
}

/**
 * Volley gun release: three homing missiles leave in a 120° fan, one every
 * 60°. Each one locks the nearest enemy at this instant (so all three
 * usually share a target) and carries a small blast for the impact. With no
 * enemy the trio flies straight along its fan, keeping the trigger
 * responsive even in an empty room.
 */
export function fireVolleyMissiles(world: GameWorld, weapon: WeaponSpec) {
  const volley = weapon.volley;
  if (!volley) return;
  const player = world.player;
  const target = findNearestEnemy(world, player.x, player.y, AUTOAIM_RANGE, true);
  const speed = volley.missileSpeed;
  const targetDistance = target
    ? dist(player.x, player.y, target.x, target.y)
    : 520;
  const life = target
    ? Math.min(2.6, Math.max(0.5, targetDistance / speed + 0.7))
    : 1.2;

  for (let i = 0; i < volley.missiles; i++) {
    const side = i - (volley.missiles - 1) / 2;
    const lateral = side * 14;
    // Three initial headings 60° apart: left, forward and right, a 120° fan.
    const launchAngle = player.angle + side * (Math.PI / 3);
    const x =
      player.x +
      Math.cos(player.angle) * 26 +
      Math.cos(player.angle + Math.PI / 2) * lateral;
    const y =
      player.y +
      Math.sin(player.angle) * 26 +
      Math.sin(player.angle + Math.PI / 2) * lateral;
    world.bullets.push({
      x,
      y,
      prevX: x,
      prevY: y,
      vx: Math.cos(launchAngle) * speed,
      vy: Math.sin(launchAngle) * speed,
      radius: volley.missileRadius,
      damage: volley.missileDamage,
      life,
      color: weapon.color,
      pierce: 0,
      hitIds: [],
      trail: [{ x, y }],
      missile: target
        ? {
            targetId: target.id,
            x: target.x,
            y: target.y,
            dead: false,
            angle: launchAngle,
            turnRate: volley.missileTurnRate,
          }
        : undefined,
      blast: {
        radius: volley.blastRadius,
        damage: volley.blastDamage,
      },
    });
  }

  player.muzzle = 0.12;
  player.muzzleColor = weapon.color;
  world.shake = Math.max(world.shake, 2.4);
  world.sfx.play('volley');
  spawnBurst(world, player.x, player.y, weapon.color, 12, 150, 0.32);
}

/**
 * Salvage bolt: locks the current auto-target for its outbound leg and flies
 * back to the player once it lands. With nothing to lock it flies straight
 * ahead and comes home after hitting a wall. A locked shot ignores walls,
 * like the seeker; the bolt blocks the next shot for the whole round trip.
 */
function spawnRecycleBolt(world: GameWorld, weapon: WeaponSpec, offset: number) {
  const player = world.player;
  const target = world.autoTarget;
  const angle = target
    ? Math.atan2(target.y - player.y, target.x - player.x)
    : player.angle;
  const speed = weapon.speed;
  const x = player.x + Math.cos(angle) * offset;
  const y = player.y + Math.sin(angle) * offset;

  world.bullets.push({
    x,
    y,
    prevX: x,
    prevY: y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: weapon.radius,
    damage: weapon.damage,
    life: weapon.life,
    color: weapon.color,
    pierce: 0,
    hitIds: [],
    trail: [{ x, y }],
    recycle: true,
    returning: false,
    missile: target
      ? {
          targetId: target.id,
          x: target.x,
          y: target.y,
          dead: false,
          angle,
          turnRate: weapon.turnRate ?? 14,
        }
      : undefined,
  });
}

