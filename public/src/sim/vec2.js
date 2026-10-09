// sim/vec2.js — {x,z} math helpers (add, sub, len, normalize, dist); pure, no Three/DOM (architecture §4.1)

export function add(a, b) {
  return { x: a.x + b.x, z: a.z + b.z };
}

export function sub(a, b) {
  return { x: a.x - b.x, z: a.z - b.z };
}

export function scale(a, s) {
  return { x: a.x * s, z: a.z * s };
}

export function lenSq(a) {
  return a.x * a.x + a.z * a.z;
}

export function len(a) {
  return Math.sqrt(lenSq(a));
}

export function distSq(a, b) {
  return lenSq(sub(a, b));
}

export function dist(a, b) {
  return Math.sqrt(distSq(a, b));
}

export function normalize(a) {
  const l = len(a);
  if (l === 0) return { x: 0, z: 0 };
  return { x: a.x / l, z: a.z / l };
}

export default { add, sub, scale, len, lenSq, dist, distSq, normalize };
