// view/cameraMath.js — pure trig for the camera's ground-footprint, split out
// of camera.js so it can be unit-tested without pulling in `three` (which is
// only resolvable via the browser import map, not under `node --test`).
//
// The camera is fixed-pitch/fixed-yaw and looks at a ground point (the pan
// target) from `distance` away, tilted `pitchDeg` below horizontal. Its
// visible frustum intersects the ground (XZ) plane in a trapezoid: the far
// edge (shallower viewing angle) lands farther from the look-at point and is
// wider than the near edge, because of perspective + the oblique pitch. To
// guarantee panning never reveals the void beyond the map edge, camera.js
// needs the WORST-CASE half-extents of that trapezoid around the look-at
// point, so it can inset the pan-clamp bounds by that amount.
export const DEG_TO_RAD = Math.PI / 180;

// Guards the frustum math against grazing/near-horizon angles (pitch at or
// below the vertical half-FOV would send the far edge to the horizon, i.e.
// infinite ground distance). Clamping the angle to this floor instead turns
// "infinite" into "very large", which safely trips the lo > hi fallback
// (clamp-to-center) in camera.js rather than producing NaN/Infinity.
const MIN_GRAZING_ANGLE_RAD = 0.001;

// Returns the half-width (X) and half-depth (Z) of the camera's ground
// footprint around its look-at point, for the given straight-line camera
// `distance`, downward `pitchDeg`, vertical `fovDeg`, and viewport `aspect`
// (width/height). Both values are the WORST-CASE (largest) extent on their
// axis, so clamping the look-at point to stay this far from the map edge
// guarantees the full footprint stays on the map.
export function footprintInsets({ distance, pitchDeg, fovDeg, aspect }) {
  const pitch = pitchDeg * DEG_TO_RAD;
  const halfFovY = (fovDeg * DEG_TO_RAD) / 2;
  const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);

  const groundHeight = distance * Math.sin(pitch); // camera height above y=0

  // Near edge (bottom of screen) looks steeper than the center ray; far edge
  // (top of screen) looks shallower — both measured as an angle below
  // horizontal. Clamp away from 0 so a shallow far angle never divides out.
  const nearAngle = pitch + halfFovY;
  const farAngle = Math.max(pitch - halfFovY, MIN_GRAZING_ANGLE_RAD);

  // Ground distance (along the view's forward direction) from directly below
  // the camera to where each ray hits y=0.
  const centerReach = groundHeight / Math.tan(pitch);
  const nearReach = groundHeight / Math.tan(nearAngle);
  const farReach = groundHeight / Math.tan(farAngle);

  const halfDepthNear = centerReach - nearReach;
  const halfDepthFar = farReach - centerReach;
  const halfD = Math.max(halfDepthNear, halfDepthFar);

  // Width at the far edge (the widest row of the trapezoid, by perspective).
  // depthFar is the far ground point's distance along the camera's optical
  // (forward) axis — not the same as farReach, which is measured along the
  // ground — derived from the far ray's slant range times cos(halfFovY).
  const farSlantRange = groundHeight / Math.sin(farAngle);
  const depthFar = farSlantRange * Math.cos(halfFovY);
  const halfW = depthFar * Math.tan(halfFovX);

  return { halfW, halfD };
}
