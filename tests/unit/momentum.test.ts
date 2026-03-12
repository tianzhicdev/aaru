import { describe, expect, it } from "vitest";
import {
  getEffectiveMessageLimit,
  KA_MESSAGES_PER_CONVERSATION,
  CONVERSATION_EXTENSION_MESSAGES,
  MOMENTUM_QUALITY_THRESHOLD,
  MOMENTUM_RESPONSIVENESS_THRESHOLD
} from "@aaru/domain/constants.ts";
import { evaluateImpressionFallback } from "@aaru/domain/impression.ts";
import type { ConversationMessage, SoulProfile } from "@aaru/domain/types.ts";

const BASE_LIMIT = KA_MESSAGES_PER_CONVERSATION;

describe("getEffectiveMessageLimit", () => {
  it("returns base limit when scores are undefined", () => {
    expect(getEffectiveMessageLimit(BASE_LIMIT, undefined, undefined)).toBe(BASE_LIMIT);
  });

  it("returns base limit when only one score is undefined", () => {
    expect(getEffectiveMessageLimit(BASE_LIMIT, 90, undefined)).toBe(BASE_LIMIT);
    expect(getEffectiveMessageLimit(BASE_LIMIT, undefined, 90)).toBe(BASE_LIMIT);
  });

  it("returns base limit when scores are below thresholds", () => {
    expect(getEffectiveMessageLimit(BASE_LIMIT, 50, 50)).toBe(BASE_LIMIT);
    expect(getEffectiveMessageLimit(BASE_LIMIT, 79, 90)).toBe(BASE_LIMIT);
    expect(getEffectiveMessageLimit(BASE_LIMIT, 90, 79)).toBe(BASE_LIMIT);
  });

  it("extends by 4 when both scores meet thresholds", () => {
    const extended = BASE_LIMIT + CONVERSATION_EXTENSION_MESSAGES;
    expect(getEffectiveMessageLimit(BASE_LIMIT, 80, 80)).toBe(extended);
    expect(getEffectiveMessageLimit(BASE_LIMIT, 100, 100)).toBe(extended);
    expect(getEffectiveMessageLimit(BASE_LIMIT, 90, 85)).toBe(extended);
  });

  it("exact boundary: both at threshold returns extended", () => {
    expect(getEffectiveMessageLimit(BASE_LIMIT, MOMENTUM_RESPONSIVENESS_THRESHOLD, MOMENTUM_QUALITY_THRESHOLD))
      .toBe(BASE_LIMIT + CONVERSATION_EXTENSION_MESSAGES);
  });

  it("just below boundary: one at threshold-1 returns base", () => {
    expect(getEffectiveMessageLimit(BASE_LIMIT, MOMENTUM_RESPONSIVENESS_THRESHOLD - 1, MOMENTUM_QUALITY_THRESHOLD))
      .toBe(BASE_LIMIT);
    expect(getEffectiveMessageLimit(BASE_LIMIT, MOMENTUM_RESPONSIVENESS_THRESHOLD, MOMENTUM_QUALITY_THRESHOLD - 1))
      .toBe(BASE_LIMIT);
  });
});

describe("evaluateImpressionFallback sub-scores", () => {
  const soul = (overrides: Partial<SoulProfile>): SoulProfile => ({
    personality: "Curious and kind",
    interests: ["film", "music", "travel"],
    values: {
      self_transcendence: 0.7,
      self_enhancement: 0.4,
      openness_to_change: 0.8,
      conservation: 0.3,
      expressed: ["honesty", "growth"]
    },
    narrative: {
      formative_stories: [],
      self_defining_memories: [],
      narrative_themes: []
    },
    avoid_topics: [],
    raw_input: "sample",
    guessed_fields: [],
    ...overrides
  });

  it("returns responsiveness and conversation_quality fields", () => {
    const transcript: ConversationMessage[] = Array.from({ length: 10 }, (_, i) => ({
      user_id: crypto.randomUUID(),
      type: "ka_generated",
      content: `Message ${i}`
    }));
    const result = evaluateImpressionFallback(
      soul({}),
      soul({ interests: ["film", "music", "cooking"] }),
      transcript
    );
    expect(result.responsiveness).toBeTypeOf("number");
    expect(result.conversation_quality).toBeTypeOf("number");
    expect(result.responsiveness).toBeGreaterThanOrEqual(0);
    expect(result.responsiveness).toBeLessThanOrEqual(100);
    expect(result.conversation_quality).toBeGreaterThanOrEqual(0);
    expect(result.conversation_quality).toBeLessThanOrEqual(100);
  });

  it("responsiveness increases with more messages", () => {
    const shortTranscript: ConversationMessage[] = [
      { user_id: crypto.randomUUID(), type: "ka_generated", content: "Hi" }
    ];
    const longTranscript: ConversationMessage[] = Array.from({ length: 10 }, (_, i) => ({
      user_id: crypto.randomUUID(),
      type: "ka_generated",
      content: `Message ${i}`
    }));
    const shortResult = evaluateImpressionFallback(soul({}), soul({}), shortTranscript);
    const longResult = evaluateImpressionFallback(soul({}), soul({}), longTranscript);
    expect(longResult.responsiveness!).toBeGreaterThan(shortResult.responsiveness!);
  });
});
