// main.js — bootstrap: fetch config -> build world -> build view -> start loop (architecture §4.8)
import { loadConfig } from './config.js';
import { createWorld, spawn } from './core/world.js';
import { start as startLoop } from './core/loop.js';
import { createCamera } from './view/camera.js';
import { createSceneView } from './view/sceneView.js';
import { createEffects } from './view/effects.js';
import { createHud } from './hud/hud.js';
import { createPicker } from './input/picker.js';
import { init as initInput } from './input/inputController.js';

async function boot() {
  const { map, units: unitStats, grid } = await loadConfig();

  const world = createWorld({ grid, map });

  for (const spec of map.players) {
    spawn(world, {
      faction: 'player',
      type: spec.type,
      x: spec.x,
      z: spec.z,
      stats: unitStats[spec.type],
    });
  }

  for (const spec of map.enemies) {
    // map.json §8.2: enemy entries may override aggroRadius/leashRange.
    const overrides = {};
    if (spec.aggroRadius != null) overrides.aggroRadius = spec.aggroRadius;
    if (spec.leashRange != null) overrides.leashRange = spec.leashRange;
    spawn(world, {
      faction: 'enemy',
      type: spec.type,
      x: spec.x,
      z: spec.z,
      stats: unitStats[spec.type],
      overrides,
    });
  }

  const canvas = document.getElementById('game');
  const worldWidth = map.width * map.tileSize;
  const worldHeight = map.height * map.tileSize;
  const target = { x: worldWidth / 2, z: worldHeight / 2 };
  const bounds = { minX: 0, maxX: worldWidth, minZ: 0, maxZ: worldHeight };
  const cameraController = createCamera({
    target,
    aspect: window.innerWidth / window.innerHeight,
    bounds,
    domElement: canvas,
  });
  const sceneView = createSceneView({ canvas, map, camera: cameraController.camera });
  const effects = createEffects({ scene: sceneView.scene });
  const hud = createHud({ world }); // captures starting Enemies/Your-Units counts (design §1.3)

  const picker = createPicker({ canvas, camera: cameraController.camera, unitGroups: sceneView.unitGroups });
  initInput({ canvas, world, camera: cameraController.camera, picker });

  startLoop({ world, camera: cameraController, sceneView, effects, hud });
}

boot().catch((err) => {
  console.error('Failed to boot warcraft-clone:', err);
});
