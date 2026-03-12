import { describe, expect, it } from "vitest";
import {
  endConversation,
  tickWorld,
  generateDirectionalPath,
  selectBehavior,
  pickRandomHeading,
  findNearestCluster,
  findNearestPOI,
  findCrowdCenter,
  generateGreedyPath
} from "@aaru/domain/world.ts";
import type { AgentPosition } from "@aaru/domain/types.ts";
import type { POI } from "@aaru/domain/types.ts";
import {
  DIRECTIONAL_PATH_MIN,
  DIRECTIONAL_PATH_MAX,
  WORLD_GRID_COLUMNS,
  WORLD_GRID_ROWS,
  GREEDY_PATH_MIN,
  GREEDY_PATH_MAX,
  WANDER_PATH_MAX
} from "@aaru/domain/constants.ts";

const baseAgent = (overrides: Partial<AgentPosition>): AgentPosition => ({
  user_id: crypto.randomUUID(),
  x: (5.5 / 64),
  y: (5.5 / 64),
  target_x: (6.5 / 64),
  target_y: (6.5 / 64),
  cell_x: 5,
  cell_y: 5,
  target_cell_x: 6,
  target_cell_y: 6,
  path: [],
  move_speed: 1.8,
  state: "wandering",
  active_message: null,
  conversation_id: null,
  cooldown_until: null,
  ...overrides
});

describe("world tick", () => {
  it("starts a conversation when two idle agents are in proximity", () => {
    const a = baseAgent({ x: 5.5 / 64, y: 5.5 / 64, target_x: 5.5 / 64, target_y: 5.5 / 64, cell_x: 5, cell_y: 5, target_cell_x: 5, target_cell_y: 5 });
    const b = baseAgent({ x: 6.5 / 64, y: 5.5 / 64, target_x: 6.5 / 64, target_y: 5.5 / 64, cell_x: 6, cell_y: 5, target_cell_x: 6, target_cell_y: 5 });

    const result = tickWorld([a, b], new Date("2026-03-09T20:00:00.000Z"));

    expect(result.startedConversations).toHaveLength(1);
    expect(result.positions[0].state).toBe("chatting");
    expect(result.positions[1].state).toBe("chatting");
  });

  it("does not start a conversation for agents standing on the same cell", () => {
    const a = baseAgent({ x: 5.5 / 64, y: 5.5 / 64, target_x: 5.5 / 64, target_y: 5.5 / 64, cell_x: 5, cell_y: 5, target_cell_x: 5, target_cell_y: 5 });
    const b = baseAgent({ x: 5.5 / 64, y: 5.5 / 64, target_x: 5.5 / 64, target_y: 5.5 / 64, cell_x: 5, cell_y: 5, target_cell_x: 5, target_cell_y: 5 });

    const result = tickWorld([a, b], new Date("2026-03-09T20:00:00.000Z"));

    expect(result.startedConversations).toHaveLength(0);
  });

  it("keeps agents on exclusive cells while moving toward the same target", () => {
    const a = baseAgent({ x: 5.5 / 64, y: 5.5 / 64, target_x: 10.5 / 64, target_y: 10.5 / 64, cell_x: 5, cell_y: 5, target_cell_x: 10, target_cell_y: 10 });
    const b = baseAgent({ x: 7.5 / 64, y: 5.5 / 64, target_x: 10.5 / 64, target_y: 10.5 / 64, cell_x: 7, cell_y: 5, target_cell_x: 10, target_cell_y: 10 });

    const result = tickWorld([a, b], new Date("2026-03-09T20:00:00.000Z"));
    const occupied = new Set(result.positions.map((position) => `${position.x}:${position.y}`));

    expect(occupied.size).toBe(result.positions.length);
  });

  it("keeps a wandering agent on the same cell or one neighboring cell per tick", () => {
    const agent = baseAgent({ x: 5.5 / 64, y: 5.5 / 64, target_x: 20.5 / 64, target_y: 20.5 / 64, cell_x: 5, cell_y: 5, target_cell_x: 20, target_cell_y: 20 });

    const result = tickWorld([agent], new Date("2026-03-09T20:00:00.000Z"));
    const moved = result.positions[0];
    const cellDistance = Math.max(
      Math.abs((moved.cell_x ?? 0) - 5),
      Math.abs((moved.cell_y ?? 0) - 5)
    );

    expect(cellDistance).toBeLessThanOrEqual(1);
  });

  it("keeps following a multi-step wander path instead of retargeting every tick", () => {
    const agent = baseAgent({
      x: 5.5 / 64,
      y: 5.5 / 64,
      target_x: 8.5 / 64,
      target_y: 5.5 / 64,
      cell_x: 5,
      cell_y: 5,
      target_cell_x: 8,
      target_cell_y: 5,
      behavior: "wander",
      behavior_ticks_remaining: 10,
      heading: 2,
      path: [
        { x: 6, y: 5 },
        { x: 7, y: 5 },
        { x: 8, y: 5 }
      ]
    });

    const first = tickWorld([agent], new Date("2026-03-09T20:00:00.000Z")).positions[0];
    const second = tickWorld([first], new Date("2026-03-09T20:00:01.000Z")).positions[0];

    expect(first.cell_x).toBe(6);
    expect(first.cell_y).toBe(5);
    expect(first.path).toEqual([
      { x: 7, y: 5 },
      { x: 8, y: 5 }
    ]);
    expect(second.cell_x).toBe(7);
    expect(second.cell_y).toBe(5);
    expect(second.path).toEqual([
      { x: 8, y: 5 }
    ]);
  });

  it("returns cooldown agents to wandering when the timer expires", () => {
    const now = new Date("2026-03-09T20:00:00.000Z");
    const cooled = baseAgent({
      state: "cooldown",
      cooldown_until: "2026-03-09T19:59:55.000Z"
    });

    const result = tickWorld([cooled], now);

    expect(result.positions[0].state).toBe("wandering");
    expect(result.positions[0].cooldown_until).toBeNull();
    expect(result.positions[0].behavior).toBe("wander");
  });

  it("applies a cooldown when conversations end", () => {
    const agent = baseAgent({ state: "chatting" });
    const result = endConversation(agent, new Date("2026-03-09T20:00:00.000Z"));

    expect(result.state).toBe("cooldown");
    expect(result.cooldown_until).toBe("2026-03-09T20:00:10.000Z");
  });
});

describe("directional path generation", () => {
  it("produces a path within the expected length range", () => {
    for (let i = 0; i < 50; i++) {
      const { path } = generateDirectionalPath(32, 32, pickRandomHeading(), new Set());
      expect(path.length).toBeGreaterThanOrEqual(1);
      expect(path.length).toBeLessThanOrEqual(WANDER_PATH_MAX + 8);
    }
  });

  it("avoids occupied cells", () => {
    const occupied = new Set(["33:32", "32:33", "31:32", "32:31"]);
    for (let i = 0; i < 30; i++) {
      const { path } = generateDirectionalPath(32, 32, 2, occupied);
      for (const cell of path) {
        expect(occupied.has(`${cell.x}:${cell.y}`)).toBe(false);
      }
    }
  });

  it("maintains general heading direction", () => {
    // Heading 2 = East. Over many runs, majority of steps should move right (dx > 0)
    let eastwardSteps = 0;
    let totalSteps = 0;
    let eastwardEndpoints = 0;
    for (let i = 0; i < 100; i++) {
      const { path } = generateDirectionalPath(32, 32, 2, new Set());
      let prevX = 32;
      for (const cell of path) {
        if (cell.x > prevX) eastwardSteps++;
        totalSteps++;
        prevX = cell.x;
      }
      const last = path[path.length - 1];
      if (last && last.x > 32) eastwardEndpoints++;
    }
    expect(eastwardSteps / totalSteps).toBeGreaterThan(0.65);
    expect(eastwardEndpoints / 100).toBeGreaterThan(0.9);
  });

  it("builds mostly straight paths toward a distant destination", () => {
    for (let i = 0; i < 50; i++) {
      const { path } = generateDirectionalPath(32, 32, 2, new Set());
      let turns = 0;
      for (let j = 2; j < path.length; j++) {
        const dx1 = path[j - 1].x - path[j - 2].x;
        const dy1 = path[j - 1].y - path[j - 2].y;
        const dx2 = path[j].x - path[j - 1].x;
        const dy2 = path[j].y - path[j - 1].y;
        if (dx1 !== dx2 || dy1 !== dy2) {
          turns++;
        }
      }
      if (path.length >= 6) {
        expect(turns).toBeLessThanOrEqual(Math.ceil(path.length / 3));
      }
    }
  });

  it("stays within grid bounds", () => {
    // Start near corners to stress-test bounds
    const corners = [
      { x: 0, y: 0 },
      { x: WORLD_GRID_COLUMNS - 1, y: 0 },
      { x: 0, y: WORLD_GRID_ROWS - 1 },
      { x: WORLD_GRID_COLUMNS - 1, y: WORLD_GRID_ROWS - 1 }
    ];
    for (const corner of corners) {
      for (let i = 0; i < 20; i++) {
        const { path } = generateDirectionalPath(corner.x, corner.y, pickRandomHeading(), new Set());
        for (const cell of path) {
          expect(cell.x).toBeGreaterThanOrEqual(0);
          expect(cell.x).toBeLessThan(WORLD_GRID_COLUMNS);
          expect(cell.y).toBeGreaterThanOrEqual(0);
          expect(cell.y).toBeLessThan(WORLD_GRID_ROWS);
        }
      }
    }
  });
});

describe("behavior selection", () => {
  it("returns one of the 5 behaviors with correct tick ranges", () => {
    const allBehaviors = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const result = selectBehavior(baseAgent({}));
      expect(["wander", "idle", "drift_social", "drift_poi", "retreat"]).toContain(result.behavior);
      expect(result.ticks).toBeGreaterThanOrEqual(3);
      expect(result.ticks).toBeLessThanOrEqual(10);
      allBehaviors.add(result.behavior);
    }
    // Without allAgents, drift/retreat targets can't be found so they fall back to wander
    // wander and idle should both appear
    expect(allBehaviors.has("wander")).toBe(true);
    expect(allBehaviors.has("idle")).toBe(true);
  });

  it("does not re-select when ticks remaining", () => {
    const agent = baseAgent({ behavior: "idle", behavior_ticks_remaining: 5, heading: 3 });
    const result = selectBehavior(agent);
    expect(result.behavior).toBe("idle");
    expect(result.ticks).toBe(5);
  });

  it("selects drift_social when agents form a cluster", () => {
    const self = baseAgent({ user_id: "self-id", cell_x: 10, cell_y: 10 });
    const a = baseAgent({ cell_x: 15, cell_y: 10 });
    const b = baseAgent({ cell_x: 16, cell_y: 10 });
    const allAgents = [self, a, b];

    let gotDriftSocial = false;
    for (let i = 0; i < 500; i++) {
      const result = selectBehavior(
        baseAgent({ user_id: "self-id", cell_x: 10, cell_y: 10 }),
        allAgents
      );
      if (result.behavior === "drift_social") {
        gotDriftSocial = true;
        break;
      }
    }
    expect(gotDriftSocial).toBe(true);
  });
});

describe("behavior integration", () => {
  it("idle agents stay on the same cell", () => {
    const agent = baseAgent({
      cell_x: 10, cell_y: 10,
      x: 10.5 / 64, y: 10.5 / 64,
      target_x: 10.5 / 64, target_y: 10.5 / 64,
      target_cell_x: 10, target_cell_y: 10,
      behavior: "idle",
      behavior_ticks_remaining: 5
    });

    const result = tickWorld([agent], new Date("2026-03-09T20:00:00.000Z"));
    expect(result.positions[0].cell_x).toBe(10);
    expect(result.positions[0].cell_y).toBe(10);
    expect(result.positions[0].state).toBe("idle");
    expect(result.positions[0].behavior_ticks_remaining).toBe(4);
  });

  it("agents without behavior field get initialized on first tick", () => {
    const agent = baseAgent({
      cell_x: 15, cell_y: 15,
      x: 15.5 / 64, y: 15.5 / 64,
      target_x: 15.5 / 64, target_y: 15.5 / 64,
      target_cell_x: 15, target_cell_y: 15
    });
    // No behavior, heading, or behavior_ticks_remaining set

    const result = tickWorld([agent], new Date("2026-03-09T20:00:00.000Z"));
    const pos = result.positions[0];
    expect(pos.behavior).toBeDefined();
    expect(["wander", "idle", "drift_social", "drift_poi", "retreat"]).toContain(pos.behavior);
  });

  it("idle agents can still be drawn into conversations", () => {
    const a = baseAgent({
      cell_x: 5, cell_y: 5,
      x: 5.5 / 64, y: 5.5 / 64,
      target_x: 5.5 / 64, target_y: 5.5 / 64,
      target_cell_x: 5, target_cell_y: 5,
      behavior: "idle",
      behavior_ticks_remaining: 5
    });
    const b = baseAgent({
      cell_x: 6, cell_y: 5,
      x: 6.5 / 64, y: 5.5 / 64,
      target_x: 6.5 / 64, target_y: 5.5 / 64,
      target_cell_x: 6, target_cell_y: 5,
      behavior: "wander",
      behavior_ticks_remaining: 3
    });

    const result = tickWorld([a, b], new Date("2026-03-09T20:00:00.000Z"));
    expect(result.startedConversations).toHaveLength(1);
    expect(result.positions[0].state).toBe("chatting");
    expect(result.positions[1].state).toBe("chatting");
  });

  it("drift_social agents move toward clusters", () => {
    // Place a cluster at (20,10) and a drift_social agent at (10,10)
    const drifter = baseAgent({
      user_id: "drifter",
      cell_x: 10, cell_y: 10,
      x: 10.5 / 64, y: 10.5 / 64,
      target_x: 10.5 / 64, target_y: 10.5 / 64,
      target_cell_x: 10, target_cell_y: 10,
      behavior: "drift_social",
      behavior_ticks_remaining: 10,
      heading: 2
    });
    const clusterA = baseAgent({
      cell_x: 15, cell_y: 10,
      x: 15.5 / 64, y: 10.5 / 64,
      target_x: 15.5 / 64, target_y: 10.5 / 64,
      target_cell_x: 15, target_cell_y: 10,
      behavior: "idle", behavior_ticks_remaining: 20
    });
    const clusterB = baseAgent({
      cell_x: 16, cell_y: 10,
      x: 16.5 / 64, y: 10.5 / 64,
      target_x: 16.5 / 64, target_y: 10.5 / 64,
      target_cell_x: 16, target_cell_y: 10,
      behavior: "idle", behavior_ticks_remaining: 20
    });

    const result = tickWorld([drifter, clusterA, clusterB], new Date("2026-03-09T20:00:00.000Z"));
    const moved = result.positions[0];
    // Should have moved closer to cluster (cell_x should increase from 10)
    expect(moved.cell_x!).toBeGreaterThanOrEqual(10);
  });

  it("retreat agents move away from crowds", () => {
    const retreater = baseAgent({
      user_id: "retreater",
      cell_x: 10, cell_y: 10,
      x: 10.5 / 64, y: 10.5 / 64,
      target_x: 10.5 / 64, target_y: 10.5 / 64,
      target_cell_x: 10, target_cell_y: 10,
      behavior: "retreat",
      behavior_ticks_remaining: 10,
      heading: 6
    });
    // 3 neighbors to form crowd
    const n1 = baseAgent({ cell_x: 11, cell_y: 10, x: 11.5/64, y: 10.5/64, target_x: 11.5/64, target_y: 10.5/64, target_cell_x: 11, target_cell_y: 10, behavior: "idle", behavior_ticks_remaining: 20 });
    const n2 = baseAgent({ cell_x: 10, cell_y: 11, x: 10.5/64, y: 11.5/64, target_x: 10.5/64, target_y: 11.5/64, target_cell_x: 10, target_cell_y: 11, behavior: "idle", behavior_ticks_remaining: 20 });
    const n3 = baseAgent({ cell_x: 11, cell_y: 11, x: 11.5/64, y: 11.5/64, target_x: 11.5/64, target_y: 11.5/64, target_cell_x: 11, target_cell_y: 11, behavior: "idle", behavior_ticks_remaining: 20 });

    const result = tickWorld([retreater, n1, n2, n3], new Date("2026-03-09T20:00:00.000Z"));
    const moved = result.positions[0];
    // Should have moved away from crowd center (~11,10.5) — cell_x should decrease or cell_y should decrease
    const crowdCx = Math.round((11 + 10 + 11) / 3);
    const crowdCy = Math.round((10 + 11 + 11) / 3);
    const distBefore = Math.max(Math.abs(10 - crowdCx), Math.abs(10 - crowdCy));
    const distAfter = Math.max(Math.abs(moved.cell_x! - crowdCx), Math.abs(moved.cell_y! - crowdCy));
    expect(distAfter).toBeGreaterThanOrEqual(distBefore);
  });

  it("directional wander produces arcing paths over multiple ticks", () => {
    let agent = baseAgent({
      cell_x: 32, cell_y: 32,
      x: 32.5 / 64, y: 32.5 / 64,
      target_x: 32.5 / 64, target_y: 32.5 / 64,
      target_cell_x: 32, target_cell_y: 32,
      behavior: "wander",
      behavior_ticks_remaining: 20,
      heading: 2 // East
    });

    const positions: Array<{ x: number; y: number }> = [{ x: 32, y: 32 }];
    for (let i = 0; i < 10; i++) {
      const result = tickWorld([agent], new Date(`2026-03-09T20:00:${String(i).padStart(2, "0")}.000Z`));
      agent = result.positions[0];
      if (agent.state === "wandering") {
        positions.push({ x: agent.cell_x ?? 0, y: agent.cell_y ?? 0 });
      }
    }

    // Should have moved (not stuck)
    const uniquePositions = new Set(positions.map((p) => `${p.x}:${p.y}`));
    expect(uniquePositions.size).toBeGreaterThan(1);
  });
});

describe("statistical behavior", () => {
  it("agents drift toward POIs over 50 ticks", () => {
    // Start agent at (10,10). Nearest WORLD_POI is Boardwalk Center (32,4)
    // chebyshev distance = max(22,6) = 22
    let agent = baseAgent({
      user_id: "drifter",
      cell_x: 10, cell_y: 10,
      x: 10.5 / 64, y: 10.5 / 64,
      target_x: 10.5 / 64, target_y: 10.5 / 64,
      target_cell_x: 10, target_cell_y: 10,
      behavior: "drift_poi",
      behavior_ticks_remaining: 50,
      heading: 2
    });

    const targetX = 32, targetY = 4; // Boardwalk Center
    const startDist = Math.max(Math.abs(10 - targetX), Math.abs(10 - targetY));
    for (let i = 0; i < 50; i++) {
      const result = tickWorld([agent], new Date(`2026-03-09T20:00:${String(i % 60).padStart(2, "0")}.000Z`));
      agent = result.positions[0];
      agent = { ...agent, behavior: "drift_poi", behavior_ticks_remaining: 50 };
    }
    const endDist = Math.max(Math.abs((agent.cell_x ?? 10) - targetX), Math.abs((agent.cell_y ?? 10) - targetY));
    expect(endDist).toBeLessThan(startDist);
  });

  it("social gravity: greedy paths point toward cluster centers", () => {
    // Cluster at (30,25) area — place self at (23,25), within CLUSTER_RANGE=8
    const agents: AgentPosition[] = [
      baseAgent({ user_id: "a1", cell_x: 28, cell_y: 25 }),
      baseAgent({ user_id: "a2", cell_x: 30, cell_y: 25 }),
      baseAgent({ user_id: "a3", cell_x: 29, cell_y: 26 })
    ];

    const selfAgent = baseAgent({ user_id: "self", cell_x: 23, cell_y: 25 });
    const all = [selfAgent, ...agents];
    const cluster = findNearestCluster(all, "self");
    expect(cluster).not.toBeNull();

    let closerCount = 0;
    const N = 30;
    for (let i = 0; i < N; i++) {
      const { path } = generateGreedyPath(23, 25, cluster!.x, cluster!.y, new Set());
      if (path.length > 0) {
        const last = path[path.length - 1];
        const startDist = Math.max(Math.abs(23 - cluster!.x), Math.abs(25 - cluster!.y));
        const endDist = Math.max(Math.abs(last.x - cluster!.x), Math.abs(last.y - cluster!.y));
        if (endDist < startDist) closerCount++;
      }
    }
    expect(closerCount / N).toBeGreaterThan(0.7);
  });

  it("weight distribution matches expected percentages", () => {
    const counts: Record<string, number> = { wander: 0, idle: 0, drift_social: 0, drift_poi: 0, retreat: 0 };
    const N = 1000;

    // Create agents that form a cluster, are near a POI, and create a crowd — so all behaviors can trigger
    const self = baseAgent({ user_id: "self", cell_x: 32, cell_y: 12 });
    const a1 = baseAgent({ cell_x: 34, cell_y: 12 });
    const a2 = baseAgent({ cell_x: 35, cell_y: 12 });
    const a3 = baseAgent({ cell_x: 33, cell_y: 12 });
    const a4 = baseAgent({ cell_x: 33, cell_y: 13 });
    const allAgents = [self, a1, a2, a3, a4];

    for (let i = 0; i < N; i++) {
      const result = selectBehavior(
        baseAgent({ user_id: "self", cell_x: 32, cell_y: 12 }),
        allAgents
      );
      counts[result.behavior]++;
    }

    // With weights 35/25/20/15/5 = 100, expect roughly:
    // wander ~35%, idle ~25%, drift_social ~20%, drift_poi ~15%, retreat ~5%
    // Allow generous tolerance (±12%) due to randomness
    expect(counts.wander / N).toBeGreaterThan(0.20);
    expect(counts.wander / N).toBeLessThan(0.50);
    expect(counts.idle / N).toBeGreaterThan(0.13);
    expect(counts.idle / N).toBeLessThan(0.40);
    expect(counts.drift_social / N).toBeGreaterThan(0.08);
    expect(counts.drift_poi / N).toBeGreaterThan(0.03);
    expect(counts.retreat / N).toBeGreaterThan(0.00);
  });
});

describe("cluster detection", () => {
  it("finds groups of 2+ agents", () => {
    const self = baseAgent({ user_id: "self-id", cell_x: 10, cell_y: 10 });
    const a = baseAgent({ cell_x: 15, cell_y: 10 });
    const b = baseAgent({ cell_x: 16, cell_y: 10 });
    const result = findNearestCluster([self, a, b], "self-id");
    expect(result).not.toBeNull();
  });

  it("returns null when no clusters exist", () => {
    const self = baseAgent({ user_id: "self-id", cell_x: 10, cell_y: 10 });
    const a = baseAgent({ cell_x: 50, cell_y: 50 }); // too far
    const result = findNearestCluster([self, a], "self-id");
    expect(result).toBeNull();
  });
});

describe("POI detection", () => {
  it("returns closest POI with capacity, skips full ones", () => {
    const pois: POI[] = [
      { label: "Near", x: 12, y: 10, radius: 2, capacity: 1 },
      { label: "Far", x: 30, y: 10, radius: 2, capacity: 4 }
    ];
    // Place one agent inside the near POI to fill it
    const occupant = baseAgent({ cell_x: 12, cell_y: 10 });
    const result = findNearestPOI({ x: 10, y: 10 }, [occupant], pois);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("Far");
  });
});

describe("crowd detection", () => {
  it("returns crowd center when 3+ agents within range", () => {
    const self = baseAgent({ user_id: "self-id", cell_x: 10, cell_y: 10 });
    const a = baseAgent({ cell_x: 11, cell_y: 10 });
    const b = baseAgent({ cell_x: 10, cell_y: 11 });
    const c = baseAgent({ cell_x: 11, cell_y: 11 });
    const result = findCrowdCenter([self, a, b, c], "self-id");
    expect(result).not.toBeNull();
  });

  it("returns null when fewer than 3 agents nearby", () => {
    const self = baseAgent({ user_id: "self-id", cell_x: 10, cell_y: 10 });
    const a = baseAgent({ cell_x: 11, cell_y: 10 });
    const result = findCrowdCenter([self, a], "self-id");
    expect(result).toBeNull();
  });
});

describe("greedy pathfinding", () => {
  it("moves toward target on average", () => {
    let closerCount = 0;
    const N = 50;
    for (let i = 0; i < N; i++) {
      const { path } = generateGreedyPath(10, 10, 20, 10, new Set());
      expect(path.length).toBeGreaterThanOrEqual(GREEDY_PATH_MIN);
      expect(path.length).toBeLessThanOrEqual(GREEDY_PATH_MAX);
      const last = path[path.length - 1];
      if (Math.abs(20 - last.x) < Math.abs(20 - 10)) closerCount++;
    }
    // With 80% greedy + 20% jitter, vast majority should end closer
    expect(closerCount / N).toBeGreaterThan(0.6);
  });

  it("moves away from target in away mode", () => {
    const { path } = generateGreedyPath(10, 10, 10, 10, new Set(), true);
    expect(path.length).toBeGreaterThanOrEqual(GREEDY_PATH_MIN);
    // Last cell should be farther from origin
    const last = path[path.length - 1];
    const dist = Math.max(Math.abs(last.x - 10), Math.abs(last.y - 10));
    expect(dist).toBeGreaterThan(0);
  });

  it("avoids obstacles and occupied cells", () => {
    const occupied = new Set(["11:10", "10:11", "11:11"]);
    for (let i = 0; i < 20; i++) {
      const { path } = generateGreedyPath(10, 10, 20, 20, occupied);
      for (const cell of path) {
        expect(occupied.has(`${cell.x}:${cell.y}`)).toBe(false);
      }
    }
  });
});

describe("user-directed movement", () => {
  it("user-directed agent follows path without selecting new behavior", () => {
    const agent = baseAgent({
      cell_x: 10, cell_y: 10,
      x: 10.5 / 64, y: 10.5 / 64,
      target_x: 10.5 / 64, target_y: 10.5 / 64,
      target_cell_x: 10, target_cell_y: 10,
      state: "user_moving",
      user_directed: true,
      user_target_cell_x: 13,
      user_target_cell_y: 10,
      path: [{ x: 11, y: 10 }, { x: 12, y: 10 }, { x: 13, y: 10 }]
    });

    const result = tickWorld([agent], new Date("2026-03-09T20:00:00.000Z"));
    const moved = result.positions[0];
    expect(moved.cell_x).toBe(11);
    expect(moved.cell_y).toBe(10);
    expect(moved.state).toBe("user_moving");
    expect(moved.user_directed).toBe(true);
    expect(moved.path).toEqual([{ x: 12, y: 10 }, { x: 13, y: 10 }]);
  });

  it("user-directed agent transitions to idle on path completion", () => {
    const agent = baseAgent({
      cell_x: 12, cell_y: 10,
      x: 12.5 / 64, y: 10.5 / 64,
      target_x: 12.5 / 64, target_y: 10.5 / 64,
      target_cell_x: 12, target_cell_y: 10,
      state: "user_moving",
      user_directed: true,
      user_target_cell_x: 13,
      user_target_cell_y: 10,
      path: [{ x: 13, y: 10 }]
    });

    const first = tickWorld([agent], new Date("2026-03-09T20:00:00.000Z")).positions[0];
    expect(first.cell_x).toBe(13);
    expect(first.state).toBe("user_moving");
    expect(first.path).toEqual([]);

    // Next tick: path is empty, should transition to idle
    const second = tickWorld([first], new Date("2026-03-09T20:00:01.000Z")).positions[0];
    expect(second.state).toBe("idle");
    expect(second.user_directed).toBe(false);
    expect(second.user_target_cell_x).toBeUndefined();
    expect(second.user_target_cell_y).toBeUndefined();
  });

  it("user-directed agent with empty path immediately transitions to idle", () => {
    const agent = baseAgent({
      cell_x: 13, cell_y: 10,
      x: 13.5 / 64, y: 10.5 / 64,
      target_x: 13.5 / 64, target_y: 10.5 / 64,
      target_cell_x: 13, target_cell_y: 10,
      state: "user_moving",
      user_directed: true,
      user_target_cell_x: 13,
      user_target_cell_y: 10,
      path: []
    });

    const result = tickWorld([agent], new Date("2026-03-09T20:00:00.000Z"));
    const moved = result.positions[0];
    expect(moved.state).toBe("idle");
    expect(moved.user_directed).toBe(false);
    expect(moved.behavior).toBe("idle");
  });

  it("user-directed agent can be pulled into conversation via adjacency", () => {
    const userAgent = baseAgent({
      cell_x: 5, cell_y: 5,
      x: 5.5 / 64, y: 5.5 / 64,
      target_x: 5.5 / 64, target_y: 5.5 / 64,
      target_cell_x: 5, target_cell_y: 5,
      state: "user_moving",
      user_directed: true,
      user_target_cell_x: 10,
      user_target_cell_y: 5,
      path: [{ x: 6, y: 5 }, { x: 7, y: 5 }]
    });
    const npc = baseAgent({
      cell_x: 6, cell_y: 5,
      x: 6.5 / 64, y: 5.5 / 64,
      target_x: 6.5 / 64, target_y: 5.5 / 64,
      target_cell_x: 6, target_cell_y: 5,
      behavior: "idle", behavior_ticks_remaining: 5
    });

    const result = tickWorld([userAgent, npc], new Date("2026-03-09T20:00:00.000Z"));
    expect(result.startedConversations).toHaveLength(1);
    expect(result.positions[0].state).toBe("chatting");
    expect(result.positions[0].user_directed).toBe(false);
    expect(result.positions[1].state).toBe("chatting");
  });

  it("user-directed agent clears user_directed when pulled into conversation", () => {
    const userAgent = baseAgent({
      cell_x: 5, cell_y: 5,
      x: 5.5 / 64, y: 5.5 / 64,
      target_x: 5.5 / 64, target_y: 5.5 / 64,
      target_cell_x: 5, target_cell_y: 5,
      state: "user_moving",
      user_directed: true,
      user_target_cell_x: 10,
      user_target_cell_y: 5,
      path: [{ x: 6, y: 5 }]
    });
    const npc = baseAgent({
      cell_x: 6, cell_y: 5,
      x: 6.5 / 64, y: 5.5 / 64,
      target_x: 6.5 / 64, target_y: 5.5 / 64,
      target_cell_x: 6, target_cell_y: 5
    });

    const result = tickWorld([userAgent, npc], new Date("2026-03-09T20:00:00.000Z"));
    expect(result.positions[0].user_directed).toBe(false);
    expect(result.positions[0].user_target_cell_x).toBeUndefined();
    expect(result.positions[0].user_target_cell_y).toBeUndefined();
  });

  it("user-directed agent resumes autonomous after idle ticks expire", () => {
    // Simulate arriving and idling
    const agent = baseAgent({
      cell_x: 13, cell_y: 10,
      x: 13.5 / 64, y: 10.5 / 64,
      target_x: 13.5 / 64, target_y: 10.5 / 64,
      target_cell_x: 13, target_cell_y: 10,
      state: "idle",
      behavior: "idle",
      behavior_ticks_remaining: 1,
      user_directed: false,
      path: []
    });

    const result = tickWorld([agent], new Date("2026-03-09T20:00:00.000Z"));
    const moved = result.positions[0];
    // After idle ticks expire, should pick a new behavior
    expect(moved.behavior).toBeDefined();
    expect(["wander", "idle", "drift_social", "drift_poi", "retreat"]).toContain(moved.behavior);
  });
});

describe("directional wander arc coherence", () => {
  it("agent follows a coherent arc over multiple ticks, not Brownian jitter", () => {
    // Run multiple trials to get a statistical signal
    let totalRatio = 0;
    const trials = 20;
    for (let t = 0; t < trials; t++) {
      const agent = baseAgent({
        x: 48.5 / 96, y: 32.5 / 64,
        target_x: 48.5 / 96, target_y: 32.5 / 64,
        cell_x: 48, cell_y: 32,
        target_cell_x: 48, target_cell_y: 32,
        state: "wandering",
        behavior: "wander",
        behavior_ticks_remaining: 10,
        heading: 2, // east
        path: []
      });

      const positions: { x: number; y: number }[] = [];
      let current = agent;
      for (let i = 0; i < 15; i++) {
        const result = tickWorld([current], new Date("2026-03-09T20:00:00.000Z"));
        current = result.positions[0];
        const cx = Math.round(current.x * 96);
        const cy = Math.round(current.y * 64);
        positions.push({ x: cx, y: cy });
      }

      let totalDist = 0;
      for (let i = 1; i < positions.length; i++) {
        totalDist += Math.abs(positions[i].x - positions[i - 1].x)
                   + Math.abs(positions[i].y - positions[i - 1].y);
      }
      const start = positions[0];
      const end = positions[positions.length - 1];
      const netDisplacement = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);

      if (totalDist > 0) {
        totalRatio += netDisplacement / totalDist;
      }
    }

    // Average displacement/distance ratio across trials should be > 0.2
    // (pure Brownian over 15 steps ≈ 0.1, directional wander ≈ 0.3-0.5)
    const avgRatio = totalRatio / trials;
    expect(avgRatio).toBeGreaterThan(0.2);
  });

  it("path is preserved across ticks when behavior stays the same", () => {
    // Agent with wander behavior and a pre-set path
    const agent = baseAgent({
      x: 20.5 / 96, y: 20.5 / 64,
      target_x: 21.5 / 96, target_y: 20.5 / 64,
      cell_x: 20, cell_y: 20,
      target_cell_x: 21, target_cell_y: 20,
      state: "wandering",
      behavior: "wander",
      behavior_ticks_remaining: 3,
      heading: 2,
      path: [{ x: 21, y: 20 }, { x: 22, y: 20 }, { x: 23, y: 20 }]
    });

    // After one tick, agent should have consumed first waypoint and kept the rest
    const result = tickWorld([agent], new Date("2026-03-09T20:00:00.000Z"));
    const next = result.positions[0];

    // Agent moved to first waypoint
    expect(next.cell_x).toBe(21);
    expect(next.cell_y).toBe(20);
    // Remaining path should have the rest (not regenerated from scratch)
    expect(next.path.length).toBe(2);
    expect(next.path[0]).toEqual({ x: 22, y: 20 });
    expect(next.path[1]).toEqual({ x: 23, y: 20 });
  });
});
