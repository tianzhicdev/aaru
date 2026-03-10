import { describe, expect, it } from "vitest";
import { endConversation, tickWorld } from "@aaru/domain/world.ts";
import type { AgentPosition } from "@aaru/domain/types.ts";

const baseAgent = (overrides: Partial<AgentPosition>): AgentPosition => ({
  user_id: crypto.randomUUID(),
  x: (5.5 / 50),
  y: (5.5 / 50),
  target_x: (6.5 / 50),
  target_y: (6.5 / 50),
  cell_x: 5,
  cell_y: 5,
  target_cell_x: 6,
  target_cell_y: 6,
  state: "wandering",
  active_message: null,
  conversation_id: null,
  cooldown_until: null,
  ...overrides
});

describe("world tick", () => {
  it("starts a conversation when two idle agents are in proximity", () => {
    const a = baseAgent({ x: 5.5 / 50, y: 5.5 / 50, target_x: 5.5 / 50, target_y: 5.5 / 50, cell_x: 5, cell_y: 5, target_cell_x: 5, target_cell_y: 5 });
    const b = baseAgent({ x: 6.5 / 50, y: 5.5 / 50, target_x: 6.5 / 50, target_y: 5.5 / 50, cell_x: 6, cell_y: 5, target_cell_x: 6, target_cell_y: 5 });

    const result = tickWorld([a, b], new Date("2026-03-09T20:00:00.000Z"));

    expect(result.startedConversations).toHaveLength(1);
    expect(result.positions[0].state).toBe("chatting");
    expect(result.positions[1].state).toBe("chatting");
  });

  it("does not start a conversation for agents standing on the same cell", () => {
    const a = baseAgent({ x: 5.5 / 50, y: 5.5 / 50, target_x: 5.5 / 50, target_y: 5.5 / 50, cell_x: 5, cell_y: 5, target_cell_x: 5, target_cell_y: 5 });
    const b = baseAgent({ x: 5.5 / 50, y: 5.5 / 50, target_x: 5.5 / 50, target_y: 5.5 / 50, cell_x: 5, cell_y: 5, target_cell_x: 5, target_cell_y: 5 });

    const result = tickWorld([a, b], new Date("2026-03-09T20:00:00.000Z"));

    expect(result.startedConversations).toHaveLength(0);
  });

  it("keeps agents on exclusive cells while moving toward the same target", () => {
    const a = baseAgent({ x: 5.5 / 50, y: 5.5 / 50, target_x: 10.5 / 50, target_y: 10.5 / 50, cell_x: 5, cell_y: 5, target_cell_x: 10, target_cell_y: 10 });
    const b = baseAgent({ x: 7.5 / 50, y: 5.5 / 50, target_x: 10.5 / 50, target_y: 10.5 / 50, cell_x: 7, cell_y: 5, target_cell_x: 10, target_cell_y: 10 });

    const result = tickWorld([a, b], new Date("2026-03-09T20:00:00.000Z"));
    const occupied = new Set(result.positions.map((position) => `${position.x}:${position.y}`));

    expect(occupied.size).toBe(result.positions.length);
  });

  it("keeps a wandering agent on the same cell or one neighboring cell per tick", () => {
    const agent = baseAgent({ x: 5.5 / 50, y: 5.5 / 50, target_x: 20.5 / 50, target_y: 20.5 / 50, cell_x: 5, cell_y: 5, target_cell_x: 20, target_cell_y: 20 });

    const result = tickWorld([agent], new Date("2026-03-09T20:00:00.000Z"));
    const moved = result.positions[0];
    const cellDistance = Math.max(
      Math.abs((moved.cell_x ?? 0) - 5),
      Math.abs((moved.cell_y ?? 0) - 5)
    );

    expect(cellDistance).toBeLessThanOrEqual(1);
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
  });

  it("applies a cooldown when conversations end", () => {
    const agent = baseAgent({ state: "chatting" });
    const result = endConversation(agent, new Date("2026-03-09T20:00:00.000Z"));

    expect(result.state).toBe("cooldown");
    expect(result.cooldown_until).toBe("2026-03-09T20:00:10.000Z");
  });
});
