// core/units.js — unit factory: merges units.json stats + placement into the §4.4 entity shape

// Decision: beyond the illustrative shape in architecture §4.4, this factory
// also adds `tookDamage`/`lastAttackerId` (explicitly required by §4.6's
// "took damage" flag, which needs to know who the attacker was) and
// `aiState` (enemy-only 2-state machine phase, kept separate from the
// shared `state` field so idle/moving/attacking/dead and
// idle-at-post/engage-and-leash don't collide).
export function createUnit({ id, faction, type, stats = {}, x, z, overrides = {} }) {
  const merged = { ...stats, ...overrides };
  const pos = { x, z };

  return {
    id,
    faction,
    type,

    // --- stats (copied from units.json at spawn; per-enemy overrides allowed) ---
    maxHp: merged.maxHp,
    dmg: merged.dmg,
    range: merged.range,
    speed: merged.speed,
    attackInterval: merged.attackInterval,
    aggroRadius: merged.aggroRadius,
    leashRange: merged.leashRange,

    // --- runtime sim state ---
    hp: merged.maxHp,
    pos,
    state: 'idle',

    // orders (set by player input OR by enemyAI — same fields)
    path: null,
    pathIndex: 0,
    moveGoal: null,
    attackTargetId: null,

    // combat timing
    attackCd: 0,

    // enemy-only reactive fields (ignored for players)
    spawnPos: faction === 'enemy' ? { x, z } : null,
    aiState: faction === 'enemy' ? 'idle' : null,
    tookDamage: false,
    lastAttackerId: null,

    // watchdog
    stuckTimer: 0,
    lastDistToWaypoint: Infinity,
  };
}

export default { createUnit };
