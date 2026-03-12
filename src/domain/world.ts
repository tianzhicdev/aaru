import {
  AGENT_MOVE_SPEED,
  BEHAVIOR_TICK_MIN,
  BEHAVIOR_TICK_MAX,
  CLUSTER_RANGE,
  CLUSTER_MIN_SIZE,
  DIRECTIONAL_PATH_MIN,
  DIRECTIONAL_PATH_MAX,
  DRIFT_POI_WEIGHT,
  DRIFT_SOCIAL_WEIGHT,
  GREEDY_JITTER_PROB,
  GREEDY_PATH_MIN,
  GREEDY_PATH_MAX,
  HEADING_CONTINUE_PROB,
  HEADING_DEVIATE_1_PROB,
  IDLE_DURATION_MIN,
  IDLE_DURATION_MAX,
  IDLE_WEIGHT,
  RETREAT_RANGE,
  RETREAT_MIN_CROWD,
  RETREAT_WEIGHT,
  WANDER_PATH_MAX,
  WANDER_PATH_MIN,
  WANDER_WEIGHT,
  WORLD_COOLDOWN_SECONDS,
  WORLD_GRID_COLUMNS,
  WORLD_GRID_ROWS,
  WORLD_POIS
} from "./constants.ts";
import type { AgentBehavior, AgentPosition, CellCoord, POI, WorldTickResult } from "./types.ts";

// ── Heading direction lookup: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW ──
const HEADING_DX = [0, 1, 1, 1, 0, -1, -1, -1];
const HEADING_DY = [-1, -1, 0, 1, 1, 1, 0, -1];

function clampCell(value: number, max: number): number {
  return Math.max(0, Math.min(max - 1, value));
}

export function cellCenter(cellX: number, cellY: number) {
  return {
    x: (cellX + 0.5) / WORLD_GRID_COLUMNS,
    y: (cellY + 0.5) / WORLD_GRID_ROWS
  };
}

function toCell(value: number, size: number) {
  return clampCell(Math.floor(value * size), size);
}

function currentCell(agent: AgentPosition) {
  return {
    x: agent.cell_x ?? toCell(agent.x, WORLD_GRID_COLUMNS),
    y: agent.cell_y ?? toCell(agent.y, WORLD_GRID_ROWS)
  };
}

function targetCell(agent: AgentPosition) {
  return {
    x: agent.target_cell_x ?? toCell(agent.target_x, WORLD_GRID_COLUMNS),
    y: agent.target_cell_y ?? toCell(agent.target_y, WORLD_GRID_ROWS)
  };
}

function occupancyKey(cellX: number, cellY: number) {
  return `${cellX}:${cellY}`;
}

function withCells(agent: AgentPosition, cellX: number, cellY: number, targetX: number, targetY: number): AgentPosition {
  const center = cellCenter(cellX, cellY);
  const target = cellCenter(targetX, targetY);
  return {
    ...agent,
    x: center.x,
    y: center.y,
    target_x: target.x,
    target_y: target.y,
    cell_x: cellX,
    cell_y: cellY,
    target_cell_x: targetX,
    target_cell_y: targetY
  };
}

function isAdjacent(a: AgentPosition, b: AgentPosition) {
  const { x: aX, y: aY } = currentCell(a);
  const { x: bX, y: bY } = currentCell(b);
  return Math.max(Math.abs(aX - bX), Math.abs(aY - bY)) === 1;
}

function allNeighborCells(cellX: number, cellY: number) {
  const cells = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      cells.push({
        x: clampCell(cellX + dx, WORLD_GRID_COLUMNS),
        y: clampCell(cellY + dy, WORLD_GRID_ROWS)
      });
    }
  }
  return cells.filter((cell, index, array) => array.findIndex((entry) => entry.x === cell.x && entry.y === cell.y) === index);
}

// ── Legacy random wander (kept for blocked-path fallback) ──

function generateWanderPath(startX: number, startY: number, occupied: Set<string>): CellCoord[] {
  const length = WANDER_PATH_MIN + Math.floor(Math.random() * (WANDER_PATH_MAX - WANDER_PATH_MIN + 1));
  const path: CellCoord[] = [];
  let cx = startX;
  let cy = startY;
  const localOccupied = new Set(occupied);

  for (let i = 0; i < length; i++) {
    const neighbors = allNeighborCells(cx, cy).filter(
      (cell) => !localOccupied.has(occupancyKey(cell.x, cell.y))
    );
    if (neighbors.length === 0) break;
    const next = neighbors[Math.floor(Math.random() * neighbors.length)];
    localOccupied.delete(occupancyKey(cx, cy));
    localOccupied.add(occupancyKey(next.x, next.y));
    path.push({ x: next.x, y: next.y });
    cx = next.x;
    cy = next.y;
  }

  return path;
}

// ── Directional wander (heading-biased, produces arcs not zigzags) ──

function wrapHeading(h: number): number {
  return ((h % 8) + 8) % 8;
}

export function pickRandomHeading(): number {
  return Math.floor(Math.random() * 8);
}

export function generateDirectionalPath(
  startX: number,
  startY: number,
  heading: number,
  occupied: Set<string>
): { path: CellCoord[]; finalHeading: number } {
  const length = DIRECTIONAL_PATH_MIN + Math.floor(Math.random() * (DIRECTIONAL_PATH_MAX - DIRECTIONAL_PATH_MIN + 1));
  const path: CellCoord[] = [];
  let cx = startX;
  let cy = startY;
  let h = heading;
  const localOccupied = new Set(occupied);

  for (let i = 0; i < length; i++) {
    // Pick heading deviation: 70% straight, 20% ±1, 10% ±2
    const roll = Math.random();
    let chosenHeading: number;
    if (roll < HEADING_CONTINUE_PROB) {
      chosenHeading = h;
    } else if (roll < HEADING_CONTINUE_PROB + HEADING_DEVIATE_1_PROB) {
      chosenHeading = wrapHeading(h + (Math.random() < 0.5 ? 1 : -1));
    } else {
      chosenHeading = wrapHeading(h + (Math.random() < 0.5 ? 2 : -2));
    }

    const dx = HEADING_DX[chosenHeading];
    const dy = HEADING_DY[chosenHeading];
    const nx = cx + dx;
    const ny = cy + dy;

    // Check bounds
    if (nx < 0 || nx >= WORLD_GRID_COLUMNS || ny < 0 || ny >= WORLD_GRID_ROWS) {
      // Bounce: reverse heading and try to continue
      h = wrapHeading(chosenHeading + 4);
      continue;
    }

    // Check occupancy
    if (localOccupied.has(occupancyKey(nx, ny))) {
      // Try neighbors as fallback
      const fallbackCandidates = [
        wrapHeading(chosenHeading + 1),
        wrapHeading(chosenHeading - 1),
        wrapHeading(chosenHeading + 2),
        wrapHeading(chosenHeading - 2)
      ];
      let found = false;
      for (const fb of fallbackCandidates) {
        const fbx = cx + HEADING_DX[fb];
        const fby = cy + HEADING_DY[fb];
        if (fbx >= 0 && fbx < WORLD_GRID_COLUMNS && fby >= 0 && fby < WORLD_GRID_ROWS &&
            !localOccupied.has(occupancyKey(fbx, fby))) {
          localOccupied.delete(occupancyKey(cx, cy));
          localOccupied.add(occupancyKey(fbx, fby));
          path.push({ x: fbx, y: fby });
          cx = fbx;
          cy = fby;
          h = fb;
          found = true;
          break;
        }
      }
      if (!found) break;
      continue;
    }

    localOccupied.delete(occupancyKey(cx, cy));
    localOccupied.add(occupancyKey(nx, ny));
    path.push({ x: nx, y: ny });
    cx = nx;
    cy = ny;
    h = chosenHeading;
  }

  return { path, finalHeading: h };
}

// ── Cluster detection + greedy pathfinding (Phase 2) ──

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function findNearestCluster(
  agents: AgentPosition[],
  selfId: string,
  range: number = CLUSTER_RANGE
): CellCoord | null {
  const self = agents.find((a) => a.user_id === selfId);
  if (!self) return null;
  const sc = currentCell(self);

  // Find non-busy agents within range (exclude self)
  const nearby = agents.filter((a) => {
    if (a.user_id === selfId) return false;
    if (a.state === "chatting" || a.state === "cooldown") return false;
    const c = currentCell(a);
    return chebyshev(sc.x, sc.y, c.x, c.y) <= range;
  });

  if (nearby.length < CLUSTER_MIN_SIZE) return null;

  // Simple approach: find the densest group — for each nearby agent, count how many
  // other nearby agents are within 3 cells of it (mini-cluster). Pick the one with
  // the most neighbors as the cluster center.
  let bestCenter: CellCoord | null = null;
  let bestCount = 0;

  for (const a of nearby) {
    const ac = currentCell(a);
    let count = 0;
    for (const b of nearby) {
      if (a.user_id === b.user_id) continue;
      const bc = currentCell(b);
      if (chebyshev(ac.x, ac.y, bc.x, bc.y) <= 3) count++;
    }
    if (count >= CLUSTER_MIN_SIZE - 1 && count > bestCount) {
      bestCount = count;
      bestCenter = ac;
    }
  }

  // Fallback: if no dense sub-cluster, return center of mass of all nearby
  if (!bestCenter && nearby.length >= CLUSTER_MIN_SIZE) {
    let sx = 0, sy = 0;
    for (const a of nearby) {
      const c = currentCell(a);
      sx += c.x;
      sy += c.y;
    }
    bestCenter = {
      x: Math.round(sx / nearby.length),
      y: Math.round(sy / nearby.length)
    };
  }

  return bestCenter;
}

export function findNearestPOI(
  pos: CellCoord,
  agents: AgentPosition[],
  pois: POI[] = WORLD_POIS
): POI | null {
  let best: POI | null = null;
  let bestDist = Infinity;

  for (const poi of pois) {
    // Count agents within POI radius
    let count = 0;
    for (const a of agents) {
      const c = currentCell(a);
      if (chebyshev(c.x, c.y, poi.x, poi.y) <= poi.radius) count++;
    }
    if (count >= poi.capacity) continue;

    const dist = chebyshev(pos.x, pos.y, poi.x, poi.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = poi;
    }
  }

  return best;
}

export function findCrowdCenter(
  agents: AgentPosition[],
  selfId: string,
  range: number = RETREAT_RANGE
): CellCoord | null {
  const self = agents.find((a) => a.user_id === selfId);
  if (!self) return null;
  const sc = currentCell(self);

  const nearby = agents.filter((a) => {
    if (a.user_id === selfId) return false;
    const c = currentCell(a);
    return chebyshev(sc.x, sc.y, c.x, c.y) <= range;
  });

  if (nearby.length < RETREAT_MIN_CROWD) return null;

  let sx = 0, sy = 0;
  for (const a of nearby) {
    const c = currentCell(a);
    sx += c.x;
    sy += c.y;
  }

  return {
    x: Math.round(sx / nearby.length),
    y: Math.round(sy / nearby.length)
  };
}

export function generateGreedyPath(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  occupied: Set<string>,
  away: boolean = false
): { path: CellCoord[]; finalHeading: number } {
  const length = GREEDY_PATH_MIN + Math.floor(Math.random() * (GREEDY_PATH_MAX - GREEDY_PATH_MIN + 1));
  const path: CellCoord[] = [];
  let cx = startX;
  let cy = startY;
  const localOccupied = new Set(occupied);

  for (let i = 0; i < length; i++) {
    const neighbors = allNeighborCells(cx, cy).filter(
      (cell) => !localOccupied.has(occupancyKey(cell.x, cell.y))
    );
    if (neighbors.length === 0) break;

    // Jitter: 20% chance to pick a random neighbor instead of greedy best
    let next: CellCoord;
    if (Math.random() < GREEDY_JITTER_PROB) {
      next = neighbors[Math.floor(Math.random() * neighbors.length)];
    } else {
      // Pick neighbor that minimizes (or maximizes if away) distance to target
      next = neighbors.reduce((best, cell) => {
        const bestDist = chebyshev(best.x, best.y, targetX, targetY);
        const cellDist = chebyshev(cell.x, cell.y, targetX, targetY);
        if (away) return cellDist > bestDist ? cell : best;
        return cellDist < bestDist ? cell : best;
      });
    }

    localOccupied.delete(occupancyKey(cx, cy));
    localOccupied.add(occupancyKey(next.x, next.y));
    path.push({ x: next.x, y: next.y });
    cx = next.x;
    cy = next.y;
  }

  // Compute final heading from last step direction
  let finalHeading = 0;
  if (path.length > 0) {
    const last = path[path.length - 1];
    const prevX = path.length > 1 ? path[path.length - 2].x : startX;
    const prevY = path.length > 1 ? path[path.length - 2].y : startY;
    const dx = last.x - prevX;
    const dy = last.y - prevY;
    // Map dx,dy to heading 0-7
    for (let h = 0; h < 8; h++) {
      if (HEADING_DX[h] === dx && HEADING_DY[h] === dy) {
        finalHeading = h;
        break;
      }
    }
  }

  return { path, finalHeading };
}

// ── Behavior selection ──

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function selectBehavior(
  agent: AgentPosition,
  allAgents?: AgentPosition[]
): { behavior: AgentBehavior; ticks: number; heading?: number } {
  // Don't re-select if ticks remaining
  if (agent.behavior && agent.behavior_ticks_remaining && agent.behavior_ticks_remaining > 0) {
    return {
      behavior: agent.behavior,
      ticks: agent.behavior_ticks_remaining,
      heading: agent.heading
    };
  }

  const total = WANDER_WEIGHT + IDLE_WEIGHT + DRIFT_SOCIAL_WEIGHT + DRIFT_POI_WEIGHT + RETREAT_WEIGHT;
  const roll = Math.random() * total;
  const heading = agent.heading ?? pickRandomHeading();

  let cumulative = WANDER_WEIGHT;
  if (roll < cumulative) {
    return { behavior: "wander", ticks: randomInt(BEHAVIOR_TICK_MIN, BEHAVIOR_TICK_MAX), heading };
  }

  cumulative += IDLE_WEIGHT;
  if (roll < cumulative) {
    return { behavior: "idle", ticks: randomInt(IDLE_DURATION_MIN, IDLE_DURATION_MAX) };
  }

  cumulative += DRIFT_SOCIAL_WEIGHT;
  if (roll < cumulative) {
    // Check if a valid cluster target exists; fallback to wander if not
    if (allAgents) {
      const cluster = findNearestCluster(allAgents, agent.user_id);
      if (cluster) {
        return { behavior: "drift_social", ticks: randomInt(BEHAVIOR_TICK_MIN, BEHAVIOR_TICK_MAX), heading };
      }
    }
    return { behavior: "wander", ticks: randomInt(BEHAVIOR_TICK_MIN, BEHAVIOR_TICK_MAX), heading };
  }

  cumulative += DRIFT_POI_WEIGHT;
  if (roll < cumulative) {
    if (allAgents) {
      const poi = findNearestPOI(currentCell(agent), allAgents);
      if (poi) {
        return { behavior: "drift_poi", ticks: randomInt(BEHAVIOR_TICK_MIN, BEHAVIOR_TICK_MAX), heading };
      }
    }
    return { behavior: "wander", ticks: randomInt(BEHAVIOR_TICK_MIN, BEHAVIOR_TICK_MAX), heading };
  }

  // retreat
  if (allAgents) {
    const crowd = findCrowdCenter(allAgents, agent.user_id);
    if (crowd) {
      return { behavior: "retreat", ticks: randomInt(BEHAVIOR_TICK_MIN, BEHAVIOR_TICK_MAX), heading };
    }
  }
  return { behavior: "wander", ticks: randomInt(BEHAVIOR_TICK_MIN, BEHAVIOR_TICK_MAX), heading };
}

// ── Movement ──

function advanceOnPath(agent: AgentPosition, occupied: Set<string>, allAgents?: AgentPosition[]): AgentPosition {
  const current = currentCell(agent);

  if (agent.state === "chatting") {
    return {
      ...withCells(agent, current.x, current.y, current.x, current.y),
      path: [], move_speed: 0, behavior: undefined, behavior_ticks_remaining: 0
    };
  }

  // Select or continue behavior
  const decision = selectBehavior(agent, allAgents);
  const ticksLeft = Math.max(0, decision.ticks - 1);

  // If behavior just changed (re-rolled), clear leftover path so the new behavior
  // generates a fresh path with its own heading/target instead of following stale waypoints
  const behaviorChanged = agent.behavior !== decision.behavior ||
    (!agent.behavior_ticks_remaining || agent.behavior_ticks_remaining <= 0);

  // ── Idle behavior: stay put ──
  if (decision.behavior === "idle") {
    return {
      ...withCells(agent, current.x, current.y, current.x, current.y),
      path: [],
      move_speed: 0,
      state: "idle",
      behavior: "idle",
      behavior_ticks_remaining: ticksLeft,
      heading: agent.heading
    };
  }

  // ── Movement behaviors: follow existing path or generate new one ──
  const path = behaviorChanged ? [] : (agent.path ?? []);
  let nextCell: CellCoord;
  let remainingPath: CellCoord[];
  let heading = decision.heading ?? agent.heading ?? pickRandomHeading();
  const behavior = decision.behavior;

  if (path.length > 0) {
    const candidate = path[0];
    if (occupied.has(occupancyKey(candidate.x, candidate.y))) {
      // Path blocked — regenerate based on behavior
      const regen = generatePathForBehavior(behavior, current, heading, occupied, agent.user_id, allAgents);
      if (regen.path.length === 0) {
        return {
          ...withCells(agent, current.x, current.y, current.x, current.y),
          path: [], move_speed: AGENT_MOVE_SPEED, state: "wandering",
          behavior, behavior_ticks_remaining: ticksLeft, heading
        };
      }
      nextCell = regen.path[0];
      remainingPath = regen.path.slice(1);
      heading = regen.finalHeading;
    } else {
      nextCell = candidate;
      remainingPath = path.slice(1);
    }
  } else {
    // Path exhausted — generate new path based on behavior
    const regen = generatePathForBehavior(behavior, current, heading, occupied, agent.user_id, allAgents);
    if (regen.path.length === 0) {
      // Fallback to legacy random wander
      const fallback = generateWanderPath(current.x, current.y, occupied);
      if (fallback.length === 0) {
        return {
          ...withCells(agent, current.x, current.y, current.x, current.y),
          path: [], move_speed: AGENT_MOVE_SPEED, state: "wandering",
          behavior, behavior_ticks_remaining: ticksLeft, heading
        };
      }
      nextCell = fallback[0];
      remainingPath = fallback.slice(1);
    } else {
      nextCell = regen.path[0];
      remainingPath = regen.path.slice(1);
      heading = regen.finalHeading;
    }
  }

  // Update occupancy
  const nextOccupied = new Set(occupied);
  nextOccupied.delete(occupancyKey(current.x, current.y));
  nextOccupied.add(occupancyKey(nextCell.x, nextCell.y));
  occupied.clear();
  for (const entry of nextOccupied) {
    occupied.add(entry);
  }

  return {
    ...withCells(agent, nextCell.x, nextCell.y, nextCell.x, nextCell.y),
    path: remainingPath,
    move_speed: AGENT_MOVE_SPEED,
    state: "wandering",
    behavior,
    behavior_ticks_remaining: ticksLeft,
    heading
  };
}

function generatePathForBehavior(
  behavior: AgentBehavior,
  current: CellCoord,
  heading: number,
  occupied: Set<string>,
  selfId: string,
  allAgents?: AgentPosition[]
): { path: CellCoord[]; finalHeading: number } {
  if (behavior === "drift_social" && allAgents) {
    const cluster = findNearestCluster(allAgents, selfId);
    if (cluster) {
      return generateGreedyPath(current.x, current.y, cluster.x, cluster.y, occupied);
    }
  }

  if (behavior === "drift_poi" && allAgents) {
    const poi = findNearestPOI(current, allAgents);
    if (poi) {
      return generateGreedyPath(current.x, current.y, poi.x, poi.y, occupied);
    }
  }

  if (behavior === "retreat" && allAgents) {
    const crowd = findCrowdCenter(allAgents, selfId);
    if (crowd) {
      return generateGreedyPath(current.x, current.y, crowd.x, crowd.y, occupied, true);
    }
  }

  // Default: directional wander
  return generateDirectionalPath(current.x, current.y, heading, occupied);
}

// ── World tick ──

export function tickWorld(
  positions: AgentPosition[],
  now: Date = new Date()
): WorldTickResult {
  const normalized = positions.map((position) => {
    // Cooldown recovery
    if (
      position.state === "cooldown" &&
      position.cooldown_until &&
      new Date(position.cooldown_until) <= now
    ) {
      return {
        ...withCells(position, currentCell(position).x, currentCell(position).y, currentCell(position).x, currentCell(position).y),
        state: "wandering" as const,
        cooldown_until: null,
        active_message: null,
        conversation_id: null,
        behavior: "wander" as const,
        behavior_ticks_remaining: randomInt(BEHAVIOR_TICK_MIN, BEHAVIOR_TICK_MAX),
        heading: position.heading ?? pickRandomHeading()
      };
    }

    const current = currentCell(position);
    const target = targetCell(position);
    return withCells(position, current.x, current.y, target.x, target.y);
  });

  const startedConversations: WorldTickResult["startedConversations"] = [];
  const movementEvents: WorldTickResult["movementEvents"] = [];
  const busy = new Set(
    normalized
      .filter((position) => position.state === "chatting" || position.state === "cooldown")
      .map((position) => position.user_id)
  );

  for (let i = 0; i < normalized.length; i += 1) {
    const a = normalized[i];
    if (busy.has(a.user_id)) {
      continue;
    }

    for (let j = i + 1; j < normalized.length; j += 1) {
      const b = normalized[j];
      if (busy.has(b.user_id)) {
        continue;
      }

      if (!isAdjacent(a, b)) {
        continue;
      }

      normalized[i] = {
        ...withCells(a, currentCell(a).x, currentCell(a).y, currentCell(a).x, currentCell(a).y),
        state: "chatting",
        active_message: null,
        path: [],
        move_speed: 0
      };
      normalized[j] = {
        ...withCells(b, currentCell(b).x, currentCell(b).y, currentCell(b).x, currentCell(b).y),
        state: "chatting",
        active_message: null,
        path: [],
        move_speed: 0
      };

      busy.add(a.user_id);
      busy.add(b.user_id);
      startedConversations.push({
        agentA: a.user_id,
        agentB: b.user_id,
        midpoint: {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2
        }
      });
      break;
    }
  }

  const occupied = new Set(
    normalized.map((position) => {
      const cell = currentCell(position);
      return occupancyKey(cell.x, cell.y);
    })
  );
  const updated = normalized.map((position) => {
    const before = currentCell(position);
    const next = advanceOnPath(position, occupied, normalized);
    const after = currentCell(next);
    if (before.x !== after.x || before.y !== after.y) {
      movementEvents.push({
        user_id: position.user_id,
        from_cell_x: before.x,
        from_cell_y: before.y,
        to_cell_x: after.x,
        to_cell_y: after.y
      });
    }
    return next;
  });

  return { positions: updated, movementEvents, startedConversations };
}

export function endConversation(position: AgentPosition, now: Date = new Date()): AgentPosition {
  const cooldownUntil = new Date(now.getTime() + WORLD_COOLDOWN_SECONDS * 1000).toISOString();

  return {
    ...withCells(position, currentCell(position).x, currentCell(position).y, currentCell(position).x, currentCell(position).y),
    state: "cooldown",
    active_message: null,
    conversation_id: null,
    cooldown_until: cooldownUntil,
    path: [],
    move_speed: 0,
    behavior: undefined,
    behavior_ticks_remaining: 0
  };
}
