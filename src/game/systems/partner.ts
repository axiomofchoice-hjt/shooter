/** Single autonomous partner drone: same flight/fire AI as a funnel, but it
 * has HP, pulls enemy attacks, and redeploys after being destroyed. */

import type { Enemy, Turret } from '../core/entities';
import { TAU, angleDelta, clamp, dist, rand } from '../core/math';
import type { GameWorld } from '../core/world';
import { WEAPONS, type FunnelSpec, type WeaponSpec } from '../weapons';
import { spawnBurst } from './fx';
import { roomBounds } from './world';

type PartnerSpec = NonNullable<WeaponSpec['partner']>;

const MARGIN = 18;

export function findPartner(world: GameWorld): Turret | null {
  return world.turrets.find((turret) => turret.partner) ?? null;
}

export function removePartner(world: GameWorld) {
  for (let i = world.turrets.length - 1; i >= 0; i--) {
    if (world.turrets[i].partner) world.turrets.splice(i, 1);
  }
}

export function updatePartner(world: GameWorld, dt: number) {
  const weapon = WEAPONS[world.player.weapon];
  const spec = weapon.partner;
  if (!spec || world.player.dead) {
    removePartner(world);
    world.partnerRespawn = 0;
    return;
  }

  const partner = findPartner(world);
  if (!partner) {
    if (world.partnerRespawn > 0) {
      world.partnerRespawn = Math.max(0, world.partnerRespawn - dt);
      return;
    }
    spawnPartner(world, weapon, spec);
    return;
  }

  partner.cooldown = Math.max(0, partner.cooldown - dt);
  partner.muzzle = Math.max(0, partner.muzzle - dt);
  partner.hitFlash = Math.max(0, partner.hitFlash - dt);
  const brain = partner.partner;
  if (!brain) return;
  brain.timer = Math.max(0, brain.timer - dt);

  let target = currentTarget(world, brain.targetId);
  if (!target) {
    target = pickTarget(world, partner);
    brain.targetId = target ? target.id : null;
  }

  movePartner(world, partner, target, spec, dt);
  aimPartner(world, partner, target, dt, weapon, spec);

  if (target) {
    if (brain.phase === 'brace' && brain.timer <= 0) {
      if (firePartner(world, partner, target, weapon, spec)) {
        brain.phase = 'recover';
        brain.timer = spec.recoverTime;
      }
    } else if (brain.phase === 'ready') {
      if (firePartner(world, partner, target, weapon, spec)) {
        brain.phase = 'recover';
        brain.timer = spec.recoverTime;
      }
    }
  }
}

function spawnPartner(world: GameWorld, weapon: WeaponSpec, spec: PartnerSpec) {
  const player = world.player;
  const bounds = roomBounds(world);
  const angle = escortAngle(world);
  const x = clamp(
    player.x + Math.cos(angle) * spec.escortRadius,
    bounds.left + MARGIN,
    bounds.right - MARGIN,
  );
  const y = clamp(
    player.y + Math.sin(angle) * spec.escortRadius,
    bounds.top + MARGIN,
    bounds.bottom - MARGIN,
  );
  world.turrets.push({
    id: world.nextTurretId++,
    x,
    y,
    angle,
    hp: spec.hp,
    maxHp: spec.hp,
    hitFlash: 0,
    cooldown: 0.25,
    life: Infinity,
    maxLife: Infinity,
    muzzle: 0,
    color: weapon.color,
    seed: rand(0, TAU),
    partner: {
      vx: 0,
      vy: 0,
      targetId: null,
      phase: 'chase',
      timer: 0,
    },
  });
  spawnBurst(world, x, y, weapon.color, 8, 120, 0.3);
}

function movePartner(
  world: GameWorld,
  partner: Turret,
  target: Enemy | null,
  spec: PartnerSpec,
  dt: number,
) {
  const brain = partner.partner;
  if (!brain) return;
  const player = world.player;
  const bounds = roomBounds(world);
  const targetDistance = target
    ? dist(partner.x, partner.y, target.x, target.y)
    : Infinity;
  const clear = target ? hasClearShot(world, partner, target) : false;
  const settleMin = spec.minStandoff + 10;
  const settleMax = spec.standoff + 20;
  const stayMin = spec.minStandoff - 30;
  const stayMax = spec.maxStandoff + 80;

  let desiredX = partner.x;
  let desiredY = partner.y;
  let moving = false;

  if (!target) {
    if (
      (brain.phase === 'brace' || brain.phase === 'recover') &&
      brain.timer > 0
    ) {
      // Finish a committed window even if the target dies.
    } else {
      brain.phase = 'chase';
      const angle = escortAngle(world);
      desiredX = player.x + Math.cos(angle) * spec.escortRadius;
      desiredY = player.y + Math.sin(angle) * spec.escortRadius;
      moving = true;
    }
  } else if (brain.phase === 'chase') {
    if (clear && targetDistance >= settleMin && targetDistance <= settleMax) {
      brain.phase = 'brace';
      brain.timer = spec.braceTime;
    } else {
      const angle = firingAngle(world, partner, target);
      desiredX = target.x + Math.cos(angle) * spec.standoff;
      desiredY = target.y + Math.sin(angle) * spec.standoff;
      moving = true;
    }
  } else if (brain.phase === 'recover') {
    if (brain.timer <= 0) brain.phase = 'ready';
  } else if (brain.phase === 'ready') {
    if (clear && targetDistance >= stayMin && targetDistance <= stayMax) {
      // Hold this spot and keep firing.
    } else {
      brain.phase = 'chase';
      const angle = firingAngle(world, partner, target);
      desiredX = target.x + Math.cos(angle) * spec.standoff;
      desiredY = target.y + Math.sin(angle) * spec.standoff;
      moving = true;
    }
  }

  if (moving) {
    desiredX = clamp(desiredX, bounds.left + MARGIN, bounds.right - MARGIN);
    desiredY = clamp(desiredY, bounds.top + MARGIN, bounds.bottom - MARGIN);
    if (target) {
      const fromTarget = Math.hypot(desiredX - target.x, desiredY - target.y);
      if (fromTarget < spec.minStandoff) {
        const centerX = (bounds.left + bounds.right) / 2;
        const centerY = (bounds.top + bounds.bottom) / 2;
        const away = Math.atan2(centerY - target.y, centerX - target.x);
        desiredX = clamp(
          target.x + Math.cos(away) * spec.standoff,
          bounds.left + MARGIN,
          bounds.right - MARGIN,
        );
        desiredY = clamp(
          target.y + Math.sin(away) * spec.standoff,
          bounds.top + MARGIN,
          bounds.bottom - MARGIN,
        );
      }
    }
    steerTo(partner, desiredX, desiredY, spec, dt);
    partner.x += brain.vx * dt;
    partner.y += brain.vy * dt;
    confinePartner(partner, bounds);
  } else {
    brain.vx = 0;
    brain.vy = 0;
  }
}

function escortAngle(world: GameWorld) {
  const player = world.player;
  const moving = Math.hypot(player.vx, player.vy) > 40;
  const base = moving ? Math.atan2(player.vy, player.vx) : player.angle;
  return base + Math.PI;
}

function firingAngle(
  world: GameWorld,
  partner: Turret,
  target: Enemy,
) {
  const player = world.player;
  if (dist(player.x, player.y, target.x, target.y) < 32) {
    return Math.atan2(partner.y - target.y, partner.x - target.x);
  }
  return Math.atan2(player.y - target.y, player.x - target.x);
}

function currentTarget(world: GameWorld, id: number | null) {
  if (id === null) return null;
  const enemy = world.enemies.find((candidate) => candidate.id === id) ?? null;
  return enemy && isTargetable(world, enemy) ? enemy : null;
}

function isTargetable(world: GameWorld, enemy: Enemy) {
  if (enemy.dead) return false;
  return inRoom(world, enemy.x, enemy.y);
}

function pickTarget(world: GameWorld, partner: Turret): Enemy | null {
  let best: Enemy | null = null;
  let bestDistance = Infinity;
  for (const enemy of world.enemies) {
    if (!isTargetable(world, enemy)) continue;
    const distance = dist(partner.x, partner.y, enemy.x, enemy.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = enemy;
    }
  }
  return best;
}

function inRoom(world: GameWorld, x: number, y: number) {
  const bounds = roomBounds(world);
  return (
    x >= bounds.left &&
    x <= bounds.right &&
    y >= bounds.top &&
    y <= bounds.bottom
  );
}

function hasClearShot(world: GameWorld, partner: Turret, target: Enemy) {
  return inRoom(world, partner.x, partner.y) && inRoom(world, target.x, target.y);
}

function steerTo(
  partner: Turret,
  tx: number,
  ty: number,
  spec: FunnelSpec,
  dt: number,
) {
  const brain = partner.partner;
  if (!brain) return;
  const dx = tx - partner.x;
  const dy = ty - partner.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) {
    brain.vx = 0;
    brain.vy = 0;
    return;
  }
  const speed = Math.min(spec.droneSpeed, distance / Math.max(dt, 0.001));
  brain.vx = (dx / distance) * speed;
  brain.vy = (dy / distance) * speed;
}

function confinePartner(
  partner: Turret,
  bounds: ReturnType<typeof roomBounds>,
) {
  const brain = partner.partner;
  if (!brain) return;
  if (partner.x < bounds.left + MARGIN) {
    partner.x = bounds.left + MARGIN;
    brain.vx = Math.max(0, brain.vx);
  } else if (partner.x > bounds.right - MARGIN) {
    partner.x = bounds.right - MARGIN;
    brain.vx = Math.min(0, brain.vx);
  }
  if (partner.y < bounds.top + MARGIN) {
    partner.y = bounds.top + MARGIN;
    brain.vy = Math.max(0, brain.vy);
  } else if (partner.y > bounds.bottom - MARGIN) {
    partner.y = bounds.bottom - MARGIN;
    brain.vy = Math.min(0, brain.vy);
  }
}

function aimPartner(
  world: GameWorld,
  partner: Turret,
  target: Enemy | null,
  dt: number,
  weapon: WeaponSpec,
  spec: FunnelSpec,
) {
  const brain = partner.partner;
  if (!brain) return;
  let want = partner.angle;
  if (target) {
    const lead = Math.min(
      spec.leadTime,
      dist(partner.x, partner.y, target.x, target.y) / weapon.speed,
    );
    want = Math.atan2(
      target.y + target.vy * lead - partner.y,
      target.x + target.vx * lead - partner.x,
    );
  } else {
    const speed = Math.hypot(brain.vx, brain.vy);
    if (speed > 30) {
      want = Math.atan2(brain.vy, brain.vx);
    } else {
      want = world.player.angle;
    }
  }
  const maxTurn = spec.turnRate * dt;
  partner.angle += clamp(angleDelta(partner.angle, want), -maxTurn, maxTurn);
}

function firePartner(
  world: GameWorld,
  partner: Turret,
  target: Enemy,
  weapon: WeaponSpec,
  spec: FunnelSpec,
): boolean {
  if (partner.cooldown > 0) return false;
  if (!hasClearShot(world, partner, target)) return false;

  const distance = dist(partner.x, partner.y, target.x, target.y);
  const lead = Math.min(spec.leadTime, distance / weapon.speed);
  const aimX = target.x + target.vx * lead;
  const aimY = target.y + target.vy * lead;
  const want = Math.atan2(aimY - partner.y, aimX - partner.x);
  if (Math.abs(angleDelta(partner.angle, want)) > 0.2) return false;

  partner.cooldown = weapon.cooldown;
  partner.muzzle = 0.08;
  const x = partner.x + Math.cos(partner.angle) * 12;
  const y = partner.y + Math.sin(partner.angle) * 12;
  world.bullets.push({
    x,
    y,
    prevX: x,
    prevY: y,
    vx: Math.cos(want) * weapon.speed,
    vy: Math.sin(want) * weapon.speed,
    radius: weapon.radius,
    damage: weapon.damage,
    life: Infinity,
    color: weapon.color,
    pierce: 0,
    hitIds: [],
  });
  world.sfx.play('funnel');
  spawnBurst(world, x, y, weapon.color, 2, 55, 0.16);
  return true;
}
