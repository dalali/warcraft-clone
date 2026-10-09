// sim/pathfinding.js — A* over the baked grid (§3.3) + string-pull smoothing (§3.3, non-blocking polish)

import { worldToCell, cellToWorldCenter, isWalkable } from './grid.js';

const DIRS = [
  { dx: 1, dz: 0, cost: 1 },
  { dx: -1, dz: 0, cost: 1 },
  { dx: 0, dz: 1, cost: 1 },
  { dx: 0, dz: -1, cost: 1 },
  { dx: 1, dz: 1, cost: Math.SQRT2 },
  { dx: 1, dz: -1, cost: Math.SQRT2 },
  { dx: -1, dz: 1, cost: Math.SQRT2 },
  { dx: -1, dz: -1, cost: Math.SQRT2 },
];

function cellKey(cx, cz) {
  return `${cx},${cz}`;
}

// Octile heuristic (admissible for 8-connected grids) with a tiny tie-breaker
// to prefer straighter paths (architecture §3.3).
function octile(a, b) {
  const dx = Math.abs(a.cx - b.cx);
  const dz = Math.abs(a.cz - b.cz);
  const F = Math.SQRT2 - 1;
  const h = dx < dz ? F * dx + dz : F * dz + dx;
  return h * (1 + 1e-3);
}

// A* over cell coordinates. Returns a list of {cx,cz} from start to goal
// (inclusive of both ends), or null if no path exists / goal unreachable.
export function aStarCells(grid, start, goal) {
  if (!isWalkable(grid, start.cx, start.cz) || !isWalkable(grid, goal.cx, goal.cz)) {
    return null;
  }
  if (start.cx === goal.cx && start.cz === goal.cz) {
    return [{ cx: start.cx, cz: start.cz }];
  }

  const startKey = cellKey(start.cx, start.cz);
  const goalKey = cellKey(goal.cx, goal.cz);

  const gScore = new Map([[startKey, 0]]);
  const fScore = new Map([[startKey, octile(start, goal)]]);
  const cameFrom = new Map();
  const open = new Map([[startKey, start]]);
  const closed = new Set();

  while (open.size > 0) {
    let currentKey = null;
    let currentNode = null;
    let bestF = Infinity;
    for (const [k, node] of open) {
      const f = fScore.get(k) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        currentKey = k;
        currentNode = node;
      }
    }

    open.delete(currentKey);
    closed.add(currentKey);

    if (currentKey === goalKey) {
      const path = [];
      let ck = currentKey;
      while (ck !== undefined) {
        const [cx, cz] = ck.split(',').map(Number);
        path.push({ cx, cz });
        ck = cameFrom.get(ck);
      }
      path.reverse();
      return path;
    }

    for (const d of DIRS) {
      const ncx = currentNode.cx + d.dx;
      const ncz = currentNode.cz + d.dz;
      if (!isWalkable(grid, ncx, ncz)) continue;

      // No corner-cutting: a diagonal move is only allowed if BOTH shared
      // orthogonal neighbors are walkable (architecture §3.3).
      if (d.dx !== 0 && d.dz !== 0) {
        if (
          !isWalkable(grid, currentNode.cx + d.dx, currentNode.cz) ||
          !isWalkable(grid, currentNode.cx, currentNode.cz + d.dz)
        ) {
          continue;
        }
      }

      const nk = cellKey(ncx, ncz);
      if (closed.has(nk)) continue;

      const tentativeG = gScore.get(currentKey) + d.cost;
      if (tentativeG < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, currentKey);
        gScore.set(nk, tentativeG);
        fScore.set(nk, tentativeG + octile({ cx: ncx, cz: ncz }, goal));
        if (!open.has(nk)) open.set(nk, { cx: ncx, cz: ncz });
      }
    }
  }

  return null;
}

// World-space wrapper: returns a list of world-space waypoints (cell centers)
// from the step AFTER start through goal (the start point itself is omitted,
// since the moving unit is already there). Returns null if unreachable.
export function aStar(grid, startWorld, goalWorld) {
  const start = worldToCell(grid, startWorld);
  const goal = worldToCell(grid, goalWorld);
  const cellPath = aStarCells(grid, start, goal);
  if (!cellPath) return null;

  const steps = cellPath.slice(1);
  if (steps.length === 0) {
    // start and goal share a cell — still give the caller a point to arrive at.
    return [cellToWorldCenter(grid, goal.cx, goal.cz)];
  }
  return steps.map((c) => cellToWorldCenter(grid, c.cx, c.cz));
}

// Supercover line rasterization: every grid cell a straight line between two
// world points passes through, including both "corner" cells at a diagonal
// crossing (so a line that clips a blocked corner is correctly rejected).
function cellsOnLine(grid, p0, p1) {
  const a = worldToCell(grid, p0);
  const b = worldToCell(grid, p1);

  let x = a.cx;
  let y = a.cz;
  const dx = b.cx - a.cx;
  const dy = b.cz - a.cz;
  const nx = Math.abs(dx);
  const ny = Math.abs(dy);
  const signX = dx > 0 ? 1 : -1;
  const signY = dy > 0 ? 1 : -1;

  const cells = [{ cx: x, cz: y }];
  let ix = 0;
  let iy = 0;

  while (ix < nx || iy < ny) {
    const decide = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decide < 0) {
      x += signX;
      ix += 1;
      cells.push({ cx: x, cz: y });
    } else if (decide > 0) {
      y += signY;
      iy += 1;
      cells.push({ cx: x, cz: y });
    } else {
      // Exact diagonal crossing: visit both orthogonal corner cells.
      x += signX;
      ix += 1;
      cells.push({ cx: x, cz: y });
      y += signY;
      iy += 1;
      cells.push({ cx: x, cz: y });
    }
  }

  return cells;
}

export function hasLineOfSight(grid, a, b) {
  const cells = cellsOnLine(grid, a, b);
  return cells.every((c) => isWalkable(grid, c.cx, c.cz));
}

// String-pull smoothing (architecture §3.3): drop any intermediate waypoint
// that is still reachable from the current anchor via a straight,
// obstacle-free line. `waypoints[0]` must be the path's starting point.
// Non-blocking polish — callers may skip this and use the raw A* output.
export function smoothPath(grid, waypoints) {
  if (!waypoints || waypoints.length <= 2) {
    return waypoints ? waypoints.slice() : waypoints;
  }

  const result = [waypoints[0]];
  for (let i = 1; i < waypoints.length - 1; i++) {
    const anchor = result[result.length - 1];
    const next = waypoints[i + 1];
    if (!hasLineOfSight(grid, anchor, next)) {
      result.push(waypoints[i]);
    }
  }
  result.push(waypoints[waypoints.length - 1]);
  return result;
}

export default { aStar, aStarCells, smoothPath, hasLineOfSight };
