// sim/grid.js — bake walkability from map.json; world<->cell conversion; nearest-walkable (architecture §3.2, §3.5)

const DIRS_8 = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// Bake a boolean walkability grid from a map config (architecture §3.2).
// Every cell starts walkable; for each obstacle, every cell whose center lies
// within (obstacle.radius + 0.5 unit-footprint margin) is marked blocked.
export function bakeGrid(map) {
  const { width, height, tileSize, obstacles = [] } = map;
  const cells = new Array(width * height).fill(true);
  const grid = { width, height, tileSize, cells };

  for (const obstacle of obstacles) {
    const blockRadius = obstacle.radius + 0.5;
    const minCx = Math.max(0, Math.floor((obstacle.x - blockRadius) / tileSize));
    const maxCx = Math.min(width - 1, Math.floor((obstacle.x + blockRadius) / tileSize));
    const minCz = Math.max(0, Math.floor((obstacle.z - blockRadius) / tileSize));
    const maxCz = Math.min(height - 1, Math.floor((obstacle.z + blockRadius) / tileSize));

    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const center = cellToWorldCenter(grid, cx, cz);
        const dx = center.x - obstacle.x;
        const dz = center.z - obstacle.z;
        if (dx * dx + dz * dz <= blockRadius * blockRadius) {
          cells[cz * width + cx] = false;
        }
      }
    }
  }

  return grid;
}

export function worldToCell(grid, point) {
  return {
    cx: Math.floor(point.x / grid.tileSize),
    cz: Math.floor(point.z / grid.tileSize),
  };
}

export function cellToWorldCenter(grid, cx, cz) {
  return {
    x: (cx + 0.5) * grid.tileSize,
    z: (cz + 0.5) * grid.tileSize,
  };
}

export function isWalkable(grid, cx, cz) {
  if (cx < 0 || cx >= grid.width || cz < 0 || cz >= grid.height) return false;
  return grid.cells[cz * grid.width + cx] === true;
}

// Snaps a blocked/out-of-bounds point to the nearest walkable cell center
// (architecture §3.5). Points already on a walkable cell are returned as-is.
export function nearestWalkable(grid, point) {
  const { cx, cz } = worldToCell(grid, point);
  if (isWalkable(grid, cx, cz)) return point;

  const startCx = Math.min(Math.max(cx, 0), grid.width - 1);
  const startCz = Math.min(Math.max(cz, 0), grid.height - 1);

  const found = bfsNearestWalkable(grid, startCx, startCz);
  if (!found) return point; // whole grid blocked — nothing better to do
  return cellToWorldCenter(grid, found.cx, found.cz);
}

function bfsNearestWalkable(grid, startCx, startCz) {
  const { width, height } = grid;
  const visited = new Array(width * height).fill(false);
  const queue = [[startCx, startCz]];
  visited[startCz * width + startCx] = true;
  let qi = 0;

  while (qi < queue.length) {
    const [cx, cz] = queue[qi++];
    if (isWalkable(grid, cx, cz)) return { cx, cz };

    for (const [dx, dz] of DIRS_8) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
      const idx = nz * width + nx;
      if (visited[idx]) continue;
      visited[idx] = true;
      queue.push([nx, nz]);
    }
  }
  return null;
}

export default { bakeGrid, worldToCell, cellToWorldCenter, isWalkable, nearestWalkable };
