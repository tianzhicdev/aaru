import { describe, expect, it } from "vitest";
import { avatarForSeed } from "@aaru/domain/avatar.ts";

describe("avatarForSeed", () => {
  it("is deterministic for the same seed", () => {
    expect(avatarForSeed("npc-nahla")).toEqual(avatarForSeed("npc-nahla"));
  });

  it("produces different avatars for different seeds", () => {
    expect(avatarForSeed("npc-nahla")).not.toEqual(avatarForSeed("npc-iset"));
  });
});
