// view/effects.js — wall-clock cosmetic animations: HP-bar tween, move
// marker, pulsing attack-target ring, death fade (architecture §4.7, design
// §3.4/§3.5/§5.1/§5.2). Three-aware (view/ layer) but reads `world` only —
// never mutates sim state, only Three objects it owns itself.
import * as THREE from 'three';
import { GROUND_Y } from './unitView.js';

// design §3.4 HP fill color thresholds — duplicated from unitView.js (a
// tiny pure function) rather than exporting it from there, to keep this
// slice's footprint to effects.js/hud.js/main.js/loop.js + the one sceneView
// death-fade edit.
const HP_HEALTHY = 0x4caf50;
const HP_WOUNDED = 0xe0b23a;
const HP_CRITICAL = 0xd9453d;
function hpColorForFraction(frac) {
  if (frac > 0.6) return HP_HEALTHY;
  if (frac > 0.25) return HP_WOUNDED;
  return HP_CRITICAL;
}

const HP_TWEEN_S = 0.15; // design §3.4 "~150ms"
const DEATH_FADE_S = 0.3; // design §3.5 "~300ms"
const MOVE_MARKER_COLOR = 0x9fe0e8; // neutral white/cyan, design §5.1
const MOVE_MARKER_SCALE_IN_S = 0.2;
const MOVE_MARKER_HOLD_S = 0.0; // "scales in, holds briefly, fades out" — hold folded into fade start
const MOVE_MARKER_FADE_S = 0.3;
const MOVE_MARKER_LIFETIME_S = MOVE_MARKER_SCALE_IN_S + MOVE_MARKER_HOLD_S + MOVE_MARKER_FADE_S; // ~0.5s
const ATTACK_RING_COLOR = 0xe8463b; // design §7.1 "Attack-target ring"
const ATTACK_RING_PULSE_PERIOD_S = 1.5;

function disposeOwnedMaterials(group) {
  group.traverse((obj) => {
    if (obj.userData && obj.userData.ownedMaterial && obj.material) {
      obj.material.dispose();
    }
  });
}

// `createEffects({ scene })` owns every cosmetic Three object it spawns
// (move markers, attack rings, and the death-fade handoff groups) and adds
// them straight into the given scene. `scene` is passed in at construction
// (main.js builds sceneView first, then effects with `sceneView.scene`) so
// there is no construction-order circularity with sceneView.
export function createEffects({ scene }) {
  // --- HP-bar tween state (design §3.4) -----------------------------------
  // Tracks each unit's last-rendered HP fraction so sceneView's per-frame
  // snap-to-true-value (view/unitView.js's updateUnitGroup, called from
  // sceneView.sync *before* effects.update runs) can be overridden here with
  // a smoothed value — this is why effects.update must run after
  // sceneView.sync each frame (architecture §4.3/loop.js ordering).
  const visualHpFrac = new Map(); // unitId -> last-rendered hp fraction

  // --- move marker state (design §5.1) ------------------------------------
  const lastMoveGoal = new Map(); // unitId -> last-seen moveGoal object (reference compare)
  const moveMarkers = []; // { mesh, elapsed }

  // --- attack ring state (design §5.2) ------------------------------------
  const attackRings = new Map(); // targetUnitId -> mesh

  // --- death fade state (design §3.5) -------------------------------------
  const deathAnims = []; // { group, elapsed, startScale }

  let clock = 0; // wall-clock seconds, for the attack-ring pulse phase

  function spawnMoveMarker(x, z) {
    const geometry = new THREE.RingGeometry(0.35, 0.5, 24);
    const material = new THREE.MeshBasicMaterial({
      color: MOVE_MARKER_COLOR,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, GROUND_Y + 0.03, z);
    scene.add(mesh);
    moveMarkers.push({ mesh, elapsed: 0 });
  }

  function updateMoveMarkers(dt) {
    for (let i = moveMarkers.length - 1; i >= 0; i--) {
      const marker = moveMarkers[i];
      marker.elapsed += dt;
      const t = marker.elapsed;
      let opacity;
      let scale;
      if (t < MOVE_MARKER_SCALE_IN_S) {
        const p = t / MOVE_MARKER_SCALE_IN_S;
        opacity = p;
        scale = 0.6 + 0.4 * p;
      } else if (t < MOVE_MARKER_LIFETIME_S) {
        const p = (t - MOVE_MARKER_SCALE_IN_S) / MOVE_MARKER_FADE_S;
        opacity = 1 - p;
        scale = 1.0 + 0.3 * p;
      } else {
        scene.remove(marker.mesh);
        marker.mesh.geometry.dispose();
        marker.mesh.material.dispose();
        moveMarkers.splice(i, 1);
        continue;
      }
      marker.mesh.material.opacity = Math.max(0, Math.min(1, opacity));
      marker.mesh.scale.set(scale, scale, 1);
    }
  }

  // Detects newly-issued move orders by reference-comparing each unit's
  // `moveGoal` against the last tick's value (a fresh object is written by
  // sim/orders.js's computePath on every issueMove, even re-clicking the
  // same spot, so reference compare — not value compare — is what lets a
  // repeat click re-trigger the marker). Only player units trigger a marker:
  // design §5.1 is about *player* move-order feedback, and enemyAI's
  // disengage-walk-home issues moveGoals too (architecture §4.6) — showing a
  // marker for every leashed enemy retreating would be noise, not feedback.
  // Multiple selected units moving together resolve to ONE marker at the
  // centroid of their (jittered) goals (design §5.1 "one shared marker").
  function detectMoveOrders(world) {
    const changed = [];
    for (const [id, unit] of world.units) {
      const prev = lastMoveGoal.get(id);
      if (unit.faction === 'player' && unit.moveGoal && unit.moveGoal !== prev) {
        changed.push(unit.moveGoal);
      }
      lastMoveGoal.set(id, unit.moveGoal);
    }
    if (changed.length > 0) {
      const cx = changed.reduce((sum, g) => sum + g.x, 0) / changed.length;
      const cz = changed.reduce((sum, g) => sum + g.z, 0) / changed.length;
      spawnMoveMarker(cx, cz);
    }
  }

  function makeAttackRingMesh() {
    const geometry = new THREE.RingGeometry(0.6, 0.72, 24);
    const material = new THREE.MeshBasicMaterial({
      color: ATTACK_RING_COLOR,
      side: THREE.DoubleSide,
      transparent: true,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = GROUND_Y + 0.025;
    scene.add(mesh);
    return mesh;
  }

  // Design §5.2: pulsing ring on every enemy currently targeted by at least
  // one selected unit; cleared when the target dies or no selected unit
  // still targets it.
  function updateAttackRings(world) {
    const activeTargets = new Set();
    for (const id of world.selection) {
      const unit = world.units.get(id);
      if (!unit || unit.attackTargetId == null) continue;
      const target = world.units.get(unit.attackTargetId);
      if (target && target.hp > 0) activeTargets.add(unit.attackTargetId);
    }

    for (const [targetId, mesh] of attackRings) {
      if (!activeTargets.has(targetId)) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        attackRings.delete(targetId);
      }
    }

    const pulse = 0.5 + 0.5 * Math.sin((clock / ATTACK_RING_PULSE_PERIOD_S) * Math.PI * 2);
    for (const targetId of activeTargets) {
      let mesh = attackRings.get(targetId);
      if (!mesh) {
        mesh = makeAttackRingMesh();
        attackRings.set(targetId, mesh);
      }
      const target = world.units.get(targetId);
      mesh.position.x = target.pos.x;
      mesh.position.z = target.pos.z;
      mesh.material.opacity = 0.4 + 0.6 * pulse;
    }
  }

  // Design §3.4: tween each unit's HP-fill sprite toward its true hp
  // fraction over ~150ms instead of the instant snap sceneView/unitView
  // apply earlier this same frame. Runs over whatever Group currently
  // exists for the unit in `unitGroups` (sceneView's reconciliation map).
  function updateHpTweens(dt, world, unitGroups) {
    for (const [id, unit] of world.units) {
      const group = unitGroups.get(id);
      if (!group || !group.userData.hpFill) continue;

      const trueFrac = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
      let visual = visualHpFrac.get(id);
      if (visual == null) visual = trueFrac; // snap on first sight (unit just spawned)
      else visual += (trueFrac - visual) * Math.min(1, dt / HP_TWEEN_S);
      visualHpFrac.set(id, visual);

      const hpFill = group.userData.hpFill;
      const fullWidth = group.userData.hpFullWidth;
      hpFill.scale.x = fullWidth * visual;
      hpFill.position.x = -(fullWidth - hpFill.scale.x) / 2;
      hpFill.material.color.setHex(hpColorForFraction(visual));
    }

    // prune entries for units no longer in the world
    for (const id of visualHpFrac.keys()) {
      if (!world.units.has(id)) visualHpFrac.delete(id);
    }
    for (const id of lastMoveGoal.keys()) {
      if (!world.units.has(id)) lastMoveGoal.delete(id);
    }
  }

  // Design §3.5: scale-to-zero + fade over ~300ms, then dispose. Called by
  // sceneView.sync (its one allowed edit this slice) instead of disposing
  // the Group immediately on unit removal. Body/disc/ring/prop materials are
  // SHARED across every unit of a given type/faction (view/unitView.js's
  // cache) so they must never be faded or disposed here — only the group's
  // own `scale` (always per-instance) and the per-unit ("ownedMaterial") HP
  // sprite materials are touched.
  function playDeath(group) {
    group.traverse((obj) => {
      if (obj.userData && obj.userData.ownedMaterial && obj.material) {
        obj.material.transparent = true;
      }
    });
    deathAnims.push({ group, elapsed: 0, startScale: group.scale.x || 1 });
  }

  function updateDeathAnims(dt) {
    for (let i = deathAnims.length - 1; i >= 0; i--) {
      const anim = deathAnims[i];
      anim.elapsed += dt;
      const t = Math.min(1, anim.elapsed / DEATH_FADE_S);
      const scale = anim.startScale * (1 - t);
      anim.group.scale.setScalar(scale);
      anim.group.traverse((obj) => {
        if (obj.userData && obj.userData.ownedMaterial && obj.material) {
          obj.material.opacity = 1 - t;
        }
      });
      if (t >= 1) {
        if (anim.group.parent) anim.group.parent.remove(anim.group);
        disposeOwnedMaterials(anim.group);
        deathAnims.splice(i, 1);
      }
    }
  }

  // `update(dt, world, unitGroups)` — called once per rAF frame from
  // core/loop.js, after sceneView.sync (architecture §4.3). `world` and
  // `unitGroups` (sceneView's unitId->Group map) are needed to drive the HP
  // tween, move markers, and attack rings off current sim state.
  function update(dt, world, unitGroups) {
    clock += dt;
    updateDeathAnims(dt);
    updateMoveMarkers(dt);
    if (world) {
      detectMoveOrders(world);
      updateAttackRings(world);
      if (unitGroups) updateHpTweens(dt, world, unitGroups);
    }
  }

  return { update, playDeath };
}

export default { createEffects };
