import { describe, expect, it } from "vitest";
import {
  buildDepthGuidance,
  buildSoulSystemPrompt,
  detectSoftSessionGap,
  extractRecentAssistantQuestions
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
    ...overrides,
    completeness: overrides.completeness ?? 0
  };
}

function makeReflectionNote(overrides: Partial<ReflectionNote> = {}): ReflectionNote {
  return {
    updatedAt: "2026-03-31T00:00:00Z",
    domainCoverage: [],
    currentThreads: [],
    avoidPastObservations: [],
    avoidPastQuestions: [],
    steerToTopics: [],
    steeringPressure: "minimal",
    steeringReasoning: "",
    userOpenness: "warming",
    opennessEvidence: "",
    summary: "",
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

  it("includes summary, territory map, and navigation from reflection note", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      reflectionNote: makeReflectionNote({
        domainCoverage: [
          { domain: "work_and_purpose", depth: "deep", evidence: "Repeated job discussion" },
          { domain: "relationships", depth: "untouched", evidence: "" },
          { domain: "emotional_life", depth: "mentioned", evidence: "Brief mentions" }
        ],
        currentThreads: ["job drift", "creative hunger"],
        avoidPastObservations: ["You turn humor into armor"],
        avoidPastQuestions: ["What are you protecting with those walls?"],
        steerToTopics: ["Relationships — who do they turn to when things get hard?"],
        steeringPressure: "moderate",
        steeringReasoning: "Conversation narrowing to work, relationships untouched.",
        summary: "This person is a software engineer wrestling with whether to leave their job. They build walls when overwhelmed."
      })
    }));

    expect(prompt).toContain("CONVERSATION SUMMARY");
    expect(prompt).toContain("software engineer");
    expect(prompt).toContain("TERRITORY MAP");
    expect(prompt).toContain("Relationships: untouched");
    expect(prompt).toContain("EXPLORE");
    expect(prompt).toContain("NAVIGATION");
    expect(prompt).toContain("Relationships — who do they turn to");
    expect(prompt).toContain("Questions already asked");
    expect(prompt).toContain("What are you protecting with those walls?");
  });

  it("includes opening guidance when provided", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      openingKind: "returning"
    }));

    expect(prompt).toContain("OPENING MODE");
  });
});

describe("buildDepthGuidance", () => {
  it("returns empty for null reflection note", () => {
    expect(buildDepthGuidance(null)).toBe("");
  });

  it("returns guarded guidance for guarded openness", () => {
    const note = makeReflectionNote({ userOpenness: "guarded" });
    const guidance = buildDepthGuidance(note);
    expect(guidance).toContain("light and warm");
    expect(guidance).toContain("No probing");
  });

  it("returns warming guidance for warming openness", () => {
    const note = makeReflectionNote({ userOpenness: "warming" });
    const guidance = buildDepthGuidance(note);
    expect(guidance).toContain("Match their pace");
  });

  it("returns open guidance for open openness", () => {
    const note = makeReflectionNote({ userOpenness: "open" });
    const guidance = buildDepthGuidance(note);
    expect(guidance).toContain("ready for depth");
  });

  it("returns deep guidance for deep openness", () => {
    const note = makeReflectionNote({ userOpenness: "deep" });
    const guidance = buildDepthGuidance(note);
    expect(guidance).toContain("as deep as they're going");
  });

  it("defaults to warming when userOpenness is undefined", () => {
    const note = makeReflectionNote({});
    const guidance = buildDepthGuidance(note);
    expect(guidance).toContain("Match their pace");
  });

  it("injects depth guidance into system prompt", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      reflectionNote: makeReflectionNote({ userOpenness: "guarded" })
    }));
    expect(prompt).toContain("DEPTH GUIDANCE");
    expect(prompt).toContain("light and warm");
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

describe("extractRecentAssistantQuestions", () => {
  it("extracts questions from assistant messages", () => {
    const messages = [
      { role: "assistant", content: "What does your day look like? Tell me more." },
      { role: "user", content: "I work from home mostly." },
      { role: "assistant", content: "That sounds peaceful. Who do you spend your time with?" }
    ];

    const questions = extractRecentAssistantQuestions(messages);
    expect(questions).toContain("What does your day look like?");
    expect(questions).toContain("Who do you spend your time with?");
    expect(questions).not.toContain("Tell me more.");
  });

  it("deduplicates case-insensitively", () => {
    const messages = [
      { role: "assistant", content: "What matters most to you?" },
      { role: "assistant", content: "what matters most to you?" }
    ];

    const questions = extractRecentAssistantQuestions(messages);
    expect(questions).toHaveLength(1);
  });

  it("returns last 10 unique questions", () => {
    const messages = Array.from({ length: 15 }, (_, i) => ({
      role: "assistant",
      content: `Question number ${i + 1} for you?`
    }));

    const questions = extractRecentAssistantQuestions(messages);
    expect(questions).toHaveLength(10);
    expect(questions[9]).toContain("15");
  });

  it("ignores short questions", () => {
    const messages = [
      { role: "assistant", content: "Really? That's interesting. What happened next?" }
    ];

    const questions = extractRecentAssistantQuestions(messages);
    expect(questions).not.toContain("Really?");
    expect(questions).toContain("What happened next?");
  });
});
