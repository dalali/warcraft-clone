// test/pathfinding.test.js — architecture §7.1: A* finds the shortest path on a known grid;
// routes AROUND a blocking obstacle (not through); refuses corner-cutting between two diagonal
// blockers; returns empty/null when enclosed; smoothing never crosses a blocked cell

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bakeGrid } from '../public/src/sim/grid.js';
import { aStar, aStarCells, smoothPath, hasLineOfSight } from '../public/src/sim/pathfinding.js';

test('aStar finds a direct path on an open grid', () => {
  const grid = bakeGrid({ width: 10, height: 10, tileSize: 1, obstacles: [] });
  const path = aStar(grid, { x: 1.5, z: 1.5 }, { x: 4.5, z: 1.5 });
  assert.ok(path && path.length > 0);
  // Final waypoint is the goal cell center.
  assert.deepEqual(path[path.length - 1], { x: 4.5, z: 1.5 });
});

test('aStar routes AROUND a blocking obstacle, never through a blocked cell', () => {
  const obstacles = [];
  for (let z = 2; z <= 7; z++) obstacles.push({ x: 5.5, z: z + 0.5, radius: 0.4 });
  const grid = bakeGrid({ width: 12, height: 12, tileSize: 1, obstacles });

  const path = aStar(grid, { x: 1.5, z: 4.5 }, { x: 9.5, z: 4.5 });
  assert.ok(path && path.length > 0);

  for (const wp of path) {
    const cx = Math.floor(wp.x);
    const cz = Math.floor(wp.z);
    // None of the waypoints may land on the blocked column (x cell 5, z cells 2-7).
    assert.ok(!(cx === 5 && cz >= 2 && cz <= 7), `waypoint (${cx},${cz}) crosses the obstacle wall`);
  }
});

test('aStar refuses corner-cutting between two diagonal blockers and detours instead', () => {
  const width = 6;
  const height = 6;
  const cells = new Array(width * height).fill(true);
  const idx = (cx, cz) => cz * width + cx;
  cells[idx(2, 2)] = false;
  cells[idx(3, 3)] = false;
  const grid = { width, height, tileSize: 1, cells };

  const path = aStarCells(grid, { cx: 0, cz: 0 }, { cx: 5, cz: 5 });
  assert.ok(path && path.length > 0, 'a detour path should exist');

  let cutCorner = false;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const isForbiddenDiagonal =
      (a.cx === 2 && a.cz === 3 && b.cx === 3 && b.cz === 2) ||
      (a.cx === 3 && a.cz === 2 && b.cx === 2 && b.cz === 3);
    if (isForbiddenDiagonal) cutCorner = true;
  }
  assert.strictEqual(cutCorner, false, 'path must not cut the corner between the two diagonal blockers');
});

test('aStar returns null when the goal is fully enclosed', () => {
  const obstacles = [];
  for (let cz = 4; cz <= 6; cz++) {
    for (let cx = 4; cx <= 6; cx++) {
      if (cx === 5 && cz === 5) continue;
      obstacles.push({ x: cx + 0.5, z: cz + 0.5, radius: 0.4 });
    }
  }
  const grid = bakeGrid({ width: 12, height: 12, tileSize: 1, obstacles });

  const path = aStar(grid, { x: 1.5, z: 1.5 }, { x: 5.5, z: 5.5 });
  assert.strictEqual(path, null);
});

test('aStar returns a single-point path when start and goal share a cell', () => {
  const grid = bakeGrid({ width: 5, height: 5, tileSize: 1, obstacles: [] });
  const path = aStar(grid, { x: 1.2, z: 1.2 }, { x: 1.8, z: 1.4 });
  assert.deepEqual(path, [{ x: 1.5, z: 1.5 }]);
});

test('smoothPath never produces a segment that crosses a blocked cell', () => {
  const grid = bakeGrid({ width: 10, height: 10, tileSize: 1, obstacles: [{ x: 5.5, z: 5.5, radius: 1.0 }] });
  const start = { x: 1.5, z: 5.5 };
  const rawPath = aStar(grid, start, { x: 9.5, z: 5.5 });
  assert.ok(rawPath && rawPath.length > 1);

  const full = [start, ...rawPath];
  const smoothed = smoothPath(grid, full);

  assert.ok(smoothed.length <= full.length, 'smoothing should never add waypoints');
  assert.deepEqual(smoothed[0], full[0]);
  assert.deepEqual(smoothed[smoothed.length - 1], full[full.length - 1]);

  for (let i = 0; i < smoothed.length - 1; i++) {
    assert.ok(hasLineOfSight(grid, smoothed[i], smoothed[i + 1]), `segment ${i} crosses a blocked cell`);
  }
});

test('smoothPath leaves a 2-point (or shorter) path unchanged', () => {
  const grid = bakeGrid({ width: 5, height: 5, tileSize: 1, obstacles: [] });
  const path = [{ x: 0.5, z: 0.5 }, { x: 3.5, z: 3.5 }];
  assert.deepEqual(smoothPath(grid, path), path);
});
