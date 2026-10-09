// sim/orders.js — issueMove / issueAttack / selectOnly / selectInBox / clearSelection; move-vs-attack resolution (architecture §4.5)

import { nearestWalkable } from './grid.js';
import { aStar, smoothPath } from './pathfinding.js';

function getUnit(world, id) {
  return world.units.get(id);
}

// Shared pathing primitive: snaps the goal to the nearest walkable point,
// runs A*, smooths it, and writes path/pathIndex/moveGoal onto the unit.
// Does NOT touch attackTargetId/state — callers (issueMove, combat.js's
// chase-into-range logic) own that. Returns the snapped goal, or null if
// no path could be found (unit's path fields are cleared in that case).
export function computePath(world, unit, goalPoint) {
  const goal = nearestWalkable(world.grid, goalPoint);
  const cellPath = aStar(world.grid, unit.pos, goal);

  if (!cellPath || cellPath.length === 0) {
    unit.path = null;
    unit.pathIndex = 0;
    unit.moveGoal = null;
    unit.stuckTimer = 0;
    unit.lastDistToWaypoint = Infinity;
    return null;
  }

  const full = [unit.pos, ...cellPath];
  const smoothed = smoothPath(world.grid, full);

  unit.path = smoothed.slice(1); // drop the synthetic "current position" entry
  unit.pathIndex = 0;
  unit.moveGoal = goal;
  unit.stuckTimer = 0;
  unit.lastDistToWaypoint = Infinity;
  return goal;
}

// Decision: a multi-unit move order scatters each unit's target around the
// clicked point on a small ring (architecture §3.4 "jittered arrival") so a
// group spreads into a loose blob instead of fighting over one tile. The
// jitter is applied here (rather than in movement.js) since it only needs to
// affect the pathing goal, not steering.
function jitteredPoint(center, index, count, radius = 0.6) {
  if (count <= 1) return center;
  const angle = (index / count) * Math.PI * 2;
  return { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius };
}

export function issueMove(world, ids, groundPoint) {
  const validIds = ids.filter((id) => {
    const u = getUnit(world, id);
    return u && u.hp > 0;
  });
  const n = validIds.length;

  validIds.forEach((id, i) => {
    const unit = getUnit(world, id);
    unit.attackTargetId = null;

    const target = jitteredPoint(groundPoint, i, n);
    const goal = computePath(world, unit, target);
    unit.state = goal ? 'moving' : 'idle';
  });
}

export function issueAttack(world, ids, targetId) {
  const target = getUnit(world, targetId);
  if (!target || target.hp <= 0) return;

  for (const id of ids) {
    const unit = getUnit(world, id);
    if (!unit || unit.hp <= 0) continue;

    // Only reset in-flight movement when the target actually changes — this
    // keeps repeated/re-affirming issueAttack calls (enemyAI re-asserts its
    // target every tick, architecture §4.6) idempotent and non-destructive
    // of a chase path combat.js is still walking.
    if (unit.attackTargetId !== targetId) {
      unit.path = null;
      unit.pathIndex = 0;
      unit.moveGoal = null;
      unit.stuckTimer = 0;
      unit.lastDistToWaypoint = Infinity;
    }

    unit.attackTargetId = targetId;
    unit.state = 'attacking';
  }
}

export function selectOnly(world, id) {
  world.selection.clear();
  const unit = getUnit(world, id);
  if (unit && unit.faction === 'player' && unit.hp > 0) {
    world.selection.add(id);
  }
}

export function selectInBox(world, ids) {
  world.selection.clear();
  for (const id of ids) {
    const unit = getUnit(world, id);
    if (unit && unit.faction === 'player' && unit.hp > 0) {
      world.selection.add(id);
    }
  }
}

export function clearSelection(world) {
  world.selection.clear();
}

// Pure move-vs-attack resolution (architecture §4.5): given a raycast pick
// and the current selection, decide whether to issue an attack or a move.
// Testable without Three by feeding a synthetic {hitUnitId, groundPoint}.
export function resolveRightClick(world, selectedIds, pick) {
  if (!selectedIds || selectedIds.length === 0) return;

  if (pick && pick.hitUnitId != null) {
    const target = getUnit(world, pick.hitUnitId);
    if (target && target.faction === 'enemy' && target.hp > 0) {
      issueAttack(world, selectedIds, pick.hitUnitId);
      return;
    }
  }

  if (pick && pick.groundPoint) {
    issueMove(world, selectedIds, pick.groundPoint);
  }
}

export default {
  computePath,
  issueMove,
  issueAttack,
  selectOnly,
  selectInBox,
  clearSelection,
  resolveRightClick,
};
