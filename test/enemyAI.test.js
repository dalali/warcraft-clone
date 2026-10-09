// test/enemyAI.test.js — architecture §7.1: idle enemy with no player in aggro stays idle; player
// entering aggroRadius -> engage + attack order set; taking damage while idle -> engage even if
// attacker is outside aggro; target beyond leashRange from spawn -> disengage + move-home order;
// target death -> disengage

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bakeGrid } from '../public/src/sim/grid.js';
import { createUnit } from '../public/src/core/units.js';
import { step as aiStep } from '../public/src/sim/enemyAI.js';

const STATS = { maxHp: 30, dmg: 5, range: 4, speed: 3, attackInterval: 1.2, aggroRadius: 6, leashRange: 8 };

function makeWorld() {
  const grid = bakeGrid({ width: 30, height: 30, tileSize: 1, obstacles: [] });
  return { units: new Map(), grid };
}

function enemy(world, id, x, z) {
  const unit = createUnit({ id, faction: 'enemy', type: 'ranged', stats: STATS, x, z });
  world.units.set(id, unit);
  return unit;
}

function player(world, id, x, z) {
  const unit = createUnit({ id, faction: 'player', type: 'melee', stats: STATS, x, z });
  world.units.set(id, unit);
  return unit;
}

test('idle enemy with no player within aggro radius stays idle', () => {
  const world = makeWorld();
  const e = enemy(world, 1, 20, 20);
  player(world, 2, 0, 0); // far outside aggroRadius 6

  aiStep(world);

  assert.strictEqual(e.aiState, 'idle');
  assert.strictEqual(e.state, 'idle');
  assert.strictEqual(e.attackTargetId, null);
});

test('a player unit entering the aggro radius triggers engage + an attack order', () => {
  const world = makeWorld();
  const e = enemy(world, 1, 20, 20);
  const p = player(world, 2, 22, 20); // within aggroRadius 6

  aiStep(world);

  assert.strictEqual(e.aiState, 'engage');
  assert.strictEqual(e.state, 'attacking');
  assert.strictEqual(e.attackTargetId, p.id);
});

test('taking damage while idle engages the attacker even if it is outside the aggro radius', () => {
  const world = makeWorld();
  const e = enemy(world, 1, 20, 20);
  const attacker = player(world, 2, 0, 0); // far outside aggroRadius 6
  e.tookDamage = true;
  e.lastAttackerId = attacker.id;

  aiStep(world);

  assert.strictEqual(e.aiState, 'engage');
  assert.strictEqual(e.state, 'attacking');
  assert.strictEqual(e.attackTargetId, attacker.id);
});

test('enemyAI clears the tookDamage flag after reading it', () => {
  const world = makeWorld();
  const e = enemy(world, 1, 20, 20);
  const attacker = player(world, 2, 0, 0);
  e.tookDamage = true;
  e.lastAttackerId = attacker.id;

  aiStep(world);

  assert.strictEqual(e.tookDamage, false);
});

test('an engaged enemy disengages and walks home when its target dies', () => {
  const world = makeWorld();
  const e = enemy(world, 1, 10, 10);
  const p = player(world, 2, 12, 10);
  e.aiState = 'engage';
  e.state = 'attacking';
  e.attackTargetId = p.id;
  p.hp = 0;

  aiStep(world);

  assert.strictEqual(e.aiState, 'idle');
  assert.strictEqual(e.attackTargetId, null);
  assert.strictEqual(e.state, 'moving');
  assert.deepEqual(e.moveGoal, e.spawnPos);
});

test('an engaged enemy disengages and walks home when it strays beyond leashRange of spawn', () => {
  const world = makeWorld();
  const e = enemy(world, 1, 10, 10); // spawnPos (10,10), leashRange 8
  const p = player(world, 2, 10, 10);
  e.aiState = 'engage';
  e.state = 'attacking';
  e.attackTargetId = p.id;
  e.pos = { x: 20, z: 10 }; // 10 units from spawn, > leashRange 8

  aiStep(world);

  assert.strictEqual(e.aiState, 'idle');
  assert.strictEqual(e.attackTargetId, null);
  assert.strictEqual(e.state, 'moving');
  assert.deepEqual(e.moveGoal, e.spawnPos);
});

test('an engaged enemy within leash range keeps re-affirming the same attack order without disruption', () => {
  const world = makeWorld();
  const e = enemy(world, 1, 10, 10);
  const p = player(world, 2, 11, 10); // close, within leash range
  e.aiState = 'engage';
  e.state = 'attacking';
  e.attackTargetId = p.id;

  aiStep(world);

  assert.strictEqual(e.aiState, 'engage');
  assert.strictEqual(e.state, 'attacking');
  assert.strictEqual(e.attackTargetId, p.id);
});
