// core/loop.js — fixed-timestep accumulator driving world.update() (architecture §4.3)
//
// Pure orchestration: this file imports nothing from 'three' (architecture
// §4.1's golden rule applies to core/ too). The renderer/scene/camera are
// received through `ctx` and only ever have `.render()` / `.update()` /
// `.sync()` called on them here — they are constructed and owned by view/
// and main.js, never by this module.
import { update as worldUpdate } from './world.js';

export const SIM_HZ = 30;
export const DT = 1 / SIM_HZ;

// Kicks off the rAF loop exactly per architecture §4.3's pseudocode:
// accumulate wall-clock time (clamped to 0.25s to avoid a spiral of death
// after a tab-away), drain it in fixed DT sim steps, then do one render pass
// per rAF tick (camera update -> scene reconciliation -> cosmetic effects ->
// HUD reconciliation -> render).
export function start({ world, camera, sceneView, effects, hud }) {
  let accumulator = 0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);

    let elapsed = (now - last) / 1000;
    last = now;
    if (elapsed > 0.25) elapsed = 0.25; // clamp after tab-away; avoid spiral of death
    accumulator += elapsed;

    while (accumulator >= DT) {
      worldUpdate(world, DT); // pure sim: AI -> movement -> combat -> removeDead -> win/lose
      accumulator -= DT;
    }

    camera.update(elapsed); // wall-clock: pan/zoom input (slice 4)
    sceneView.sync(world, effects); // reconcile Three objects to world state; dead units hand off to effects.playDeath
    effects.update(elapsed, world, sceneView.unitGroups); // wall-clock: HP tweens, death fades, markers, attack rings (slice 5)
    if (hud) hud.sync(world); // DOM HUD reconciliation (slice 5)
    sceneView.renderer.render(sceneView.scene, camera.camera);
  }

  requestAnimationFrame(frame);
}

export default { start, SIM_HZ, DT };
