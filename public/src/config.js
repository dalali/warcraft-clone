// config.js — fetch + parse + validate map.json / units.json (architecture §4.8, §8.2/§8.3)

import { bakeGrid, worldToCell, isWalkable } from './sim/grid.js';

const REQUIRED_MAP_KEYS = ['width', 'height', 'tileSize', 'players', 'enemies'];
const REQUIRED_UNIT_STAT_KEYS = [
  'maxHp', 'dmg', 'range', 'speed', 'attackInterval', 'aggroRadius', 'leashRange',
];

export function validateMapConfig(map) {
  const errors = [];
  if (!map || typeof map !== 'object') {
    return ['map config must be an object'];
  }

  for (const key of REQUIRED_MAP_KEYS) {
    if (!(key in map)) errors.push(`map config missing required key: ${key}`);
  }

  if (Array.isArray(map.players)) {
    if (map.players.length < 4 || map.players.length > 6) {
      errors.push(`map.players must have 4-6 entries, got ${map.players.length}`);
    }
  }
  if (Array.isArray(map.enemies)) {
    if (map.enemies.length < 4 || map.enemies.length > 6) {
      errors.push(`map.enemies must have 4-6 entries, got ${map.enemies.length}`);
    }
  }

  return errors;
}

export function validateUnitsConfig(units) {
  const errors = [];
  if (!units || typeof units !== 'object') {
    return ['units config must be an object'];
  }

  for (const typeName of ['melee', 'ranged']) {
    const stat = units[typeName];
    if (!stat) {
      errors.push(`units config missing type: ${typeName}`);
      continue;
    }
    for (const key of REQUIRED_UNIT_STAT_KEYS) {
      if (!(key in stat)) errors.push(`units.${typeName} missing key: ${key}`);
    }
  }

  return errors;
}

// Every spawn (player or enemy) must land inside the map bounds on a
// walkable cell (architecture §8.3 "fail loudly if malformed").
export function validateSpawns(map, grid) {
  const errors = [];
  const checkList = (list, label) => {
    if (!Array.isArray(list)) return;
    list.forEach((entry, i) => {
      const { cx, cz } = worldToCell(grid, entry);
      if (!isWalkable(grid, cx, cz)) {
        errors.push(`${label}[${i}] spawn at (${entry.x}, ${entry.z}) is out of bounds or not walkable`);
      }
    });
  };

  checkList(map.players, 'players');
  checkList(map.enemies, 'enemies');
  return errors;
}

// Pure validator — takes plain parsed objects, no fetch/DOM, so it is
// directly unit-testable with literal fixtures (architecture §4.8).
export function validateConfig(map, units) {
  const mapErrors = validateMapConfig(map);
  const unitErrors = validateUnitsConfig(units);

  // Spawn-bounds validation needs a baked grid, which needs valid
  // width/height/tileSize — skip it if those basics are already broken.
  let spawnErrors = [];
  if (mapErrors.length === 0) {
    const grid = bakeGrid(map);
    spawnErrors = validateSpawns(map, grid);
  }

  const errors = [...mapErrors, ...unitErrors, ...spawnErrors];
  if (errors.length > 0) {
    throw new Error(`Invalid game config:\n${errors.join('\n')}`);
  }

  return { map, units, grid: bakeGrid(map) };
}

// Thin browser wrapper — fetches the two JSON assets and validates them.
// Not unit-tested (needs `fetch`); the pure logic above is what's tested.
export async function loadConfig(baseUrl = '') {
  const [mapRes, unitsRes] = await Promise.all([
    fetch(`${baseUrl}/assets/map.json`),
    fetch(`${baseUrl}/assets/units.json`),
  ]);
  const map = await mapRes.json();
  const units = await unitsRes.json();
  return validateConfig(map, units);
}

export default { validateMapConfig, validateUnitsConfig, validateSpawns, validateConfig, loadConfig };
