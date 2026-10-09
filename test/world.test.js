// test/world.test.js — architecture §7.1: removeDead drops hp<=0 units and frees them from
// selection/targeting; checkEndState returns win only when all enemies dead, lose only when
// all players dead, null otherwise (incl. the exact last-unit boundary of PRD US-7/US-8)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bakeGrid } from '../public/src/sim/grid.js';
import { createWorld, spawn, removeDead, checkEndState, update } from '../public/src/core/world.js';

const STATS = { maxHp: 10, dmg: 5, range: 1.2, speed: 3, attackInterval: 1, aggroRadius: 5, leashRange: 8 };

function makeWorld() {
  const grid = bakeGrid({ width: 20, height: 20, tileSize: 1, obstacles: [] });
  return createWorld({ grid });
}

test('spawn assigns a stable unique id and adds the unit to the world', () => {
  const world = makeWorld();
  const a = spawn(world, { faction: 'player', type: 'melee', stats: STATS, x: 0, z: 0 });
  const b = spawn(world, { faction: 'player', type: 'melee', stats: STATS, x: 1, z: 0 });

  assert.notStrictEqual(a.id, b.id);
  assert.strictEqual(world.units.get(a.id), a);
  assert.strictEqual(world.units.get(b.id), b);
});

test('removeDead drops hp<=0 units and frees them from the selection set', () => {
  const world = makeWorld();
  const p1 = spawn(world, { faction: 'player', type: 'melee', stats: STATS, x: 0, z: 0 });
  world.selection.add(p1.id);
  p1.hp = 0;

  removeDead(world);

  assert.strictEqual(world.units.has(p1.id), false);
  assert.strictEqual(world.selection.has(p1.id), false);
});

test('removeDead clears attackTargetId on any unit still targeting the removed unit', () => {
  const world = makeWorld();
  const p1 = spawn(world, { faction: 'player', type: 'melee', stats: STATS, x: 0, z: 0 });
  const e1 = spawn(world, { faction: 'enemy', type: 'melee', stats: STATS, x: 1, z: 0 });
  e1.attackTargetId = p1.id;
  e1.state = 'attacking';
  p1.hp = 0;

  removeDead(world);

  assert.strictEqual(e1.attackTargetId, null);
  assert.strictEqual(e1.state, 'idle');
});

test('checkEndState is null while both sides have at least one living unit', () => {
  const world = makeWorld();
  spawn(world, { faction: 'player', type: 'melee', stats: STATS, x: 0, z: 0 });
  spawn(world, { faction: 'enemy', type: 'melee', stats: STATS, x: 1, z: 0 });

  assert.strictEqual(checkEndState(world), null);
});

test('checkEndState returns "win" the moment the last enemy unit dies (US-7 boundary)', () => {
  const world = makeWorld();
  spawn(world, { faction: 'player', type: 'melee', stats: STATS, x: 0, z: 0 });
  const e1 = spawn(world, { faction: 'enemy', type: 'melee', stats: STATS, x: 1, z: 0 });
  const e2 = spawn(world, { faction: 'enemy', type: 'melee', stats: STATS, x: 2, z: 0 });

  e1.hp = 0;
  removeDead(world);
  assert.strictEqual(checkEndState(world), null, 'one enemy still alive — not a win yet');

  e2.hp = 0;
  removeDead(world);
  assert.strictEqual(checkEndState(world), 'win');
});

test('checkEndState returns "lose" the moment the last player unit dies (US-8 boundary)', () => {
  const world = makeWorld();
  const p1 = spawn(world, { faction: 'player', type: 'melee', stats: STATS, x: 0, z: 0 });
  spawn(world, { faction: 'enemy', type: 'melee', stats: STATS, x: 1, z: 0 });

  p1.hp = 0;
  removeDead(world);
  assert.strictEqual(checkEndState(world), 'lose');
});

test('update() runs the full phase order (AI -> movement -> combat -> removeDead -> endState) without throwing', () => {
  const world = makeWorld();
  const p1 = spawn(world, { faction: 'player', type: 'melee', stats: STATS, x: 0, z: 0 });
  const e1 = spawn(world, { faction: 'enemy', type: 'melee', stats: STATS, x: 2, z: 0 });
  p1.state = 'attacking';
  p1.attackTargetId = e1.id;

  assert.doesNotThrow(() => {
    for (let i = 0; i < 10; i++) update(world, 1 / 30);
  });
  assert.ok(world.endState === null || world.endState === 'win' || world.endState === 'lose');
});
