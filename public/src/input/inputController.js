// input/inputController.js — DOM listeners -> orders (§4.5); box-select rectangle; cursor states
//
// Owns the canvas selection/order listeners (left click/drag select,
// right-click move-or-attack). Camera pan/zoom listeners live in
// view/camera.js instead (see that file's header) — this module only
// translates raw mouse events into sim/orders.js calls, via picker.js for
// all raycasting. No order-resolution logic lives here beyond picking
// faction/hp off the already-resolved hit — the actual move-vs-attack
// branch is sim/orders.js's pure `resolveRightClick`.
import * as THREE from 'three';
import { selectOnly, clearSelection, selectInBox, resolveRightClick } from '../sim/orders.js';
import { GROUND_Y } from '../view/unitView.js';

const DRAG_THRESHOLD_PX = 5; // design §4.1 "left click + drag (>=5px movement)"

function createBoxElement() {
  const el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.border = '1px solid #F5E663'; // design §7.1 selection-ring color
  el.style.background = 'rgba(245, 230, 99, 0.15)';
  el.style.pointerEvents = 'none';
  el.style.zIndex = '2';
  document.body.appendChild(el);
  return el;
}

function updateBoxElement(el, x1, y1, x2, y2) {
  el.style.left = `${Math.min(x1, x2)}px`;
  el.style.top = `${Math.min(y1, y2)}px`;
  el.style.width = `${Math.abs(x2 - x1)}px`;
  el.style.height = `${Math.abs(y2 - y1)}px`;
}

// Projects a world XZ point (at ground height — assumption: close enough to
// "the model" for box-select purposes at this camera distance/pitch; see
// coding-agent report) to page (clientX/clientY) coordinates, for comparing
// against the screen-space drag rectangle built from raw mouse events.
// Returns null if the point projects behind the camera.
function projectToScreen(point, camera, rect) {
  const v = new THREE.Vector3(point.x, GROUND_Y, point.z);
  v.project(camera);
  if (v.z > 1) return null; // behind the camera / far plane
  return {
    x: rect.left + ((v.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - v.y) / 2) * rect.height,
  };
}

// init({ canvas, world, camera, picker }) — camera is the raw THREE.Camera
// (for screen projection in box-select), picker is input/picker.js's
// { rayFromEvent } instance.
export function init({ canvas, world, camera, picker }) {
  let dragStart = null; // { x, y } in page/client coords, set on left mousedown
  let isDragging = false;
  let boxEl = null;

  function setCursor(cls) {
    canvas.classList.remove('cursor-move', 'cursor-attack');
    if (cls) canvas.classList.add(cls);
  }

  // Cursor feedback states (design §4.3): only informative when there's an
  // active selection that could act on what's under the pointer.
  function updateHoverCursor(event) {
    if (world.selection.size === 0) {
      setCursor(null);
      return;
    }
    const { hitUnitId } = picker.rayFromEvent(event);
    if (hitUnitId != null) {
      const target = world.units.get(hitUnitId);
      if (target && target.faction === 'enemy' && target.hp > 0) {
        setCursor('cursor-attack');
        return;
      }
    }
    setCursor('cursor-move');
  }

  function onMouseDown(event) {
    if (event.button !== 0) return; // left only; right handled via contextmenu below
    dragStart = { x: event.clientX, y: event.clientY };
    isDragging = false;
  }

  function onMouseMove(event) {
    if (dragStart) {
      const dx = event.clientX - dragStart.x;
      const dy = event.clientY - dragStart.y;
      if (!isDragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        isDragging = true;
        boxEl = createBoxElement();
      }
      if (isDragging) {
        updateBoxElement(boxEl, dragStart.x, dragStart.y, event.clientX, event.clientY);
        return; // skip hover-cursor raycast while box-selecting
      }
    }
    updateHoverCursor(event);
  }

  function onMouseUp(event) {
    if (event.button !== 0 || !dragStart) return;

    if (!isDragging) {
      // Left down->up, moved <5px (design §4.1).
      const { hitUnitId } = picker.rayFromEvent(event);
      const unit = hitUnitId != null ? world.units.get(hitUnitId) : null;
      if (unit && unit.faction === 'player' && unit.hp > 0) {
        selectOnly(world, hitUnitId);
      } else {
        // empty ground / obstacle / enemy — enemies are not left-selectable
        clearSelection(world);
      }
    } else {
      // Left drag >=5px: box-select every player unit whose world position
      // projects inside the screen-space rectangle (design §4.1).
      const rect = canvas.getBoundingClientRect();
      const x1 = Math.min(dragStart.x, event.clientX);
      const x2 = Math.max(dragStart.x, event.clientX);
      const y1 = Math.min(dragStart.y, event.clientY);
      const y2 = Math.max(dragStart.y, event.clientY);

      const ids = [];
      for (const [id, unit] of world.units) {
        if (unit.faction !== 'player' || unit.hp <= 0) continue;
        const screen = projectToScreen(unit.pos, camera, rect);
        if (screen && screen.x >= x1 && screen.x <= x2 && screen.y >= y1 && screen.y <= y2) {
          ids.push(id);
        }
      }
      selectInBox(world, ids);

      if (boxEl) {
        boxEl.remove();
        boxEl = null;
      }
    }

    dragStart = null;
    isDragging = false;
  }

  function onContextMenu(event) {
    event.preventDefault(); // always suppress the browser menu (design §4.1/architecture §4.5)
    const pick = picker.rayFromEvent(event);
    resolveRightClick(world, [...world.selection], pick); // no-op internally if selection is empty
  }

  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', onContextMenu);

  function dispose() {
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('contextmenu', onContextMenu);
    if (boxEl) boxEl.remove();
  }

  return { dispose };
}

export default { init };
