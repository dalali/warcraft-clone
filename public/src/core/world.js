// core/world.js — entity store, spawn(), removeDead(), checkEndState(), selection (architecture §4.8)

import { step as enemyAIStep } from '../sim/enemyAI.js';
import { step as movementStep } from '../sim/movement.js';
import { step as combatStep } from '../sim/combat.js';
import { createUnit } from './units.js';

export function createWorld({ grid, map } = {}) {
  return {
    units: new Map(), // id -> unit
    grid,
    map,
    selection: new Set(),
    endState: null, // null | 'win' | 'lose'
    nextId: 1,
  };
}

export function spawn(world, spec) {
  const id = spec.id ?? world.nextId++;
  if (spec.id != null && spec.id >= world.nextId) {
    world.nextId = spec.id + 1;
  }
  const unit = createUnit({ ...spec, id });
  world.units.set(id, unit);
  return unit;
}

// Drops hp<=0 units and frees them from selection and from any
// attackTargetId referencing them (architecture §7.1).
export function removeDead(world) {
  const deadIds = [];
  for (const [id, unit] of world.units) {
    if (unit.hp <= 0) deadIds.push(id);
  }
  if (deadIds.length === 0) return deadIds;

  for (const id of deadIds) {
    world.units.delete(id);
    world.selection.delete(id);
  }

  const deadSet = new Set(deadIds);
  for (const unit of world.units.values()) {
    if (unit.attackTargetId != null && deadSet.has(unit.attackTargetId)) {
      unit.attackTargetId = null;
      if (unit.state === 'attacking') unit.state = 'idle';
    }
  }

  return deadIds;
}

// Decision: if the last player and last enemy die on the same tick, this
// resolves to 'lose' (checked first) — US-8's "all player units destroyed"
// condition is evaluated literally regardless of enemy state.
export function checkEndState(world) {
  const units = [...world.units.values()];
  const anyPlayerAlive = units.some((u) => u.faction === 'player' && u.hp > 0);
  const anyEnemyAlive = units.some((u) => u.faction === 'enemy' && u.hp > 0);

  if (!anyPlayerAlive) {
    world.endState = 'lose';
  } else if (!anyEnemyAlive) {
    world.endState = 'win';
  } else {
    world.endState = null;
  }
  return world.endState;
}

// The §4.3 phase order: AI -> movement -> combat -> removeDead -> win/lose.
export function update(world, DT) {
  enemyAIStep(world);
  movementStep(world, DT);
  combatStep(world, DT);
  removeDead(world);
  checkEndState(world);
}

export default { createWorld, spawn, removeDead, checkEndState, update };
