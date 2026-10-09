// sim/movement.js — step(): advance along path, separation nudge, arrival, stuck watchdog (architecture §3.4/§3.5)

import { add, sub, scale, len, dist, normalize } from './vec2.js';

export const ARRIVAL_THRESHOLD = 0.15;
export const SEPARATION_RADIUS = 0.8;
export const SEPARATION_SPEED = 1.5; // world units/sec max separation-correction speed (capped, never overpowers movement)
export const STUCK_TIME = 0.5; // architecture §3.5 progress watchdog

// A unit is driven along `path` whenever one exists, regardless of `state`.
// This lets combat.js reuse the same stepping logic while a unit chases a
// target into range (state stays 'attacking') without duplicating movement
// code (architecture §4.5 "reuse orders, don't write bespoke movement").
function arrive(unit) {
  unit.path = null;
  unit.pathIndex = 0;
  unit.moveGoal = null;
  unit.stuckTimer = 0;
  unit.lastDistToWaypoint = Infinity;
  if (!unit.attackTargetId) {
    unit.state = 'idle';
  }
}

function advanceWaypoint(unit) {
  unit.pathIndex += 1;
  unit.stuckTimer = 0;
  unit.lastDistToWaypoint = Infinity;
  if (unit.pathIndex >= unit.path.length) {
    arrive(unit);
  }
}

function moveAlongPath(unit, DT) {
  const wp = unit.path[unit.pathIndex];
  const d = dist(unit.pos, wp);

  // Progress watchdog (architecture §3.5): if distance to the current
  // waypoint hasn't decreased for ~0.5s, advance to the next waypoint (or
  // arrive, if this was the last one) rather than spinning forever.
  if (d < unit.lastDistToWaypoint - 1e-6) {
    unit.lastDistToWaypoint = d;
    unit.stuckTimer = 0;
  } else {
    unit.stuckTimer += DT;
  }

  if (unit.stuckTimer >= STUCK_TIME) {
    advanceWaypoint(unit);
    return;
  }

  if (d <= ARRIVAL_THRESHOLD) {
    advanceWaypoint(unit);
    return;
  }

  const step = Math.min(unit.speed * DT, d);
  const dir = scale(sub(wp, unit.pos), 1 / d);
  unit.pos = add(unit.pos, scale(dir, step));
}

function addPush(map, id, vec) {
  const existing = map.get(id);
  map.set(id, existing ? add(existing, vec) : vec);
}

// Soft separation steering (architecture §3.4): units are invisible to the
// pathfinder, so overlap is corrected here with a gentle, capped push-apart
// nudge rather than collision or dynamic replanning.
function applySeparation(units, DT) {
  const pushes = new Map();

  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i];
      const b = units[j];
      const d = dist(a.pos, b.pos);
      if (d > 0 && d < SEPARATION_RADIUS) {
        const dir = normalize(sub(a.pos, b.pos));
        const half = (SEPARATION_RADIUS - d) * 0.5;
        addPush(pushes, a.id, scale(dir, half));
        addPush(pushes, b.id, scale(dir, -half));
      }
    }
  }

  const maxStep = SEPARATION_SPEED * DT;
  for (const unit of units) {
    const push = pushes.get(unit.id);
    if (!push) continue;
    const pushLen = len(push);
    const capped = pushLen > maxStep ? scale(push, maxStep / pushLen) : push;
    unit.pos = add(unit.pos, capped);
  }
}

export function step(world, DT) {
  const units = [...world.units.values()].filter((u) => u.hp > 0);

  for (const unit of units) {
    if (unit.path && unit.path.length > 0 && unit.pathIndex < unit.path.length) {
      moveAlongPath(unit, DT);
    }
  }

  applySeparation(units, DT);
}

export default { step };
