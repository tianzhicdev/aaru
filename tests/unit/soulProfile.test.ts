import { describe, expect, it } from "vitest";
import { generateFallbackSoulProfile, mergeGeneratedSoulProfile } from "@aaru/domain/soulProfile.ts";

describe("soul profile generation", () => {
  it("fills plausible defaults for minimal input", () => {
    const profile = generateFallbackSoulProfile("hi");

    expect(profile.interests.length).toBeGreaterThan(0);
    expect(profile.values.length).toBeGreaterThan(0);
    expect(profile.guessed_fields.length).toBeGreaterThan(0);
  });

  it("preserves explicit generated fields and marks missing ones as guessed", () => {
    const profile = mergeGeneratedSoulProfile("I love film and running", {
      interests: ["film", "running"],
      values: ["honesty"]
    });

    expect(profile.interests).toEqual(["film", "running"]);
    expect(profile.values).toEqual(["honesty"]);
    expect(profile.guessed_fields).toContain("personality");
  });
});
