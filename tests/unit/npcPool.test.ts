import { describe, expect, it } from "vitest";
import {
  NPC_POOL,
  NPC_DEVICE_IDS,
  deriveSoulProfile,
  getActiveNpcSeeds,
} from "@aaru/domain/npcPool.ts";
import { WORLD_POPULATION_TARGET, MIN_NPC_COUNT } from "@aaru/domain/constants.ts";

describe("NPC pool", () => {
  it("has 50 seeds", () => {
    expect(NPC_POOL.length).toBe(50);
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

  it("NPC_DEVICE_IDS matches pool size", () => {
    expect(NPC_DEVICE_IDS.size).toBe(50);
  });

  it("device IDs are lowercase npc-{name}", () => {
    for (const seed of NPC_POOL) {
      expect(NPC_DEVICE_IDS.has(`npc-${seed.name.toLowerCase()}`)).toBe(true);
    }
  });
});

describe("deriveSoulProfile", () => {
  const seed = NPC_POOL[0]; // Nahla
  const profile = deriveSoulProfile(seed);

  it("returns a complete SoulProfile", () => {
    expect(profile.personality).toBe(seed.personality);
    expect(profile.interests).toEqual(seed.interests);
    expect(profile.avoid_topics).toEqual(["cruelty"]);
    expect(profile.guessed_fields).toEqual([]);
  });

  it("values have Schwartz dimensions in [0,1]", () => {
    const v = profile.values;
    for (const dim of [
      v.self_transcendence,
      v.self_enhancement,
      v.openness_to_change,
      v.conservation,
    ]) {
      expect(dim).toBeGreaterThanOrEqual(0);
      expect(dim).toBeLessThanOrEqual(1);
    }
  });

  it("values.expressed matches seed.values", () => {
    expect(profile.values.expressed).toEqual(seed.values);
  });

  it("narrative has formative stories, memories, and themes", () => {
    expect(profile.narrative.formative_stories.length).toBeGreaterThan(0);
    expect(profile.narrative.self_defining_memories.length).toBeGreaterThan(0);
    expect(profile.narrative.narrative_themes.length).toBeGreaterThan(0);
  });

  it("all 50 seeds produce valid profiles", () => {
    for (const s of NPC_POOL) {
      const p = deriveSoulProfile(s);
      expect(p.values.self_transcendence).toBeGreaterThanOrEqual(0);
      expect(p.values.self_transcendence).toBeLessThanOrEqual(1);
      expect(p.narrative.formative_stories.length).toBeGreaterThan(0);
    }
  });
});

describe("getActiveNpcSeeds", () => {
  it("returns 50 NPCs when no real users", () => {
    const seeds = getActiveNpcSeeds(0, WORLD_POPULATION_TARGET);
    expect(seeds.length).toBe(50);
  });

  it("returns 0 NPCs when 50+ real users", () => {
    const seeds = getActiveNpcSeeds(50, WORLD_POPULATION_TARGET);
    expect(seeds.length).toBe(0);
  });

  it("fills to target total", () => {
    const seeds = getActiveNpcSeeds(10, WORLD_POPULATION_TARGET);
    expect(seeds.length).toBe(40);
  });

  it("never returns negative count", () => {
    const seeds = getActiveNpcSeeds(100, WORLD_POPULATION_TARGET);
    expect(seeds.length).toBe(0);
  });

  it("returns stable ordering (first N from pool)", () => {
    const seeds = getActiveNpcSeeds(45, WORLD_POPULATION_TARGET);
    expect(seeds.length).toBe(5);
    expect(seeds[0].name).toBe(NPC_POOL[0].name);
    expect(seeds[4].name).toBe(NPC_POOL[4].name);
  });
});
