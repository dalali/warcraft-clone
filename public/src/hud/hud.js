// hud/hud.js — reconcile DOM HUD (status, selection panel, overlay) from
// world state (architecture §4.7, design §1.3/§2/§6). READ-ONLY over
// `world`: this module never mutates sim state (no selection changes, no
// orders) — all input happens in the 3D canvas via input/inputController.js.
// No Three, no sim imports — DOM only.

const MAX_SLOTS = 6; // design §2/§8.9 — matches the hard roster cap per side

const TYPE_ICON = { melee: 'M', ranged: 'R' };

function formatStatus(aliveEnemies, startEnemies, alivePlayers, startPlayers) {
  return `Enemies: ${aliveEnemies}/${startEnemies}   Your Units: ${alivePlayers}/${startPlayers}`;
}

// `createHud({ world })` captures starting per-faction counts at
// construction time (main.js builds the HUD right after spawning the
// roster, before the loop starts) and returns `{ sync(world) }` for
// core/loop.js to call once per frame, after sceneView.sync/effects.update
// (architecture §4.3).
export function createHud({ world }) {
  const statusEl = document.getElementById('status-readout');
  const panelEl = document.getElementById('selection-panel');
  const overlayEl = document.getElementById('end-state-overlay');
  const headlineEl = overlayEl ? overlayEl.querySelector('.headline') : null;
  const subtextEl = overlayEl ? overlayEl.querySelector('.subtext') : null;

  let startEnemies = 0;
  let startPlayers = 0;
  for (const unit of world.units.values()) {
    if (unit.faction === 'enemy') startEnemies++;
    else if (unit.faction === 'player') startPlayers++;
  }

  // Build a fixed pool of up to MAX_SLOTS slot elements once, replacing
  // index.html's single static example slot, and show/hide them per frame
  // rather than re-creating DOM nodes every sync.
  const slots = [];
  if (panelEl) {
    panelEl.innerHTML = '';
    for (let i = 0; i < MAX_SLOTS; i++) {
      const slot = document.createElement('div');
      slot.className = 'unit-slot hidden';

      const portrait = document.createElement('div');
      portrait.className = 'portrait';

      const hpBar = document.createElement('div');
      hpBar.className = 'hp-bar';
      const hpFill = document.createElement('div');
      hpFill.className = 'hp-fill';
      hpBar.appendChild(hpFill);

      slot.appendChild(portrait);
      slot.appendChild(hpBar);
      panelEl.appendChild(slot);
      slots.push({ slot, portrait, hpFill });
    }
  }

  function syncStatus(world) {
    if (!statusEl) return;
    let aliveEnemies = 0;
    let alivePlayers = 0;
    for (const unit of world.units.values()) {
      if (unit.hp <= 0) continue;
      if (unit.faction === 'enemy') aliveEnemies++;
      else if (unit.faction === 'player') alivePlayers++;
    }
    statusEl.textContent = formatStatus(aliveEnemies, startEnemies, alivePlayers, startPlayers);
  }

  function syncSelectionPanel(world) {
    if (!panelEl) return;
    const selectedIds = [...world.selection].slice(0, MAX_SLOTS);

    if (selectedIds.length === 0) {
      panelEl.classList.add('hidden');
      for (const { slot } of slots) slot.classList.add('hidden');
      return;
    }

    panelEl.classList.remove('hidden');
    selectedIds.forEach((id, i) => {
      const unit = world.units.get(id);
      const { slot, portrait, hpFill } = slots[i];
      if (!unit) {
        slot.classList.add('hidden');
        return;
      }
      slot.classList.remove('hidden');
      slot.dataset.faction = unit.faction;
      slot.dataset.type = unit.type;
      portrait.textContent = TYPE_ICON[unit.type] || '?';
      const frac = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
      hpFill.style.width = `${frac * 100}%`;
    });
    for (let i = selectedIds.length; i < slots.length; i++) {
      slots[i].slot.classList.add('hidden');
    }
  }

  function syncOverlay(world) {
    if (!overlayEl) return;
    if (world.endState === 'win') {
      overlayEl.classList.remove('hidden');
      if (headlineEl) {
        headlineEl.textContent = 'VICTORY';
        headlineEl.classList.remove('defeat');
        headlineEl.classList.add('victory');
      }
      if (subtextEl) subtextEl.textContent = 'All enemy forces destroyed.';
    } else if (world.endState === 'lose') {
      overlayEl.classList.remove('hidden');
      if (headlineEl) {
        headlineEl.textContent = 'DEFEAT';
        headlineEl.classList.remove('victory');
        headlineEl.classList.add('defeat');
      }
      if (subtextEl) subtextEl.textContent = 'Your forces have been wiped out.';
    } else {
      overlayEl.classList.add('hidden');
    }
  }

  function sync(world) {
    syncStatus(world);
    syncSelectionPanel(world);
    syncOverlay(world);
  }

  sync(world);
  return { sync };
}

export default { createHud };
