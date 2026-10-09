// view/unitView.js — build/update one unit Group: body silhouette, faction
// disc, selection ring, billboarded HP sprite (architecture §4.7, design §3.1-§3.4)
import * as THREE from 'three';

export const GROUND_Y = 0;

const FACTION_COLOR = {
  player: 0x3b82c4, // design §7.1 "Player faction"
  enemy: 0xc0472b, // design §7.1 "Enemy faction"
};
const SELECTION_RING_COLOR = 0xf5e663; // design §7.1 "Selection ring"
const HP_BG_COLOR = 0x10131a;
const HP_HEALTHY = 0x4caf50;
const HP_WOUNDED = 0xe0b23a;
const HP_CRITICAL = 0xd9453d;

// --- shared geometry/material cache -------------------------------------
// Built once and reused across every unit Group in the game (there are only
// two unit types and two factions, so the cache never grows past a handful
// of entries). These are intentionally NEVER disposed per-unit — disposing a
// geometry/material that other live units still reference would break their
// rendering too. Only truly per-unit resources (the HP-bar sprite materials
// below, whose color/scale is unique per unit) are tagged
// `userData.ownedMaterial = true` and disposed by sceneView.js when a unit
// leaves the world.
const geometryCache = {};
const materialCache = {};

function cachedGeometry(key, build) {
  if (!geometryCache[key]) geometryCache[key] = build();
  return geometryCache[key];
}
function cachedMaterial(key, build) {
  if (!materialCache[key]) materialCache[key] = build();
  return materialCache[key];
}

// Melee: short & wide capsule ("bulkier" silhouette, design §3.2).
const MELEE_RADIUS = 0.35;
const MELEE_LENGTH = 0.3;
const MELEE_HEIGHT = MELEE_LENGTH + MELEE_RADIUS * 2;

// Ranged: tall & narrow capsule (design §3.2).
const RANGED_RADIUS = 0.22;
const RANGED_LENGTH = 0.9;
const RANGED_HEIGHT = RANGED_LENGTH + RANGED_RADIUS * 2;

function bodyHeightFor(type) {
  return type === 'melee' ? MELEE_HEIGHT : RANGED_HEIGHT;
}

function bodyGeometry(type) {
  return type === 'melee'
    ? cachedGeometry('body-melee', () => new THREE.CapsuleGeometry(MELEE_RADIUS, MELEE_LENGTH, 4, 8))
    : cachedGeometry('body-ranged', () => new THREE.CapsuleGeometry(RANGED_RADIUS, RANGED_LENGTH, 4, 8));
}

function bodyMaterial(faction) {
  return cachedMaterial(`body-${faction}`, () => new THREE.MeshStandardMaterial({ color: FACTION_COLOR[faction] }));
}

// Secondary silhouette cue (design §3.2): melee carries a stubby side
// "shield" prop at hip height; ranged carries a thin forward "bow/staff"
// prop extending past the body outline.
function propGeometry(type) {
  return type === 'melee'
    ? cachedGeometry('prop-melee', () => new THREE.BoxGeometry(0.12, 0.35, 0.3))
    : cachedGeometry('prop-ranged', () => new THREE.BoxGeometry(0.06, 0.06, 0.9));
}

function propMaterial() {
  return cachedMaterial('prop', () => new THREE.MeshStandardMaterial({ color: 0x3a3a3a }));
}

function discGeometry() {
  return cachedGeometry('disc', () => new THREE.CircleGeometry(0.55, 16));
}

function discMaterial(faction) {
  return cachedMaterial(`disc-${faction}`, () => new THREE.MeshBasicMaterial({ color: FACTION_COLOR[faction] }));
}

function ringGeometry() {
  return cachedGeometry('ring', () => new THREE.RingGeometry(0.6, 0.72, 24));
}

function ringMaterial() {
  return cachedMaterial(
    'ring',
    () => new THREE.MeshBasicMaterial({ color: SELECTION_RING_COLOR, side: THREE.DoubleSide })
  );
}

// Design §3.4 HP fill color thresholds. Slice 5 animates the transition
// between these (a ~150ms tween); slice 3 just sets the color statically
// per frame based on current hp.
function hpColorForFraction(frac) {
  if (frac > 0.6) return HP_HEALTHY;
  if (frac > 0.25) return HP_WOUNDED;
  return HP_CRITICAL;
}

// Builds one unit's Group: body + type prop, faction ground disc, selection
// ring (hidden by default), and a billboarded HP bar (two plain-colored
// Sprites — background + fill — rather than a canvas texture, since a flat
// color is all the MVP needs and Sprites already billboard for free).
export function buildUnitGroup(unit) {
  const group = new THREE.Group();
  group.userData.unitId = unit.id;

  const bodyHeight = bodyHeightFor(unit.type);

  const body = new THREE.Mesh(bodyGeometry(unit.type), bodyMaterial(unit.faction));
  body.position.y = bodyHeight / 2;
  group.add(body);

  const prop = new THREE.Mesh(propGeometry(unit.type), propMaterial());
  if (unit.type === 'melee') {
    prop.position.set(0.3, bodyHeight * 0.55, 0); // offset to one side at hip height
  } else {
    prop.position.set(0, bodyHeight * 0.55, 0.3); // held forward, past the body outline
  }
  group.add(prop);

  const disc = new THREE.Mesh(discGeometry(), discMaterial(unit.faction));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.01; // just above ground to avoid z-fighting
  group.add(disc);

  const ring = new THREE.Mesh(ringGeometry(), ringMaterial());
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.visible = false;
  group.add(ring);
  group.userData.ring = ring;

  const hpGroup = new THREE.Group();
  hpGroup.position.y = bodyHeight + 0.35;

  const hpFullWidth = 0.84;
  const hpBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: HP_BG_COLOR, depthTest: false }));
  hpBg.userData.ownedMaterial = true; // per-unit — disposed on removal (see sceneView.js)
  hpBg.scale.set(hpFullWidth + 0.06, 0.14, 1);
  hpGroup.add(hpBg);

  const hpFill = new THREE.Sprite(new THREE.SpriteMaterial({ color: HP_HEALTHY, depthTest: false }));
  hpFill.userData.ownedMaterial = true; // per-unit — color/scale unique per unit
  hpFill.scale.set(hpFullWidth, 0.09, 1);
  hpGroup.add(hpFill);

  group.add(hpGroup);
  group.userData.hpFill = hpFill;
  group.userData.hpFullWidth = hpFullWidth;

  updateUnitGroup(group, unit, new Set());
  return group;
}

// Reconciles an existing Group to the current unit state + selection set
// (architecture §4.7): position, HP-fill size/color, selection-ring
// visibility. Faction/type are static per unit and never change after spawn,
// so they are set once in buildUnitGroup and left alone here.
export function updateUnitGroup(group, unit, selection) {
  group.position.set(unit.pos.x, GROUND_Y, unit.pos.z);

  const ring = group.userData.ring;
  if (ring) ring.visible = selection.has(unit.id);

  const hpFill = group.userData.hpFill;
  if (hpFill) {
    const frac = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
    const fullWidth = group.userData.hpFullWidth;
    hpFill.scale.x = fullWidth * frac;
    // A Sprite scales about its own center, so re-offset the fill so it
    // depletes from the right edge (left-anchored bar) rather than shrinking
    // symmetrically from the middle.
    hpFill.position.x = -(fullWidth - hpFill.scale.x) / 2;
    hpFill.material.color.setHex(hpColorForFraction(frac));
  }
}

export default { buildUnitGroup, updateUnitGroup, GROUND_Y };
