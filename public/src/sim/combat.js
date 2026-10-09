// sim/combat.js — step(): range check, cooldown tick, damage, death flag (architecture §4.3)

import { dist } from './vec2.js';
import { computePath } from './orders.js';

export function step(world, DT) {
  for (const unit of world.units.values()) {
    if (unit.hp <= 0) continue;
    if (unit.state !== 'attacking' || unit.attackTargetId == null) continue;

    const target = world.units.get(unit.attackTargetId);
    if (!target || target.hp <= 0) {
      // Target died/was removed: stop cleanly, no throw (architecture §4.5/US-4).
      // Also clear any in-flight chase path so the attacker halts at its
      // current spot instead of continuing to walk toward the target's
      // stale last position (movement.js drives purely off path presence).
      unit.attackTargetId = null;
      unit.state = 'idle';
      unit.path = null;
      unit.pathIndex = 0;
      unit.moveGoal = null;
      continue;
    }

    const d = dist(unit.pos, target.pos);
    if (d <= unit.range) {
      // In range: clear any in-flight chase path so movement.js (which
      // advances a unit purely off path presence, not state) stops driving
      // the unit further in. Without this a ranged unit would keep closing
      // on its pre-computed path all the way to the target's position even
      // after crossing into attack range.
      unit.path = null;
      unit.pathIndex = 0;
      unit.moveGoal = null;

      unit.attackCd -= DT;
      if (unit.attackCd <= 0) {
        target.hp -= unit.dmg;
        target.tookDamage = true;
        target.lastAttackerId = unit.id;
        unit.attackCd = unit.attackInterval; // reset, never double-ticks within one interval

        if (target.hp <= 0) {
          target.hp = 0;
          target.state = 'dead';
        }
      }
    } else if (!unit.path || unit.pathIndex >= unit.path.length) {
      // Out of range: path toward the target (reusing orders' pathing
      // primitive, not bespoke movement). movement.js then advances the
      // unit along this path on the next tick since `state` stays
      // 'attacking' and movement is driven by path existence, not state.
      computePath(world, unit, target.pos);
    }
  }
}

export default { step };
