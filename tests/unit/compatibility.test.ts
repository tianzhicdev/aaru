import { describe, expect, it } from "vitest";
import {
  accumulateCompatibility,
  evaluateCompatibility,
  isBaUnlocked,
  shouldEvaluateCompatibility
} from "@aaru/domain/compatibility.ts";
import type { ConversationMessage, SoulProfile } from "@aaru/domain/types.ts";

const soul = (overrides: Partial<SoulProfile>): SoulProfile => ({
  personality: "Curious and kind",
  interests: ["film", "music", "travel"],
  values: {
    self_transcendence: 0.5,
    self_enhancement: 0.5,
    openness_to_change: 0.5,
    conservation: 0.5,
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

const transcript: ConversationMessage[] = [
  { user_id: crypto.randomUUID(), type: "ka_generated", content: "Hi" },
  { user_id: crypto.randomUUID(), type: "ka_generated", content: "Hello" },
  { user_id: crypto.randomUUID(), type: "ka_generated", content: "Let's talk" },
  { user_id: crypto.randomUUID(), type: "ka_generated", content: "Sure" },
  { user_id: crypto.randomUUID(), type: "ka_generated", content: "Great" }
];

describe("compatibility", () => {
  it("evaluates every fifth message", () => {
    expect(shouldEvaluateCompatibility(4)).toBe(false);
    expect(shouldEvaluateCompatibility(5)).toBe(true);
  });

  it("produces a bounded score and summary", async () => {
    const evaluation = await evaluateCompatibility(
      soul({ interests: ["film", "music"] }),
      soul({ interests: ["film", "reading"], values: { self_transcendence: 0.7, self_enhancement: 0.3, openness_to_change: 0.6, conservation: 0.4, expressed: ["growth", "kindness"] } }),
      transcript
    );

    expect(evaluation.score).toBeGreaterThan(0);
    expect(evaluation.score).toBeLessThanOrEqual(100);
    expect(evaluation.summary.length).toBeGreaterThan(10);
  });

  it("accumulates score with encounter-count-aware weighting", () => {
    // encounterCount=1 (default): historyWeight = min(0.65, 0.40 + 0.025) = 0.425
    const score1 = accumulateCompatibility(70, 90);
    expect(score1).toBe(82); // 70*0.425 + 90*0.575 = 81.5 -> 82

    // encounterCount=10: historyWeight = min(0.65, 0.40 + 0.25) = 0.65
    const score10 = accumulateCompatibility(70, 90, 10);
    expect(score10).toBe(77); // 70*0.65 + 90*0.35 = 45.5 + 31.5 = 77
  });

  it("unlocks Ba when the other person's impression is above threshold", () => {
    expect(isBaUnlocked(82, 68)).toBe(false);
    expect(isBaUnlocked(82, 81)).toBe(true);
  });
});
