// test/grid.test.js — architecture §7.1: obstacle baking blocks the right cells; world<->cell
// conversion; nearest-walkable snaps a blocked/out-of-bounds point to the correct walkable cell

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bakeGrid, worldToCell, cellToWorldCenter, isWalkable, nearestWalkable } from '../public/src/sim/grid.js';

function basicMap(obstacles = []) {
  return { width: 10, height: 10, tileSize: 1, obstacles };
}

test('bakeGrid: all cells walkable with no obstacles', () => {
  const grid = bakeGrid(basicMap());
  for (let cz = 0; cz < grid.height; cz++) {
    for (let cx = 0; cx < grid.width; cx++) {
      assert.strictEqual(isWalkable(grid, cx, cz), true);
    }
  }
});

test('bakeGrid: obstacle blocks its own cell and the cells within radius + footprint margin, nothing further', () => {
  // Obstacle centered on a cell center, radius 1.0 -> blockRadius 1.5 -> a
  // clean 3x3 block of cells around it should be blocked, nothing outside it.
  const grid = bakeGrid(basicMap([{ x: 5.5, z: 5.5, radius: 1.0 }]));

  const expectedBlocked = new Set([
    '4,4', '5,4', '6,4',
    '4,5', '5,5', '6,5',
    '4,6', '5,6', '6,6',
  ]);

  for (let cz = 0; cz < grid.height; cz++) {
    for (let cx = 0; cx < grid.width; cx++) {
      const expected = !expectedBlocked.has(`${cx},${cz}`);
      assert.strictEqual(isWalkable(grid, cx, cz), expected, `cell (${cx},${cz})`);
    }
  }
});

test('worldToCell / cellToWorldCenter round-trip to a cell center', () => {
  const grid = bakeGrid(basicMap());
  const cell = worldToCell(grid, { x: 3.7, z: 4.2 });
  assert.deepEqual(cell, { cx: 3, cz: 4 });
  const center = cellToWorldCenter(grid, 3, 4);
  assert.deepEqual(center, { x: 3.5, z: 4.5 });
  assert.deepEqual(worldToCell(grid, center), cell);
});

test('isWalkable returns false for out-of-bounds cells', () => {
  const grid = bakeGrid(basicMap());
  assert.strictEqual(isWalkable(grid, -1, 0), false);
  assert.strictEqual(isWalkable(grid, 0, -1), false);
  assert.strictEqual(isWalkable(grid, grid.width, 0), false);
  assert.strictEqual(isWalkable(grid, 0, grid.height), false);
});

test('nearestWalkable returns the original point unchanged when already walkable', () => {
  const grid = bakeGrid(basicMap());
  const point = { x: 2.5, z: 2.5 };
  assert.deepEqual(nearestWalkable(grid, point), point);
});

test('nearestWalkable snaps a point on an obstacle to the nearest walkable cell center', () => {
  const grid = bakeGrid(basicMap([{ x: 5.5, z: 5.5, radius: 1.0 }]));
  const snapped = nearestWalkable(grid, { x: 5.5, z: 5.5 });
  const { cx, cz } = worldToCell(grid, snapped);
  assert.strictEqual(isWalkable(grid, cx, cz), true);
  assert.deepEqual(snapped, { x: 7.5, z: 5.5 });
});

test('nearestWalkable snaps an out-of-bounds point to the nearest in-bounds walkable cell', () => {
  const grid = bakeGrid(basicMap());
  const snapped = nearestWalkable(grid, { x: -5, z: 3.5 });
  const { cx, cz } = worldToCell(grid, snapped);
  assert.strictEqual(isWalkable(grid, cx, cz), true);
  assert.deepEqual(snapped, { x: 0.5, z: 3.5 });
});
