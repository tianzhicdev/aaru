import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL_PROFILE_ID,
  defaultModelProfileIdFromEnv,
  getTaskConfig,
  normalizeModelProfileId
} from "../../workers/src/modelProfiles.ts";

describe("model profiles", () => {
  it("falls back to frontier for unknown profile ids", () => {
    expect(normalizeModelProfileId("not-real")).toBe(DEFAULT_MODEL_PROFILE_ID);
  });

  it("reads the default profile id from env when valid", () => {
    expect(defaultModelProfileIdFromEnv({ DEFAULT_MODEL_PROFILE_ID: "value_v1" })).toBe("value_v1");
  });

  it("returns fireworks-backed task configs for value_v1", () => {
    const conversation = getTaskConfig("value_v1", "conversation");
    expect(conversation.provider).toBe("fireworks_anthropic");
    expect(conversation.model).toContain("deepseek-v3p2");
  });
});
