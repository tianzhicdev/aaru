import { describe, it, expect } from "vitest";
import {
  HEARTBEAT_INTERVAL_MS,
  PRESENCE_BACKGROUND_THRESHOLD_MS,
  PRESENCE_OFFLINE_THRESHOLD_MS,
  OFFLINE_MAX_CONVERSATIONS_PER_DAY,
  MAX_PUSH_NOTIFICATIONS_PER_DAY
} from "../../src/domain/constants.ts";
import type { PresenceState } from "../../src/domain/types.ts";

describe("presence", () => {
  it("HEARTBEAT_INTERVAL_MS is 30 seconds", () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(30_000);
  });

  it("PRESENCE_BACKGROUND_THRESHOLD_MS is 30 seconds", () => {
    expect(PRESENCE_BACKGROUND_THRESHOLD_MS).toBe(30_000);
  });

  it("PRESENCE_OFFLINE_THRESHOLD_MS is 15 minutes", () => {
    expect(PRESENCE_OFFLINE_THRESHOLD_MS).toBe(900_000);
  });

  it("OFFLINE_MAX_CONVERSATIONS_PER_DAY is 10", () => {
    expect(OFFLINE_MAX_CONVERSATIONS_PER_DAY).toBe(10);
  });

  it("MAX_PUSH_NOTIFICATIONS_PER_DAY is 1", () => {
    expect(MAX_PUSH_NOTIFICATIONS_PER_DAY).toBe(1);
  });

  it("PresenceState accepts valid states", () => {
    const states: PresenceState[] = ["online", "background", "offline"];
    expect(states).toHaveLength(3);
    expect(states).toContain("online");
    expect(states).toContain("background");
    expect(states).toContain("offline");
  });
});
