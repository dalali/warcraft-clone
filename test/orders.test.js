// test/orders.test.js — architecture §7.1: right-click-on-enemy -> attack order; right-click-on-ground
// -> move order with goal snapped to nearest walkable; box-select includes only player units inside
// the rect and never enemies; clear/select-only mutate selection correctly

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bakeGrid } from '../public/src/sim/grid.js';
import { createUnit } from '../public/src/core/units.js';
import {
  issueMove,
  issueAttack,
  selectOnly,
  selectInBox,
  clearSelection,
  resolveRightClick,
} from '../public/src/sim/orders.js';

const STATS = { maxHp: 50, dmg: 8, range: 1.2, speed: 3, attackInterval: 1, aggroRadius: 5, leashRange: 8 };

function makeWorld(obstacles = []) {
  const grid = bakeGrid({ width: 20, height: 20, tileSize: 1, obstacles });
  return { units: new Map(), grid, selection: new Set() };
}

function addUnit(world, id, faction, x, z) {
  const unit = createUnit({ id, faction, type: 'melee', stats: STATS, x, z });
  world.units.set(id, unit);
  return unit;
}

test('issueMove sets a path/state=moving and clears any attack target', () => {
  const world = makeWorld();
  const p1 = addUnit(world, 1, 'player', 2, 2);
  p1.attackTargetId = 99;

  issueMove(world, [1], { x: 15, z: 15 });

  assert.strictEqual(p1.state, 'moving');
  assert.strictEqual(p1.attackTargetId, null);
  assert.ok(p1.path && p1.path.length > 0);
});

test('issueMove snaps the goal to the nearest walkable point when it lands on an obstacle', () => {
  const world = makeWorld([{ x: 10.5, z: 10.5, radius: 1.0 }]);
  const p1 = addUnit(world, 1, 'player', 2, 2);

  issueMove(world, [1], { x: 10.5, z: 10.5 });

  assert.notDeepEqual(p1.moveGoal, { x: 10.5, z: 10.5 });
  const { cx, cz } = { cx: Math.floor(p1.moveGoal.x), cz: Math.floor(p1.moveGoal.z) };
  assert.strictEqual(world.grid.cells[cz * world.grid.width + cx], true);
});

test('issueAttack sets state=attacking and the target id, and is a no-op against a dead/missing target', () => {
  const world = makeWorld();
  const p1 = addUnit(world, 1, 'player', 2, 2);
  const e1 = addUnit(world, 2, 'enemy', 10, 10);

  issueAttack(world, [1], 2);
  assert.strictEqual(p1.state, 'attacking');
  assert.strictEqual(p1.attackTargetId, 2);

  e1.hp = 0;
  issueAttack(world, [1], 2); // dead target — should be a no-op, not throw
  assert.strictEqual(p1.attackTargetId, 2); // unchanged by the no-op call
});

test('selectOnly selects a player unit and replaces the prior selection', () => {
  const world = makeWorld();
  addUnit(world, 1, 'player', 0, 0);
  addUnit(world, 2, 'player', 1, 1);
  world.selection.add(2);

  selectOnly(world, 1);
  assert.deepEqual([...world.selection], [1]);
});

test('selectOnly never selects an enemy unit', () => {
  const world = makeWorld();
  addUnit(world, 1, 'enemy', 0, 0);

  selectOnly(world, 1);
  assert.deepEqual([...world.selection], []);
});

test('selectInBox includes only player units from the candidate list, never enemies', () => {
  const world = makeWorld();
  addUnit(world, 1, 'player', 0, 0);
  addUnit(world, 2, 'player', 1, 1);
  addUnit(world, 3, 'enemy', 2, 2);

  selectInBox(world, [1, 2, 3]);
  assert.deepEqual([...world.selection].sort(), [1, 2]);
});

test('clearSelection empties the selection', () => {
  const world = makeWorld();
  world.selection.add(1);
  world.selection.add(2);

  clearSelection(world);
  assert.strictEqual(world.selection.size, 0);
});

test('resolveRightClick: picking an enemy unit issues an attack order', () => {
  const world = makeWorld();
  const p1 = addUnit(world, 1, 'player', 2, 2);
  addUnit(world, 2, 'enemy', 10, 10);

  resolveRightClick(world, [1], { hitUnitId: 2, groundPoint: { x: 10, z: 10 } });

  assert.strictEqual(p1.state, 'attacking');
  assert.strictEqual(p1.attackTargetId, 2);
});

test('resolveRightClick: picking the ground issues a move order', () => {
  const world = makeWorld();
  const p1 = addUnit(world, 1, 'player', 2, 2);

  resolveRightClick(world, [1], { hitUnitId: null, groundPoint: { x: 5, z: 5 } });

  assert.strictEqual(p1.state, 'moving');
  assert.deepEqual(p1.moveGoal, { x: 5, z: 5 });
});

test('resolveRightClick: no selection is a no-op', () => {
  const world = makeWorld();
  const p1 = addUnit(world, 1, 'player', 2, 2);

  resolveRightClick(world, [], { hitUnitId: null, groundPoint: { x: 5, z: 5 } });

  assert.strictEqual(p1.state, 'idle');
  assert.strictEqual(p1.moveGoal, null);
});
