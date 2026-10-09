// view/camera.js — fixed pitch/yaw PerspectiveCamera; core Three only, no OrbitControls (architecture §2.3)
//
// Slice 4: implements the dolly-zoom + clamped-pan controls that slice 3
// stubbed out. Rotation stays impossible — pitch and yaw are constants
// nothing in this module ever touches; the only two things that can change
// are `distance` (dolly zoom) and `panTarget` (the look-at point, dragged
// across the XZ plane and clamped to the map bounds). This module owns its
// own DOM listeners (wheel for zoom, keydown/keyup for WASD/arrow pan) —
// input/inputController.js only owns selection/order listeners, per the
// architecture §4.8 module split ("camera.js: dolly zoom + clamped pan").
import * as THREE from 'three';
import { footprintInsets, DEG_TO_RAD } from './cameraMath.js';

// Assumption (slice 3, carried forward): pitch 55° down from horizontal,
// vertical FOV 50°, fixed south-facing yaw.
//
// Recalibrated (QA regression fix, see footprintInsets in cameraMath.js):
// the ground footprint at pitch 55°/FOV 50° grows with distance, and on the
// 48x48 map (half-width 24) it crosses that half-width well before distance
// reaches the old default of 60 — e.g. footprintInsets(...).halfW is already
// ~24.6 at distance 20 on a 16:9 viewport. Past that point the pan-clamp
// inset's lo>hi fallback (clamp-to-center, see clampInset below) fires on
// every update, permanently zeroing keyboard pan. CAMERA_DISTANCE is the
// default/start distance and must leave visible pan room on both axes;
// MAX_DISTANCE is the "whole map + margin" zoomed-out limit, so its
// footprint is allowed to reach (but not exceed) the map half-width — at
// that zoom there's nothing beyond the map to pan to, so clamp-to-center is
// correct. MIN_DISTANCE is the tightest tactical zoom, well under both.
export const CAMERA_PITCH_DEG = 55;
export const CAMERA_DISTANCE = 15;
export const CAMERA_FOV = 50;

// Dolly-zoom clamps (design §7.3: "minimum distance keeps a unit at ~1/6
// viewport height"; "maximum distance is bounded by the map's own
// footprint"). Assumption (slice 4, no browser here to eyeball-tune): fixed
// constants rather than derived from map size — Phase 1 ships a single
// 48x48 map, and these values are chosen so footprintInsets(...).halfW at
// 16:9 stays strictly under the map half-width (24) at MIN_DISTANCE and
// CAMERA_DISTANCE (pan room on both axes) and at/just under it at
// MAX_DISTANCE (whole map framed, no void). QA can retune if a future map
// size makes these feel wrong.
export const MIN_DISTANCE = 10;
export const MAX_DISTANCE = 19;

// Pan speed for keyboard input (design §4.2), world units/second.
const PAN_SPEED = 20;

// How many world units the dolly moves per wheel "notch" of deltaY.
const ZOOM_SENSITIVITY = 0.05;

const PAN_KEYS = {
  arrowup: [0, -1], w: [0, -1],
  arrowdown: [0, 1], s: [0, 1],
  arrowleft: [-1, 0], a: [-1, 0],
  arrowright: [1, 0], d: [1, 0],
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function createCamera({
  target = { x: 24, z: 24 },
  aspect = 1,
  bounds = null, // { minX, maxX, minZ, maxZ } world-space pan clamp (design §7.3)
  domElement = typeof window !== 'undefined' ? window : null, // wheel listener target
} = {}) {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.1, 200);

  const panTarget = { x: target.x, z: target.z };
  let distance = CAMERA_DISTANCE;
  let currentAspect = aspect;
  const heldKeys = new Set();

  // Worst-case ground-footprint half-extents at the current distance/aspect
  // (design §7.3: "the visible frustum footprint never crosses the terrain
  // edge"). Recomputed whenever distance or aspect changes — see onWheel and
  // setAspect — so clampPanTarget always insets by the current footprint,
  // not the footprint at creation time.
  let insets = { halfW: 0, halfD: 0 };
  function updateInsets() {
    insets = footprintInsets({ distance, pitchDeg: CAMERA_PITCH_DEG, fovDeg: CAMERA_FOV, aspect: currentAspect });
  }

  // Clamps `value` to [min + half, max - half]; if the inset leaves an
  // inverted range (the footprint is larger than the map on this axis, e.g.
  // zoomed far out), there's no pan position that avoids the void, so fall
  // back to centering instead of producing a nonsensical clamp.
  function clampInset(value, min, max, half) {
    const lo = min + half;
    const hi = max - half;
    if (lo > hi) return (min + max) / 2;
    return clamp(value, lo, hi);
  }

  function clampPanTarget() {
    if (!bounds) return;
    panTarget.x = clampInset(panTarget.x, bounds.minX, bounds.maxX, insets.halfW);
    panTarget.z = clampInset(panTarget.z, bounds.minZ, bounds.maxZ, insets.halfD);
  }

  // Re-derives camera.position from the current panTarget + distance, with
  // pitch/yaw held constant — the only place position is ever written.
  function applyTransform() {
    const pitchRad = CAMERA_PITCH_DEG * DEG_TO_RAD;
    const offsetY = distance * Math.sin(pitchRad);
    const offsetZ = distance * Math.cos(pitchRad);
    camera.position.set(panTarget.x, offsetY, panTarget.z + offsetZ);
    camera.lookAt(panTarget.x, 0, panTarget.z);
  }

  updateInsets();
  clampPanTarget();
  applyTransform();

  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (key in PAN_KEYS) heldKeys.add(key);
  }
  function onKeyUp(event) {
    heldKeys.delete(event.key.toLowerCase());
  }
  function onWheel(event) {
    event.preventDefault();
    distance = clamp(distance + event.deltaY * ZOOM_SENSITIVITY, MIN_DISTANCE, MAX_DISTANCE);
    updateInsets();
    clampPanTarget();
    applyTransform();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }
  if (domElement) {
    domElement.addEventListener('wheel', onWheel, { passive: false });
  }

  // Wall-clock pan integration (architecture §4.3's `camera.update(elapsed)`
  // call). Zoom is applied immediately on wheel; only pan accumulates here.
  function update(dt) {
    let dx = 0;
    let dz = 0;
    for (const key of heldKeys) {
      const [kx, kz] = PAN_KEYS[key];
      dx += kx;
      dz += kz;
    }
    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz);
      panTarget.x += (dx / len) * PAN_SPEED * dt;
      panTarget.z += (dz / len) * PAN_SPEED * dt;
      clampPanTarget();
    }
    applyTransform();
  }

  function setAspect(nextAspect) {
    currentAspect = nextAspect;
    camera.aspect = nextAspect;
    camera.updateProjectionMatrix();
    updateInsets();
    clampPanTarget();
    applyTransform();
  }

  function dispose() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    }
    if (domElement) {
      domElement.removeEventListener('wheel', onWheel);
    }
  }

  return { camera, update, setAspect, dispose };
}

export default { createCamera, CAMERA_PITCH_DEG, CAMERA_DISTANCE, CAMERA_FOV, MIN_DISTANCE, MAX_DISTANCE };
