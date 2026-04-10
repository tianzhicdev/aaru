import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL_PROFILE_ID,
  defaultModelProfileIdFromEnv,
  getTaskConfig,
  isModelProfileId,
  listModelProfiles,
  normalizeModelProfileId,
  profileForLanguage
} from "../../workers/src/modelProfiles.ts";

describe("model profiles", () => {
  it("falls back to default for unknown profile ids", () => {
    expect(normalizeModelProfileId("not-real")).toBe(DEFAULT_MODEL_PROFILE_ID);
  });

  it("normalizes new profile ids", () => {
    expect(normalizeModelProfileId("frontier")).toBe("frontier");
    expect(normalizeModelProfileId("value_cjk")).toBe("value_cjk");
    expect(normalizeModelProfileId("value_default")).toBe("value_default");
  });

  it("normalizes legacy profile ids (backward compat)", () => {
    expect(normalizeModelProfileId("frontier_v1")).toBe("frontier");
    expect(normalizeModelProfileId("value_v1")).toBe("value_cjk");
    expect(normalizeModelProfileId("value_v2")).toBe("value_default");
  });

  it("reads the default profile id from env when valid", () => {
    expect(defaultModelProfileIdFromEnv({ DEFAULT_MODEL_PROFILE_ID: "value_cjk" })).toBe("value_cjk");
    expect(defaultModelProfileIdFromEnv({ DEFAULT_MODEL_PROFILE_ID: "value_default" })).toBe("value_default");
    expect(defaultModelProfileIdFromEnv({ DEFAULT_MODEL_PROFILE_ID: "value_v1" })).toBe("value_cjk");
  });

  it("returns fireworks deepseek task configs for value_cjk", () => {
    const conversation = getTaskConfig("value_cjk", "conversation");
    expect(conversation.provider).toBe("fireworks_openai");
    expect(conversation.model).toContain("deepseek-v3p2");
    expect(conversation.reasoningMode).toBe("disabled");
  });

  it("returns fireworks kimi-k2-thinking task configs for value_default", () => {
    const conversation = getTaskConfig("value_default", "conversation");
    expect(conversation.provider).toBe("fireworks_openai");
    expect(conversation.model).toContain("kimi-k2-thinking");
    expect(conversation.reasoningMode).toBe("thinking");
    expect(conversation.thinkingBudget).toBe(512);
  });

  it("isModelProfileId recognizes all profiles", () => {
    expect(isModelProfileId("frontier")).toBe(true);
    expect(isModelProfileId("value_cjk")).toBe(true);
    expect(isModelProfileId("value_default")).toBe(true);
    expect(isModelProfileId("frontier_v1")).toBe(false);
    expect(isModelProfileId("unknown")).toBe(false);
  });

  it("listModelProfiles includes all three profiles", () => {
    const profiles = listModelProfiles();
    expect(profiles).toHaveLength(3);
    expect(profiles.map(p => p.id)).toContain("value_default");
  });

  it("default profile is value_default", () => {
    expect(DEFAULT_MODEL_PROFILE_ID).toBe("value_default");
  });
});

describe("profileForLanguage", () => {
  it("returns value_cjk for CJK languages", () => {
    expect(profileForLanguage("zh-CN")).toBe("value_cjk");
    expect(profileForLanguage("ja")).toBe("value_cjk");
    expect(profileForLanguage("ko")).toBe("value_cjk");
  });

  it("returns value_default for non-CJK languages", () => {
    expect(profileForLanguage("en")).toBe("value_default");
    expect(profileForLanguage("fr")).toBe("value_default");
    expect(profileForLanguage("es")).toBe("value_default");
    expect(profileForLanguage("pt-BR")).toBe("value_default");
    expect(profileForLanguage("de")).toBe("value_default");
  });

  it("returns value_default for null/undefined", () => {
    expect(profileForLanguage(null)).toBe("value_default");
    expect(profileForLanguage(undefined)).toBe("value_default");
  });
});
