// test/cameraMath.test.js — footprint-inset math used by camera.js's pan
// clamp (design §7.3: "the visible frustum footprint never crosses the
// terrain edge"). Pure function, no `three` import, so it's testable here
// even though `three` itself only resolves via the browser import map.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { footprintInsets } from '../public/src/view/cameraMath.js';

const BASE = { pitchDeg: 55, fovDeg: 50, aspect: 16 / 9 };

test('returns finite, positive half-extents for typical camera params', () => {
  const { halfW, halfD } = footprintInsets({ distance: 60, ...BASE });
  assert.ok(Number.isFinite(halfW) && halfW > 0);
  assert.ok(Number.isFinite(halfD) && halfD > 0);
});

test('half-extents grow monotonically with distance', () => {
  const distances = [20, 40, 60, 80, 100];
  let prev = { halfW: 0, halfD: 0 };
  for (const distance of distances) {
    const cur = footprintInsets({ distance, ...BASE });
    assert.ok(cur.halfW > prev.halfW, `halfW should grow at distance=${distance}`);
    assert.ok(cur.halfD > prev.halfD, `halfD should grow at distance=${distance}`);
    prev = cur;
  }
});

test('wider aspect ratio widens halfW but leaves halfD unchanged', () => {
  const square = footprintInsets({ distance: 50, pitchDeg: 55, fovDeg: 50, aspect: 1 });
  const wide = footprintInsets({ distance: 50, pitchDeg: 55, fovDeg: 50, aspect: 2 });
  assert.ok(wide.halfW > square.halfW);
  assert.ok(Math.abs(wide.halfD - square.halfD) < 1e-9);
});

test('stays finite even at a grazing pitch/FOV combo (pitch <= half vertical FOV)', () => {
  const { halfW, halfD } = footprintInsets({ distance: 60, pitchDeg: 20, fovDeg: 50, aspect: 1 });
  assert.ok(Number.isFinite(halfW));
  assert.ok(Number.isFinite(halfD));
  assert.ok(halfW > 0 && halfD > 0);
});

test('a steeper (more top-down) pitch produces a smaller footprint than a shallow one', () => {
  const steep = footprintInsets({ distance: 60, pitchDeg: 80, fovDeg: 50, aspect: 1 });
  const shallow = footprintInsets({ distance: 60, pitchDeg: 40, fovDeg: 50, aspect: 1 });
  assert.ok(steep.halfD < shallow.halfD);
});

// Regression (QA): camera.js's MIN_DISTANCE/CAMERA_DISTANCE/MAX_DISTANCE used
// to be 20/60/100, which on the 48x48 map (half-width 24) meant halfW already
// exceeded 24 at the *tightest* allowed zoom (MIN_DISTANCE=20) at 16:9 —
// clampInset's lo>hi "clamp-to-center" fallback in camera.js fired at every
// zoom level, making keyboard pan a permanent no-op. These literals mirror
// the recalibrated constants in public/src/view/camera.js (not imported
// here — camera.js pulls in `three`, which doesn't resolve under
// `node --test`); if those constants change, update these literals too.
const MAP_HALF_WIDTH = 24; // 48x48 map, from createCamera's `bounds`
const RECALIBRATED = { MIN_DISTANCE: 10, CAMERA_DISTANCE: 15, MAX_DISTANCE: 19 };

test('recalibrated MAX_DISTANCE frames the whole map at 16:9 with no void', () => {
  const { halfW } = footprintInsets({ distance: RECALIBRATED.MAX_DISTANCE, ...BASE });
  assert.ok(halfW <= MAP_HALF_WIDTH, `halfW (${halfW}) must not exceed the map half-width`);
});

test('recalibrated MIN_DISTANCE and CAMERA_DISTANCE leave pan room on both axes at 16:9', () => {
  for (const distance of [RECALIBRATED.MIN_DISTANCE, RECALIBRATED.CAMERA_DISTANCE]) {
    const { halfW } = footprintInsets({ distance, ...BASE });
    assert.ok(halfW < MAP_HALF_WIDTH, `halfW (${halfW}) at distance=${distance} must leave pan room`);
  }
});
