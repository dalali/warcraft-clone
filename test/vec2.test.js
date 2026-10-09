// test/vec2.test.js — architecture §7.1: distance, normalize, add/sub correctness

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { add, sub, scale, len, dist, normalize } from '../public/src/sim/vec2.js';

test('add sums x/z components', () => {
  assert.deepEqual(add({ x: 1, z: 2 }, { x: 3, z: 4 }), { x: 4, z: 6 });
});

test('sub subtracts x/z components', () => {
  assert.deepEqual(sub({ x: 5, z: 7 }, { x: 2, z: 3 }), { x: 3, z: 4 });
});

test('scale multiplies both components', () => {
  assert.deepEqual(scale({ x: 2, z: -3 }, 2), { x: 4, z: -6 });
});

test('len computes Euclidean length', () => {
  assert.strictEqual(len({ x: 3, z: 4 }), 5);
});

test('dist computes distance between two points', () => {
  assert.strictEqual(dist({ x: 0, z: 0 }, { x: 3, z: 4 }), 5);
});

test('normalize returns a unit vector in the same direction', () => {
  const n = normalize({ x: 3, z: 4 });
  assert.ok(Math.abs(len(n) - 1) < 1e-9);
  assert.ok(Math.abs(n.x - 0.6) < 1e-9);
  assert.ok(Math.abs(n.z - 0.8) < 1e-9);
});

test('normalize of the zero vector returns zero, not NaN', () => {
  assert.deepEqual(normalize({ x: 0, z: 0 }), { x: 0, z: 0 });
});
