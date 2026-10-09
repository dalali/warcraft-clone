// input/picker.js — raycaster: event -> { hitUnitId, groundPoint } (architecture §4.5)
//
// The ONLY place raycasting lives. Thin Three-aware wrapper with no order
// resolution logic — that is pure and lives in sim/orders.js (resolveRightClick),
// which can be fed a synthetic { hitUnitId, groundPoint } in tests with no
// Three/DOM involved at all.
import * as THREE from 'three';
import { GROUND_Y } from '../view/unitView.js';

// `unitGroups` is the live Map<unitId, THREE.Group> owned by view/sceneView.js
// (passed by reference, so it stays current as units spawn/die — no need to
// re-create the picker when the roster changes).
export function createPicker({ canvas, camera, unitGroups, groundY = GROUND_Y }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  // Ground is flat (architecture §4.2), so a single horizontal plane at
  // y = groundY is all the "terrain" raycast needs.
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
  const groundHit = new THREE.Vector3();

  function setNdcFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  // event -> { hitUnitId: number|null, groundPoint: {x,z}|null }
  function rayFromEvent(event) {
    setNdcFromEvent(event);
    raycaster.setFromCamera(ndc, camera);

    let hitUnitId = null;
    const meshes = [];
    for (const group of unitGroups.values()) {
      group.traverse((obj) => {
        if (obj.isMesh) meshes.push(obj);
      });
    }
    const unitHits = raycaster.intersectObjects(meshes, false);
    if (unitHits.length > 0) {
      // Walk up from the hit mesh (body/prop/disc/ring) to the owning
      // Group, which carries userData.unitId (view/sceneView.js §4.7).
      let obj = unitHits[0].object;
      while (obj && obj.userData.unitId == null) obj = obj.parent;
      if (obj) hitUnitId = obj.userData.unitId;
    }

    let groundPoint = null;
    const hit = raycaster.ray.intersectPlane(groundPlane, groundHit);
    if (hit) groundPoint = { x: hit.x, z: hit.z };

    return { hitUnitId, groundPoint };
  }

  return { rayFromEvent };
}

export default { createPicker };
