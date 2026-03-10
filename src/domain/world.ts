import {
  WORLD_COOLDOWN_SECONDS,
  WORLD_GRID_COLUMNS,
  WORLD_GRID_ROWS
} from "./constants.ts";
import type { AgentPosition, WorldTickResult } from "./types.ts";

function clampCell(value: number, max: number): number {
  return Math.max(0, Math.min(max - 1, value));
}

function cellCenter(cellX: number, cellY: number) {
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

function moveOnGrid(agent: AgentPosition, occupied: Set<string>): AgentPosition {
  const current = currentCell(agent);
  const nextOccupied = new Set(occupied);

  if (agent.state === "chatting") {
    return withCells(agent, current.x, current.y, current.x, current.y);
  }

  nextOccupied.delete(occupancyKey(current.x, current.y));
  const freeNeighbors = allNeighborCells(current.x, current.y).filter((cell) => !nextOccupied.has(occupancyKey(cell.x, cell.y)));
  const shouldStay = freeNeighbors.length === 0 || Math.random() < 0.35;
  const nextCell = shouldStay
    ? current
    : freeNeighbors[Math.floor(Math.random() * freeNeighbors.length)] ?? current;

  nextOccupied.add(occupancyKey(nextCell.x, nextCell.y));
  occupied.clear();
  for (const entry of nextOccupied) {
    occupied.add(entry);
  }
  return {
    ...withCells(agent, nextCell.x, nextCell.y, nextCell.x, nextCell.y),
    state: "wandering"
  };
}

export function tickWorld(
  positions: AgentPosition[],
  now: Date = new Date()
): WorldTickResult {
  const normalized = positions.map((position) => {
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
        conversation_id: null
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
        active_message: null
      };
      normalized[j] = {
        ...withCells(b, currentCell(b).x, currentCell(b).y, currentCell(b).x, currentCell(b).y),
        state: "chatting",
        active_message: null
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
    const next = moveOnGrid(position, occupied);
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
    cooldown_until: cooldownUntil
  };
}
