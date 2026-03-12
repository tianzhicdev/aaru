import { describe, expect, it } from "vitest";
import {
  getPairCooldownHours,
  DEFAULT_PAIR_COOLDOWN_HOURS,
  ACQUAINTANCE_ENCOUNTER_THRESHOLD,
  ACQUAINTANCE_COOLDOWN_HOURS,
  BA_UNLOCKED_COOLDOWN_HOURS
} from "@aaru/domain/constants.ts";

describe("getPairCooldownHours", () => {
  it("returns default 24h for low encounter count and no Ba unlock", () => {
    expect(getPairCooldownHours(0, false)).toBe(DEFAULT_PAIR_COOLDOWN_HOURS);
    expect(getPairCooldownHours(5, false)).toBe(DEFAULT_PAIR_COOLDOWN_HOURS);
    expect(getPairCooldownHours(14, false)).toBe(DEFAULT_PAIR_COOLDOWN_HOURS);
  });

  it("returns 72h once encounter count reaches acquaintance threshold", () => {
    expect(getPairCooldownHours(ACQUAINTANCE_ENCOUNTER_THRESHOLD, false)).toBe(ACQUAINTANCE_COOLDOWN_HOURS);
    expect(getPairCooldownHours(20, false)).toBe(ACQUAINTANCE_COOLDOWN_HOURS);
    expect(getPairCooldownHours(100, false)).toBe(ACQUAINTANCE_COOLDOWN_HOURS);
  });

  it("returns 168h when Ba is unlocked regardless of encounter count", () => {
    expect(getPairCooldownHours(0, true)).toBe(BA_UNLOCKED_COOLDOWN_HOURS);
    expect(getPairCooldownHours(5, true)).toBe(BA_UNLOCKED_COOLDOWN_HOURS);
    expect(getPairCooldownHours(ACQUAINTANCE_ENCOUNTER_THRESHOLD, true)).toBe(BA_UNLOCKED_COOLDOWN_HOURS);
    expect(getPairCooldownHours(100, true)).toBe(BA_UNLOCKED_COOLDOWN_HOURS);
  });

  it("Ba unlock takes priority over acquaintance threshold", () => {
    expect(getPairCooldownHours(ACQUAINTANCE_ENCOUNTER_THRESHOLD + 10, true)).toBe(BA_UNLOCKED_COOLDOWN_HOURS);
  });

  it("boundary: encounter count exactly at threshold - 1 returns default", () => {
    expect(getPairCooldownHours(ACQUAINTANCE_ENCOUNTER_THRESHOLD - 1, false)).toBe(DEFAULT_PAIR_COOLDOWN_HOURS);
  });
});
