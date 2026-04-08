import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL_PROFILE_ID,
  defaultModelProfileIdFromEnv,
  getTaskConfig,
  isModelProfileId,
  listModelProfiles,
  normalizeModelProfileId
} from "../../workers/src/modelProfiles.ts";

describe("model profiles", () => {
  it("falls back to default for unknown profile ids", () => {
    expect(normalizeModelProfileId("not-real")).toBe(DEFAULT_MODEL_PROFILE_ID);
  });

  it("normalizes all valid profile ids", () => {
    expect(normalizeModelProfileId("frontier_v1")).toBe("frontier_v1");
    expect(normalizeModelProfileId("value_v1")).toBe("value_v1");
    expect(normalizeModelProfileId("value_v2")).toBe("value_v2");
  });

  it("reads the default profile id from env when valid", () => {
    expect(defaultModelProfileIdFromEnv({ DEFAULT_MODEL_PROFILE_ID: "value_v1" })).toBe("value_v1");
    expect(defaultModelProfileIdFromEnv({ DEFAULT_MODEL_PROFILE_ID: "value_v2" })).toBe("value_v2");
  });

  it("returns fireworks-backed task configs for value_v1", () => {
    const conversation = getTaskConfig("value_v1", "conversation");
    expect(conversation.provider).toBe("fireworks_openai");
    expect(conversation.model).toContain("deepseek-v3p2");
    expect(conversation.reasoningMode).toBe("disabled");
  });

  it("returns fireworks kimi-k2-thinking task configs for value_v2", () => {
    const conversation = getTaskConfig("value_v2", "conversation");
    expect(conversation.provider).toBe("fireworks_openai");
    expect(conversation.model).toContain("kimi-k2-thinking");
    expect(conversation.reasoningMode).toBe("thinking");
    expect(conversation.thinkingBudget).toBe(2048);
  });

  it("isModelProfileId recognizes all profiles", () => {
    expect(isModelProfileId("frontier_v1")).toBe(true);
    expect(isModelProfileId("value_v1")).toBe(true);
    expect(isModelProfileId("value_v2")).toBe(true);
    expect(isModelProfileId("unknown")).toBe(false);
  });

  it("listModelProfiles includes all three profiles", () => {
    const profiles = listModelProfiles();
    expect(profiles).toHaveLength(3);
    expect(profiles.map(p => p.id)).toContain("value_v2");
  });

  it("default profile is value_v2", () => {
    expect(DEFAULT_MODEL_PROFILE_ID).toBe("value_v2");
  });
});
