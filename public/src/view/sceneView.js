// view/sceneView.js — scene, renderer, lights, ground, obstacles; reconcile
// unit Groups to world state (architecture §4.7)
import * as THREE from 'three';
import { buildUnitGroup, updateUnitGroup, GROUND_Y } from './unitView.js';

// design §7.1 obstacle colors
const OBSTACLE_COLOR = { tree: 0x2f4a33, rock: 0x8a8a85 };

// design §7.1: tree = dark-green cone-ish silhouette, rock = grey box,
// both sized by map.json's per-obstacle `radius`.
function buildObstacleMesh(obstacle) {
  const { type, radius } = obstacle;
  let mesh;
  if (type === 'tree') {
    const trunkHeight = radius * 2.2;
    const geometry = new THREE.ConeGeometry(radius * 0.8, trunkHeight, 8);
    mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: OBSTACLE_COLOR.tree }));
    mesh.position.y = trunkHeight / 2;
  } else {
    // rock (and defensively, any unrecognized obstacle type)
    const size = radius * 1.4;
    const geometry = new THREE.BoxGeometry(size, size, size);
    mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: OBSTACLE_COLOR.rock }));
    mesh.position.y = size / 2;
  }
  mesh.position.x = obstacle.x;
  mesh.position.z = obstacle.z;
  return mesh;
}

// Owns THREE.Scene + WebGLRenderer (rendering into the existing #game
// canvas), lights, ground, and static obstacle meshes. `sync(world)`
// reconciles a Map<unitId, THREE.Group> to `world.units` each frame
// (architecture §4.7) — this module never mutates sim state, only reads it.
export function createSceneView({ canvas, map, camera }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1f24);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);

  // design §7.3: one directional "sun" + flat ambient fill, no dynamic
  // time-of-day — simplest option that still gives units grounding shading.
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(map.width * 0.2, 40, map.height * 0.9);
  scene.add(sun);

  const worldWidth = map.width * map.tileSize;
  const worldHeight = map.height * map.tileSize;

  const groundColor = (map.ground && map.ground.color) || '#5A6B47';
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(worldWidth, worldHeight),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(groundColor) })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(worldWidth / 2, GROUND_Y, worldHeight / 2);
  scene.add(ground);

  for (const obstacle of map.obstacles || []) {
    scene.add(buildObstacleMesh(obstacle));
  }

  const unitGroups = new Map(); // unitId -> THREE.Group

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    if (camera) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }
  window.addEventListener('resize', resize);
  resize();

  // Reconciles `unitGroups` to `world.units` (architecture §4.7): build a
  // Group for any new unit id, update existing Groups in place, and hand
  // dead units' Groups off to `effects.playDeath` (design §3.5 scale-to-zero
  // + fade) instead of disposing them immediately. `effects` is optional so
  // existing callers/tests that don't care about the death fade still work
  // (falls back to an immediate scene.remove with no fade).
  function sync(world, effects) {
    for (const [id, unit] of world.units) {
      let group = unitGroups.get(id);
      if (!group) {
        group = buildUnitGroup(unit);
        unitGroups.set(id, group);
        scene.add(group);
      }
      updateUnitGroup(group, unit, world.selection);
    }

    for (const [id, group] of unitGroups) {
      if (!world.units.has(id)) {
        if (effects && effects.playDeath) {
          effects.playDeath(group);
        } else {
          scene.remove(group);
        }
        unitGroups.delete(id);
      }
    }
  }

  function dispose() {
    window.removeEventListener('resize', resize);
  }

  return { scene, renderer, sync, dispose, unitGroups };
}

export default { createSceneView };
