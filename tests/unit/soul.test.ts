import { describe, it, expect } from "vitest";
import {
  buildSoulSystemPrompt,
  shouldExtract,
  buildSoulFallbackResponse,
  detectSoftSessionGap
} from "../../src/domain/soul.ts";
import type { SoulConversationContext } from "../../src/domain/soul.ts";
import { REFLECTION_INTERVAL } from "../../src/domain/constants.ts";

function makeContext(overrides: Partial<SoulConversationContext> = {}): SoulConversationContext {
  return {
    sessionNumber: 1,
    exchangeCount: 0,
    visibleSoulFile: null,
    reflectionNote: null,
    previousSummaries: [],
    messages: [],
    ...overrides
  };
}

describe("buildSoulSystemPrompt", () => {
  it("includes first conversation context when no soul file", () => {
    const prompt = buildSoulSystemPrompt(makeContext());
    expect(prompt).toContain("conversation 1");
    expect(prompt).toContain("No soul file yet");
    expect(prompt).toContain("first conversation");
  });

  it("includes visible soul file context when available", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      sessionNumber: 2,
      visibleSoulFile: {
        version: 1,
        lastUpdated: "2026-03-26T00:00:00Z",
        portrait: "A wanderer who builds bridges between worlds",
        sections: {
          howYouMove: "With quiet deliberation",
          howYouThink: "",
          howYouConnect: "",
          whatYouCarry: "",
          whatLightsYouUp: "Late-night conversations",
          yourContradictions: "",
          yourVoice: ""
        },
        crystallizedMoments: [{ quote: "I built walls", reflection: "Protection as architecture" }],
        openThreads: ["The door metaphor"]
      }
    }));
    expect(prompt).toContain("A wanderer who builds bridges");
    expect(prompt).toContain("With quiet deliberation");
    expect(prompt).toContain("I built walls");
  });

  it("includes reflection note as working memory", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      reflectionNote: {
        updatedAtExchange: 8,
        factualAnchors: { job: "software engineer" },
        tensions: ["Says they love solitude but happiest memory involves a crowd"],
        recurringThemes: ["architecture", "boundaries"],
        notableAbsences: ["family"],
        emotionalArc: "Started guarded, gradually opening up"
      }
    }));
    expect(prompt).toContain("WORKING MEMORY");
    expect(prompt).toContain("software engineer");
    expect(prompt).toContain("love solitude but happiest memory involves a crowd");
    expect(prompt).toContain("architecture");
    expect(prompt).toContain("family");
    expect(prompt).toContain("Started guarded");
  });

  it("includes previous summaries when available", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      sessionNumber: 2,
      previousSummaries: ["Talked about creativity and loneliness"]
    }));
    expect(prompt).toContain("Talked about creativity and loneliness");
  });

  it("includes exchange count", () => {
    const prompt = buildSoulSystemPrompt(makeContext({ exchangeCount: 5 }));
    expect(prompt).toContain("exchange 5");
  });

  it("includes continuous pacing guidance instead of session closing", () => {
    const prompt = buildSoulSystemPrompt(makeContext());
    expect(prompt).toContain("no time limit");
    expect(prompt).toContain("Never force closure");
    expect(prompt).not.toContain("[SESSION_COMPLETE]");
  });
});

describe("shouldExtract", () => {
  it("returns true at reflection interval", () => {
    expect(shouldExtract(REFLECTION_INTERVAL)).toBe(true);
    expect(shouldExtract(REFLECTION_INTERVAL * 2)).toBe(true);
    expect(shouldExtract(REFLECTION_INTERVAL * 3)).toBe(true);
  });

  it("returns false between intervals", () => {
    expect(shouldExtract(1)).toBe(false);
    expect(shouldExtract(REFLECTION_INTERVAL - 1)).toBe(false);
    expect(shouldExtract(REFLECTION_INTERVAL + 1)).toBe(false);
  });

  it("returns false at exchange 0", () => {
    expect(shouldExtract(0)).toBe(false);
  });

  it("uses interval of 8", () => {
    expect(REFLECTION_INTERVAL).toBe(8);
    expect(shouldExtract(8)).toBe(true);
    expect(shouldExtract(16)).toBe(true);
    expect(shouldExtract(7)).toBe(false);
  });
});

describe("buildSoulFallbackResponse", () => {
  it("returns first session opener for session 1 exchange 0", () => {
    const response = buildSoulFallbackResponse(makeContext());
    // Opener is randomly selected from a pool — verify it's a substantive question
    expect(response.length).toBeGreaterThan(20);
    expect(response).toMatch(/\?$/); // ends with a question mark
  });

  it("returns returning session opener with visible soul file portrait", () => {
    const response = buildSoulFallbackResponse(makeContext({
      sessionNumber: 2,
      exchangeCount: 0,
      visibleSoulFile: {
        version: 1,
        lastUpdated: "2026-03-26",
        portrait: "A dreamer who builds alone",
        sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
        crystallizedMoments: [],
        openThreads: []
      }
    }));
    expect(response).toContain("A dreamer");
  });

  it("returns generic fallback for mid-conversation", () => {
    const response = buildSoulFallbackResponse(makeContext({ exchangeCount: 3 }));
    expect(response.length).toBeGreaterThan(10);
  });
});

describe("detectSoftSessionGap", () => {
  const THRESHOLD = 60 * 60 * 1000; // 1 hour

  function makeMessages(gaps: Array<{ role: string; minutesAfterStart: number; content?: string }>) {
    const base = new Date("2026-03-27T10:00:00Z").getTime();
    return gaps.map((g) => ({
      role: g.role,
      content: g.content || "test message",
      created_at: new Date(base + g.minutesAfterStart * 60 * 1000).toISOString()
    }));
  }

  it("returns null when no messages", () => {
    expect(detectSoftSessionGap([], THRESHOLD)).toBeNull();
  });

  it("returns null with only one message", () => {
    const msgs = makeMessages([{ role: "user", minutesAfterStart: 0 }]);
    expect(detectSoftSessionGap(msgs, THRESHOLD)).toBeNull();
  });

  it("returns null when all messages are within threshold", () => {
    const msgs = makeMessages([
      { role: "user", minutesAfterStart: 0 },
      { role: "assistant", minutesAfterStart: 1 },
      { role: "user", minutesAfterStart: 5 },
      { role: "assistant", minutesAfterStart: 6 }
    ]);
    expect(detectSoftSessionGap(msgs, THRESHOLD)).toBeNull();
  });

  it("returns SoftSessionInfo when gap exceeds threshold", () => {
    const msgs = makeMessages([
      { role: "user", minutesAfterStart: 0 },
      { role: "assistant", minutesAfterStart: 1 },
      { role: "user", minutesAfterStart: 5, content: "I need to go" },
      { role: "assistant", minutesAfterStart: 6 },
      { role: "user", minutesAfterStart: 120 } // 2 hours later
    ]);
    const result = detectSoftSessionGap(msgs, THRESHOLD);
    expect(result).not.toBeNull();
    expect(result!.softSessionCount).toBe(1);
    expect(result!.gapMs).toBeGreaterThanOrEqual(THRESHOLD);
    expect(result!.lastUserMessage).toBe("I need to go");
  });

  it("correctly counts multiple soft sessions", () => {
    const msgs = makeMessages([
      { role: "user", minutesAfterStart: 0 },
      { role: "assistant", minutesAfterStart: 1 },
      { role: "user", minutesAfterStart: 120 }, // 2h gap
      { role: "assistant", minutesAfterStart: 121 },
      { role: "user", minutesAfterStart: 300 } // another 3h gap
    ]);
    const result = detectSoftSessionGap(msgs, THRESHOLD);
    expect(result).not.toBeNull();
    expect(result!.softSessionCount).toBe(2);
  });

  it("returns last user message before the gap", () => {
    const msgs = makeMessages([
      { role: "user", minutesAfterStart: 0, content: "hello" },
      { role: "assistant", minutesAfterStart: 1, content: "hi there" },
      { role: "user", minutesAfterStart: 2, content: "gotta run" },
      { role: "assistant", minutesAfterStart: 3, content: "see you" },
      { role: "user", minutesAfterStart: 120, content: "I'm back" }
    ]);
    const result = detectSoftSessionGap(msgs, THRESHOLD);
    expect(result).not.toBeNull();
    expect(result!.lastUserMessage).toBe("gotta run");
  });
});

describe("buildSoulSystemPrompt — returning after break", () => {
  it("includes RETURNING AFTER BREAK when returningAfterBreak is set", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      returningAfterBreak: {
        gapMs: 2 * 60 * 60 * 1000,
        softSessionCount: 1,
        lastUserMessage: "I need to think about that"
      }
    }));
    expect(prompt).toContain("RETURNING AFTER BREAK");
    expect(prompt).toContain("2h");
    expect(prompt).toContain("soft session 1");
    expect(prompt).toContain("I need to think about that");
  });

  it("does not include RETURNING AFTER BREAK when not set", () => {
    const prompt = buildSoulSystemPrompt(makeContext());
    expect(prompt).not.toContain("RETURNING AFTER BREAK");
  });
});
