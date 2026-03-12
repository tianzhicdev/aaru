import { describe, expect, it } from "vitest";
import {
  NPC_POOL,
  selectActiveNpcs,
  getWeekNumber,
  getDepartingIndex,
  getArrivingIndex
} from "@aaru/domain/npcSeeds.ts";
import type { NpcSeed } from "@aaru/domain/npcSeeds.ts";

describe("NPC rotation", () => {
  it("NPC_POOL has 15 seeds", () => {
    expect(NPC_POOL.length).toBe(15);
  });

  it("all seeds have required fields", () => {
    for (const seed of NPC_POOL) {
      expect(seed.name).toBeTruthy();
      expect(seed.personality).toBeTruthy();
      expect(seed.interests.length).toBeGreaterThan(0);
      expect(seed.values.length).toBeGreaterThan(0);
    }
  });

  it("all seed names are unique", () => {
    const names = NPC_POOL.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("selectActiveNpcs", () => {
  const pool: NpcSeed[] = Array.from({ length: 10 }, (_, i) => ({
    name: `NPC${i}`,
    personality: `personality ${i}`,
    interests: [`interest${i}`],
    values: [`value${i}`]
  }));

  it("returns windowSize NPCs", () => {
    const result = selectActiveNpcs(pool, new Date("2026-03-11"), 5);
    expect(result.length).toBe(5);
  });

  it("is deterministic for the same date", () => {
    const a = selectActiveNpcs(pool, new Date("2026-03-11"), 5);
    const b = selectActiveNpcs(pool, new Date("2026-03-11"), 5);
    expect(a.map((s) => s.name)).toEqual(b.map((s) => s.name));
  });

  it("shifts by 1 each week", () => {
    const week1 = selectActiveNpcs(pool, new Date("2026-03-02"), 5);
    const week2 = selectActiveNpcs(pool, new Date("2026-03-09"), 5);
    // The new window should overlap by 4 NPCs
    const names1 = week1.map((s) => s.name);
    const names2 = week2.map((s) => s.name);
    const overlap = names1.filter((n) => names2.includes(n));
    expect(overlap.length).toBe(4);
  });

  it("wraps around the pool", () => {
    // After 10 weeks the window should wrap
    const pool5 = Array.from({ length: 5 }, (_, i) => ({
      name: `NPC${i}`,
      personality: `p${i}`,
      interests: [`i${i}`],
      values: [`v${i}`]
    }));
    const a = selectActiveNpcs(pool5, new Date("2026-01-05"), 5);
    // With pool of 5 and window of 5, every week should return all 5
    expect(a.length).toBe(5);
  });

  it("handles empty pool", () => {
    expect(selectActiveNpcs([], new Date("2026-03-11"), 5)).toEqual([]);
  });

  it("handles pool smaller than window", () => {
    const small: NpcSeed[] = [{ name: "A", personality: "p", interests: ["i"], values: ["v"] }];
    const result = selectActiveNpcs(small, new Date("2026-03-11"), 5);
    expect(result.length).toBe(1);
  });
});

describe("getWeekNumber", () => {
  it("epoch date returns 0", () => {
    expect(getWeekNumber(new Date("2026-01-05T00:00:00Z"))).toBe(0);
  });

  it("one week later returns 1", () => {
    expect(getWeekNumber(new Date("2026-01-12T00:00:00Z"))).toBe(1);
  });

  it("mid-week returns same week number", () => {
    expect(getWeekNumber(new Date("2026-01-08T12:00:00Z"))).toBe(0);
  });
});

describe("getDepartingIndex / getArrivingIndex", () => {
  it("returns null when pool <= window", () => {
    expect(getDepartingIndex(5, new Date("2026-03-11"), 5)).toBeNull();
    expect(getArrivingIndex(5, new Date("2026-03-11"), 5)).toBeNull();
  });

  it("departing and arriving indices differ", () => {
    const date = new Date("2026-03-11");
    const dep = getDepartingIndex(15, date, 5);
    const arr = getArrivingIndex(15, date, 5);
    expect(dep).not.toBeNull();
    expect(arr).not.toBeNull();
    expect(dep).not.toBe(arr);
  });

  it("arriving index is the last element in the active window", () => {
    const date = new Date("2026-03-11");
    const pool = NPC_POOL;
    const active = selectActiveNpcs(pool, date, 5);
    const arrIdx = getArrivingIndex(pool.length, date, 5)!;
    expect(pool[arrIdx].name).toBe(active[active.length - 1].name);
  });
});
