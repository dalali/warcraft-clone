// test/combat.test.js — architecture §7.1: damage applied only when target in range; melee needs
// adjacency, ranged hits from range; cooldown gates ticks (no double-tick in one interval); hp
// reaches 0 -> death flag set; attacker whose target died stops cleanly (no throw)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bakeGrid } from '../public/src/sim/grid.js';
import { createUnit } from '../public/src/core/units.js';
import { step as combatStep } from '../public/src/sim/combat.js';
import { step as movementStep } from '../public/src/sim/movement.js';
import { dist } from '../public/src/sim/vec2.js';

const MELEE = { maxHp: 20, dmg: 8, range: 1.2, speed: 3, attackInterval: 1, aggroRadius: 5, leashRange: 8 };
const RANGED = { maxHp: 30, dmg: 5, range: 4.0, speed: 3, attackInterval: 1.2, aggroRadius: 6, leashRange: 8 };

function makeWorld() {
  const grid = bakeGrid({ width: 20, height: 20, tileSize: 1, obstacles: [] });
  return { units: new Map(), grid };
}

function attacker(world, id, type, stats, x, z, targetId) {
  const unit = createUnit({ id, faction: 'player', type, stats, x, z });
  unit.state = 'attacking';
  unit.attackTargetId = targetId;
  world.units.set(id, unit);
  return unit;
}

function victim(world, id, x, z) {
  const unit = createUnit({ id, faction: 'enemy', type: 'melee', stats: MELEE, x, z });
  world.units.set(id, unit);
  return unit;
}

test('melee attacker out of range does not deal damage and instead paths toward the target', () => {
  const world = makeWorld();
  const a = attacker(world, 1, 'melee', MELEE, 0, 0, 2);
  const t = victim(world, 2, 10, 0);

  combatStep(world, 1 / 30);

  assert.strictEqual(t.hp, t.maxHp, 'no damage while out of range');
  assert.ok(a.path && a.path.length > 0, 'attacker should path toward the target');
});

test('melee attacker adjacent to target deals damage; ranged attacker deals damage from range without closing distance', () => {
  const meleeWorld = makeWorld();
  const a = attacker(meleeWorld, 1, 'melee', MELEE, 0, 0, 2);
  const t = victim(meleeWorld, 2, 0.5, 0); // within melee range (1.2)
  combatStep(meleeWorld, 1 / 30);
  assert.ok(t.hp < t.maxHp, 'melee deals damage when adjacent');

  const rangedWorld = makeWorld();
  const ra = attacker(rangedWorld, 1, 'ranged', RANGED, 0, 0, 2);
  const rt = victim(rangedWorld, 2, 3.5, 0); // within ranged range (4.0), not adjacent
  combatStep(rangedWorld, 1 / 30);
  assert.ok(rt.hp < rt.maxHp, 'ranged deals damage from range');
  assert.deepEqual(ra.pos, { x: 0, z: 0 }, 'ranged attacker does not need to close distance');
  assert.strictEqual(ra.path, null);
});

test('attack cooldown gates damage ticks — no double-tick within one interval', () => {
  const world = makeWorld();
  const a = attacker(world, 1, 'melee', MELEE, 0, 0, 2);
  const t = victim(world, 2, 0.5, 0);

  combatStep(world, 0.5); // tick 1: attackCd starts at 0 -> damage applied, cd reset to attackInterval (1)
  assert.strictEqual(t.hp, t.maxHp - MELEE.dmg);

  combatStep(world, 0.5); // tick 2: cd now 0.5, still > 0 -> no second tick in this interval
  assert.strictEqual(t.hp, t.maxHp - MELEE.dmg);

  combatStep(world, 0.5); // tick 3: cd reaches 0 -> damage applied again
  assert.strictEqual(t.hp, t.maxHp - MELEE.dmg * 2);
});

test('hp reaching 0 sets the death flag (state=dead) and tookDamage on the victim', () => {
  const world = makeWorld();
  const a = attacker(world, 1, 'melee', MELEE, 0, 0, 2);
  const t = victim(world, 2, 0.5, 0);
  t.hp = 5; // one hit (dmg 8) will kill it

  combatStep(world, 1 / 30);

  assert.strictEqual(t.hp, 0);
  assert.strictEqual(t.state, 'dead');
  assert.strictEqual(t.tookDamage, true);
});

test('an attacker whose target already died/was removed stops cleanly without throwing', () => {
  const world = makeWorld();
  const a = attacker(world, 1, 'melee', MELEE, 0, 0, 2);
  const t = victim(world, 2, 0.5, 0);
  t.hp = 0;

  assert.doesNotThrow(() => combatStep(world, 1 / 30));
  assert.strictEqual(a.state, 'idle');
  assert.strictEqual(a.attackTargetId, null);

  // Target fully removed from the world (not just hp<=0) is handled identically.
  world.units.delete(2);
  a.state = 'attacking';
  a.attackTargetId = 2;
  assert.doesNotThrow(() => combatStep(world, 1 / 30));
  assert.strictEqual(a.state, 'idle');
  assert.strictEqual(a.attackTargetId, null);
});

test('ranged attacker starting beyond range closes to its attack range and stops, instead of continuing to adjacency', () => {
  const world = makeWorld();
  // Target 20 units away, well beyond the ranged unit's range (4.0).
  const a = attacker(world, 1, 'ranged', RANGED, 0, 0, 2);
  const t = victim(world, 2, 20, 0); // stationary target

  const DT = 1 / 30;
  // Step combat+movement repeatedly (same order a real game loop would use)
  // until the attacker starts dealing damage, or we give up after a
  // generous number of ticks (20 units / speed 3 ~= 6.7s of travel).
  let dealtDamage = false;
  for (let i = 0; i < 600; i++) {
    combatStep(world, DT);
    movementStep(world, DT);
    if (t.hp < t.maxHp) {
      dealtDamage = true;
      break;
    }
  }

  assert.ok(dealtDamage, 'ranged attacker should eventually come into range and deal damage');

  const finalDist = dist(a.pos, t.pos);
  assert.ok(
    finalDist <= RANGED.range + 0.1,
    `attacker should be within range (${RANGED.range}) of target, got ${finalDist}`
  );
  // The bug under test let the unit keep closing the full path toward the
  // target's exact position (down to ~0.8, the separation radius) instead
  // of stopping once it first crossed into range. Guard against that by
  // asserting the attacker stopped meaningfully short of adjacency.
  assert.ok(
    finalDist > 1.0,
    `ranged attacker should stop at range, not close to adjacency (distance ${finalDist})`
  );

  // Once stopped and attacking, the attacker must not still be walking.
  assert.strictEqual(a.path, null, 'attacker should have no in-flight path once in range');

  // Continue stepping and confirm the attacker holds its ground at range
  // rather than drifting further toward the target.
  const distAfterFirstHit = finalDist;
  for (let i = 0; i < 60; i++) {
    combatStep(world, DT);
    movementStep(world, DT);
  }
  const distLater = dist(a.pos, t.pos);
  assert.ok(
    Math.abs(distLater - distAfterFirstHit) < 0.5,
    `attacker should hold its distance once in range (was ${distAfterFirstHit}, now ${distLater})`
  );
});
