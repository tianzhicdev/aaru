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
  values: ["honesty", "growth"],
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
      soul({ interests: ["film", "reading"], values: ["growth", "kindness"] }),
      transcript
    );

    expect(evaluation.score).toBeGreaterThan(0);
    expect(evaluation.score).toBeLessThanOrEqual(100);
    expect(evaluation.summary.length).toBeGreaterThan(10);
  });

  it("accumulates score and unlocks Ba when the other person's impression is above threshold", () => {
    const score = accumulateCompatibility(70, 90);
    expect(score).toBe(79);
    expect(isBaUnlocked(score, 68)).toBe(false);
    expect(isBaUnlocked(score, 81)).toBe(true);
  });
});
