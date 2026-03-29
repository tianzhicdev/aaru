import { describe, it, expect } from "vitest";
import {
  buildSoulSystemPrompt,
  buildSoulFallbackResponse,
  detectSoftSessionGap
} from "../../src/domain/soul.ts";
import type { SoulConversationContext } from "../../src/domain/soul.ts";

function makeContext(overrides: Partial<SoulConversationContext> = {}): SoulConversationContext {
  return {
    visibleSoulFile: null,
    reflectionNote: null,
    steering: null,
    messages: [],
    isFirstEverMessage: false,
    ...overrides
  };
}

describe("buildSoulSystemPrompt", () => {
  it("includes first conversation context when no soul file", () => {
    const prompt = buildSoulSystemPrompt(makeContext({ isFirstEverMessage: true }));
    expect(prompt).toContain("No soul file yet");
    expect(prompt).toContain("FIRST MESSAGE");
  });

  it("includes visible soul file context when available", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
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
        openThreads: ["The door metaphor"],
        compassScores: {}
      }
    }));
    expect(prompt).toContain("A wanderer who builds bridges");
    expect(prompt).toContain("With quiet deliberation");
    expect(prompt).toContain("I built walls");
  });

  it("includes reflection note as memory", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      reflectionNote: {
        updatedAt: "2026-03-26T00:00:00Z",
        factualAnchors: { job: "software engineer" },
        tensions: ["Says they love solitude but happiest memory involves a crowd"],
        recurringThemes: ["architecture", "boundaries"],
        notableAbsences: ["family"],
        emotionalArc: "Started guarded, gradually opening up",
        domainCoverage: [
          { domain: "work_and_purpose", depth: "explored", evidence: "Software engineer" },
          { domain: "origins", depth: "untouched", evidence: "" }
        ]
      }
    }));
    expect(prompt).toContain("YOUR MEMORY");
    expect(prompt).toContain("software engineer");
    expect(prompt).toContain("love solitude but happiest memory involves a crowd");
    expect(prompt).toContain("architecture");
    expect(prompt).toContain("family");
    expect(prompt).toContain("Started guarded");
    expect(prompt).toContain("work_and_purpose: explored");
  });

  it("includes steering section when steering context provided", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      steering: {
        domainCoverage: [
          { domain: "origins", depth: "explored", evidence: "Rural Oregon childhood" },
          { domain: "relationships", depth: "mentioned", evidence: "Referenced best friend" },
          { domain: "work_and_purpose", depth: "deep", evidence: "Career transition" },
          { domain: "values_and_beliefs", depth: "untouched", evidence: "" },
          { domain: "emotional_life", depth: "explored", evidence: "Anxiety strategies" },
          { domain: "growth_and_change", depth: "mentioned", evidence: "Moving cities" },
          { domain: "aspirations", depth: "untouched", evidence: "" }
        ],
        safeEntryPoints: ["work", "creative process"],
        unlockTopics: ["the door"],
        avoidEarly: ["family"],
        currentlyLiveTopics: ["identity"]
      }
    }));
    expect(prompt).toContain("INNER COMPASS");
    expect(prompt).toContain("Uncharted territory");
    expect(prompt).toContain("Values & Beliefs");
    expect(prompt).toContain("Safe entry points");
  });

  it("includes memory update instructions", () => {
    const prompt = buildSoulSystemPrompt(makeContext());
    expect(prompt).toContain("<<<MEMORY>>>");
    expect(prompt).toContain("domainCoverage");
    expect(prompt).toContain("factualAnchors");
  });

  it("includes continuous pacing guidance", () => {
    const prompt = buildSoulSystemPrompt(makeContext());
    expect(prompt).toContain("no time limit");
    expect(prompt).toContain("Never force closure");
  });

  it("includes story-over-assessment instruction", () => {
    const prompt = buildSoulSystemPrompt(makeContext());
    expect(prompt).toContain("Ask for stories, not self-assessments");
    expect(prompt).toContain("Tell me about a time");
  });

  it("includes returning user section when soul file has portrait", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      visibleSoulFile: {
        version: 2,
        lastUpdated: "2026-03-26",
        portrait: "A dreamer who builds alone",
        sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
        crystallizedMoments: [],
        openThreads: [],
        compassScores: {}
      }
    }));
    expect(prompt).toContain("RETURNING USER");
    expect(prompt).toContain("A dreamer who builds alone");
  });
});

describe("buildSoulFallbackResponse", () => {
  it("returns opening for first ever message", () => {
    const response = buildSoulFallbackResponse(makeContext({ isFirstEverMessage: true }));
    expect(response.length).toBeGreaterThan(20);
    expect(response).toMatch(/\?$/);
  });

  it("returns returning response with portrait when returning", () => {
    const response = buildSoulFallbackResponse(makeContext({
      messages: [],
      visibleSoulFile: {
        version: 1,
        lastUpdated: "2026-03-26",
        portrait: "A dreamer who builds alone",
        sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
        crystallizedMoments: [],
        openThreads: [],
        compassScores: {}
      }
    }));
    expect(response).toContain("A dreamer");
  });

  it("returns generic fallback for mid-conversation", () => {
    const response = buildSoulFallbackResponse(makeContext({
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
        { role: "user", content: "test" }
      ]
    }));
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

  it("returns info when gap exceeds threshold", () => {
    const msgs = makeMessages([
      { role: "user", minutesAfterStart: 0 },
      { role: "assistant", minutesAfterStart: 1 },
      { role: "user", minutesAfterStart: 5, content: "I need to go" },
      { role: "assistant", minutesAfterStart: 6 },
      { role: "user", minutesAfterStart: 120 }
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
      { role: "user", minutesAfterStart: 120 },
      { role: "assistant", minutesAfterStart: 121 },
      { role: "user", minutesAfterStart: 300 }
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
