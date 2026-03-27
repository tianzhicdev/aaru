import { describe, it, expect } from "vitest";
import {
  buildSoulSystemPrompt,
  shouldExtract,
  buildSoulFallbackResponse
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
    expect(response).toContain("most people don't see");
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
