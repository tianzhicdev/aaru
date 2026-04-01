import { describe, expect, it } from "vitest";
import {
  buildSoulFallbackResponse,
  buildSoulSystemPrompt,
  detectSoftSessionGap
} from "../../src/domain/soul.ts";
import type { SoulConversationContext } from "../../src/domain/soul.ts";
import type { ReflectionNote, VisibleSoulFile } from "../../src/domain/schemas.ts";

function makeVisibleSoulFile(overrides: Partial<VisibleSoulFile> = {}): VisibleSoulFile {
  return {
    version: 1,
    lastUpdated: "2026-03-31T00:00:00Z",
    portrait: null,
    sections: {
      howYouMove: "",
      howYouThink: "",
      howYouConnect: "",
      whatYouCarry: "",
      whatLightsYouUp: "",
      yourTensions: "",
      yourVoice: ""
    },
    crystallizedMoments: [],
    openThreads: [],
    compassScores: {},
    personalitySpectrum: {
      openness: null,
      conscientiousness: null,
      extraversion: null,
      agreeableness: null,
      emotionalSensitivity: null
    },
    topValues: [],
    relationalStyle: null,
    ...overrides
  };
}

function makeReflectionNote(overrides: Partial<ReflectionNote> = {}): ReflectionNote {
  return {
    updatedAt: "2026-03-31T00:00:00Z",
    factualAnchors: {},
    tensions: [],
    recurringThemes: [],
    notableAbsences: [],
    emotionalArc: "",
    currentThreads: [],
    avoidPastObservations: [],
    avoidPastQuestions: [],
    steerToTopics: [],
    steeringPressure: "minimal",
    steeringReasoning: "",
    ...overrides
  };
}

function makeContext(overrides: Partial<SoulConversationContext> = {}): SoulConversationContext {
  return {
    visibleSoulFile: null,
    reflectionNote: null,
    messages: [],
    openingKind: null,
    ...overrides
  };
}

describe("buildSoulSystemPrompt", () => {
  it("includes visible soul file context when available", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      visibleSoulFile: makeVisibleSoulFile({
        portrait: "A wanderer who builds bridges between worlds",
        sections: {
          howYouMove: "With quiet deliberation",
          howYouThink: "",
          howYouConnect: "",
          whatYouCarry: "",
          whatLightsYouUp: "Late-night conversations",
          yourTensions: "You want closeness but brace against it.",
          yourVoice: ""
        },
        crystallizedMoments: [{ quote: "I built walls", reflection: "Protection as architecture" }],
        openThreads: ["The door metaphor"],
        relationalStyle: "You open through ideas first, then through trust.",
        topValues: [{ value: "Self-Direction", description: "You want room to choose your own path." }]
      })
    }));

    expect(prompt).toContain("A wanderer who builds bridges");
    expect(prompt).toContain("Their tensions");
    expect(prompt).toContain("I built walls");
    expect(prompt).toContain("Self-Direction");
    expect(prompt).toContain("Relational style");
  });

  it("includes the new reflection memory and navigation block", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      reflectionNote: makeReflectionNote({
        factualAnchors: { job: "software engineer" },
        tensions: ["Says they love solitude but misses being chosen"],
        recurringThemes: ["architecture", "boundaries"],
        notableAbsences: ["family"],
        emotionalArc: "Started guarded, gradually opening up",
        currentThreads: ["job drift", "creative hunger"],
        avoidPastObservations: ["You turn humor into armor"],
        avoidPastQuestions: ["What are you protecting with those walls?"],
        steerToTopics: ["relationships — mention of intimacy never fully opened"],
        steeringPressure: "gentle",
        steeringReasoning: "The current thread is cooling without being dead."
      })
    }));

    expect(prompt).toContain("LATEST REFLECTION NOTE");
    expect(prompt).toContain("software engineer");
    expect(prompt).toContain("NAVIGATION (private)");
    expect(prompt.toLowerCase()).toContain("avoid re-asking these questions");
    expect(prompt).toContain("relationships — mention of intimacy never fully opened");
  });

  it("includes opening guidance and current events when provided", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      openingKind: "returning",
      xaiNews: [
        { topic: "AI safety", headline: "New regulations proposed", summary: "The EU proposed new AI safety regulations." }
      ]
    }));

    expect(prompt).toContain("OPENING MODE");
    expect(prompt).toContain("CURRENT CONTEXT");
    expect(prompt).toContain("AI safety");
  });
});

describe("buildSoulFallbackResponse", () => {
  it("returns an opening question for a first conversation", () => {
    const response = buildSoulFallbackResponse(makeContext({
      openingKind: "first_ever",
      reflectionNote: makeReflectionNote({
        steerToTopics: ["relationships — who gets past the guard"]
      })
    }));

    expect(response.length).toBeGreaterThan(20);
    expect(response).toMatch(/\?$/);
  });

  it("uses the preferred steer-to topic for returning users when no portrait exists", () => {
    const response = buildSoulFallbackResponse(makeContext({
      openingKind: "returning",
      reflectionNote: makeReflectionNote({
        steerToTopics: ["origins — the first time they learned to be funny to stay safe"]
      })
    }));

    expect(response).toContain("origins");
  });
});

describe("detectSoftSessionGap", () => {
  const threshold = 60 * 60 * 1000;

  function makeMessages(gaps: Array<{ role: string; minutesAfterStart: number; content?: string }>) {
    const base = new Date("2026-03-27T10:00:00Z").getTime();
    return gaps.map((message) => ({
      role: message.role,
      content: message.content || "test message",
      created_at: new Date(base + message.minutesAfterStart * 60 * 1000).toISOString()
    }));
  }

  it("returns null when no messages or only one message", () => {
    expect(detectSoftSessionGap([], threshold)).toBeNull();
    expect(detectSoftSessionGap(makeMessages([{ role: "user", minutesAfterStart: 0 }]), threshold)).toBeNull();
  });

  it("returns info when a gap exceeds the threshold", () => {
    const messages = makeMessages([
      { role: "user", minutesAfterStart: 0 },
      { role: "assistant", minutesAfterStart: 1 },
      { role: "user", minutesAfterStart: 5, content: "I need to go" },
      { role: "assistant", minutesAfterStart: 6 },
      { role: "user", minutesAfterStart: 120 }
    ]);

    const result = detectSoftSessionGap(messages, threshold);
    expect(result).not.toBeNull();
    expect(result?.softSessionCount).toBe(1);
    expect(result?.gapMs).toBeGreaterThanOrEqual(threshold);
    expect(result?.lastUserMessage).toBe("I need to go");
  });
});
