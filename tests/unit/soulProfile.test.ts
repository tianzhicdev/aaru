import { describe, expect, it } from "vitest";
import { generateFallbackSoulProfile, mergeGeneratedSoulProfile } from "@aaru/domain/soulProfile.ts";

describe("soul profile generation", () => {
  it("fills plausible defaults for minimal input", () => {
    const profile = generateFallbackSoulProfile("hi");

    expect(profile.interests.length).toBeGreaterThan(0);
    expect(profile.values.expressed.length).toBeGreaterThan(0);
    expect(profile.values.self_transcendence).toBeGreaterThanOrEqual(0);
    expect(profile.values.self_transcendence).toBeLessThanOrEqual(1);
    expect(profile.narrative).toBeDefined();
    expect(profile.guessed_fields.length).toBeGreaterThan(0);
  });

  it("preserves explicit generated fields and marks missing ones as guessed", () => {
    const profile = mergeGeneratedSoulProfile("I love film and running", {
      interests: ["film", "running"],
      values: {
        self_transcendence: 0.8,
        self_enhancement: 0.3,
        openness_to_change: 0.7,
        conservation: 0.2,
        expressed: ["honesty"]
      }
    });

    expect(profile.interests).toEqual(["film", "running"]);
    expect(profile.values.expressed).toEqual(["honesty"]);
    expect(profile.values.self_transcendence).toBe(0.8);
    expect(profile.guessed_fields).toContain("personality");
  });
});
