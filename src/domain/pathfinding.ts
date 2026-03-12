import { WORLD_GRID_COLUMNS, WORLD_GRID_ROWS } from "./constants.ts";
import type { CellCoord } from "./types.ts";

/**
 * A* pathfinding on the world grid (8-directional movement).
 * Returns cells from start (exclusive) to goal (inclusive),
 * or empty array if no path exists or start === goal.
 */
export function findPath(
  start: CellCoord,
  goal: CellCoord,
  blocked: ReadonlySet<string>,
  maxLength: number = WORLD_GRID_COLUMNS + WORLD_GRID_ROWS
): CellCoord[] {
  if (start.x === goal.x && start.y === goal.y) return [];
  if (blocked.has(`${goal.x}:${goal.y}`)) return [];

  const cols = WORLD_GRID_COLUMNS;
  const rows = WORLD_GRID_ROWS;

  // Chebyshev distance heuristic (admissible for 8-directional)
  const heuristic = (x: number, y: number) =>
    Math.max(Math.abs(x - goal.x), Math.abs(y - goal.y));

  // Node storage: flat index = y * cols + x
  const size = cols * rows;
  const gScore = new Float64Array(size).fill(Infinity);
  const fScore = new Float64Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);

  const startIdx = start.y * cols + start.x;
  gScore[startIdx] = 0;
  fScore[startIdx] = heuristic(start.x, start.y);

  // Min-heap (binary heap) of [fScore, index]
  const heap: Array<[number, number]> = [[fScore[startIdx], startIdx]];

  // 8-directional neighbors: dx, dy, cost
  const DX = [0, 1, 1, 1, 0, -1, -1, -1];
  const DY = [-1, -1, 0, 1, 1, 1, 0, -1];
  const COST = [1, 1.414, 1, 1.414, 1, 1.414, 1, 1.414];

  const goalIdx = goal.y * cols + goal.x;

  while (heap.length > 0) {
    // Pop min
    const [, currentIdx] = heapPop(heap);
    if (currentIdx === goalIdx) break;
    if (closed[currentIdx]) continue;
    closed[currentIdx] = 1;

    const cx = currentIdx % cols;
    const cy = (currentIdx - cx) / cols;
    const currentG = gScore[currentIdx];

    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;

      const nIdx = ny * cols + nx;
      if (closed[nIdx]) continue;
      if (blocked.has(`${nx}:${ny}`)) continue;

      const tentativeG = currentG + COST[d];
      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = currentIdx;
        gScore[nIdx] = tentativeG;
        const f = tentativeG + heuristic(nx, ny);
        fScore[nIdx] = f;
        heapPush(heap, [f, nIdx]);
      }
    }
  }

  // Reconstruct path
  if (cameFrom[goalIdx] === -1) return [];

  const path: CellCoord[] = [];
  let idx = goalIdx;
  while (idx !== startIdx) {
    const x = idx % cols;
    const y = (idx - x) / cols;
    path.push({ x, y });
    idx = cameFrom[idx];
    if (idx === -1) return []; // should not happen
  }
  path.reverse();

  // Truncate to maxLength
  if (path.length > maxLength) {
    return path.slice(0, maxLength);
  }

  return path;
}

// ── Simple binary min-heap ──

function heapPush(heap: Array<[number, number]>, item: [number, number]) {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent][0] <= heap[i][0]) break;
    [heap[parent], heap[i]] = [heap[i], heap[parent]];
    i = parent;
  }
}

function heapPop(heap: Array<[number, number]>): [number, number] {
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    const n = heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && heap[left][0] < heap[smallest][0]) smallest = left;
      if (right < n && heap[right][0] < heap[smallest][0]) smallest = right;
      if (smallest === i) break;
      [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
      i = smallest;
    }
  }
  return top;
}
