// sim/enemyAI.js — step(): the 2-state machine (idle-at-post / engage-and-leash), emits via orders.js (architecture §4.6)

import { dist } from './vec2.js';
import { issueAttack, issueMove } from './orders.js';

// This module ONLY calls issueMove/issueAttack from orders.js — no bespoke
// movement or combat code (architecture §4.6). `enemy.aiState` ('idle' |
// 'engage') tracks the 2-state machine itself, distinct from the shared
// `state` field (idle/moving/attacking/dead) that movement/combat drive.
export function step(world) {
  const enemies = [...world.units.values()].filter((u) => u.faction === 'enemy' && u.hp > 0);

  for (const enemy of enemies) {
    if (enemy.aiState === 'engage') {
      const target = enemy.attackTargetId != null ? world.units.get(enemy.attackTargetId) : null;
      const targetDead = !target || target.hp <= 0;
      const leashed = dist(enemy.pos, enemy.spawnPos) > enemy.leashRange;

      if (targetDead || leashed) {
        enemy.attackTargetId = null;
        enemy.aiState = 'idle';
        issueMove(world, [enemy.id], enemy.spawnPos); // walk home, same primitive as player move
      } else {
        // Re-affirm the target every tick; issueAttack is idempotent when
        // the target hasn't changed, so this never disrupts an in-flight
        // chase path that combat.js is advancing.
        issueAttack(world, [enemy.id], enemy.attackTargetId);
      }
    } else {
      const players = [...world.units.values()].filter((u) => u.faction === 'player' && u.hp > 0);
      const nearby = players.filter((p) => dist(p.pos, enemy.pos) <= enemy.aggroRadius);

      let targetId = null;
      if (nearby.length > 0) {
        nearby.sort((a, b) => dist(a.pos, enemy.pos) - dist(b.pos, enemy.pos));
        targetId = nearby[0].id;
      } else if (enemy.tookDamage && enemy.lastAttackerId != null) {
        // Took damage from outside the aggro radius: engage the attacker
        // specifically (architecture §4.6 "nearest player ... or the attacker").
        const attacker = world.units.get(enemy.lastAttackerId);
        if (attacker && attacker.hp > 0) targetId = attacker.id;
      }

      if (targetId != null) {
        enemy.aiState = 'engage';
        issueAttack(world, [enemy.id], targetId); // same primitive as player attack
      }
    }

    // "Took damage" is a per-tick flag combat.js sets on the victim; the AI
    // reads it above and clears it here (architecture §4.6).
    enemy.tookDamage = false;
  }
}

export default { step };
