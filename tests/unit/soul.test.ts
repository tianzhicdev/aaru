import { describe, expect, it } from "vitest";
import {
  buildSoulFallbackResponse,
  buildSoulSystemPrompt,
  deriveConversationSteering,
  detectSoftSessionGap,
  normalizeDomainCoverage,
  pickLeastCoveredDomain
} from "../../src/domain/soul.ts";
import type { SoulConversationContext } from "../../src/domain/soul.ts";
import type { ReflectionNote, VisibleSoulFile } from "../../src/domain/schemas.ts";

function makeVisibleSoulFile(overrides: Partial<VisibleSoulFile> = {}): VisibleSoulFile {
  return {
    version: 1,
    lastUpdated: "2026-03-26T00:00:00Z",
    portrait: null,
    sections: {
      howYouMove: "",
      howYouThink: "",
      howYouConnect: "",
      whatYouCarry: "",
      whatLightsYouUp: "",
      yourContradictions: "",
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
    updatedAt: "2026-03-26T00:00:00Z",
    factualAnchors: {},
    tensions: [],
    recurringThemes: [],
    notableAbsences: [],
    emotionalArc: "",
    domainCoverage: [],
    recentAssistantQuestions: [],
    openLoops: [],
    inferredBigFive: {
      openness: null,
      conscientiousness: null,
      extraversion: null,
      agreeableness: null,
      neuroticism: null
    },
    attachmentSignals: [],
    valueSignals: [],
    moralFoundationSignals: [],
    conflictStyle: "",
    meaningOrientation: "",
    ...overrides
  };
}

function makeContext(overrides: Partial<SoulConversationContext> = {}): SoulConversationContext {
  return {
    visibleSoulFile: null,
    reflectionNote: null,
    steering: null,
    messages: [],
    openingKind: null,
    ...overrides
  };
}

describe("buildSoulSystemPrompt", () => {
  it("includes opening guidance for first conversations", () => {
    const prompt = buildSoulSystemPrompt(makeContext({ openingKind: "first_ever" }));
    expect(prompt).toContain("OPENING MODE");
    expect(prompt).toContain("very first conversation");
  });

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
          yourContradictions: "",
          yourVoice: ""
        },
        crystallizedMoments: [{ quote: "I built walls", reflection: "Protection as architecture" }],
        openThreads: ["The door metaphor"],
        relationalStyle: "You open through ideas first, then through trust.",
        topValues: [{ value: "Self-Direction", description: "You want room to choose your own path." }]
      })
    }));

    expect(prompt).toContain("A wanderer who builds bridges");
    expect(prompt).toContain("With quiet deliberation");
    expect(prompt).toContain("I built walls");
    expect(prompt).toContain("Self-Direction");
    expect(prompt).toContain("Relational style");
  });

  it("includes reflection snapshots and anti-repeat memory", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      reflectionNote: makeReflectionNote({
        factualAnchors: { job: "software engineer" },
        tensions: ["Says they love solitude but happiest memory involves a crowd"],
        recurringThemes: ["architecture", "boundaries"],
        notableAbsences: ["family"],
        emotionalArc: "Started guarded, gradually opening up",
        domainCoverage: [
          { domain: "work_and_purpose", depth: "explored", evidence: "Software engineer" },
          { domain: "origins", depth: "untouched", evidence: "" }
        ],
        recentAssistantQuestions: ["What are you protecting with those walls?"],
        openLoops: ["The door metaphor"],
        inferredBigFive: {
          openness: { score: 73, confidence: "medium", evidence: "Explores complex ideas freely" },
          conscientiousness: null,
          extraversion: null,
          agreeableness: null,
          neuroticism: null
        },
        conflictStyle: "Tends to step back before responding.",
        meaningOrientation: "Feels purpose as something they are still trying to name."
      })
    }));

    expect(prompt).toContain("LATEST REFLECTION SNAPSHOT");
    expect(prompt).toContain("software engineer");
    expect(prompt).toContain("Recent assistant questions already asked");
    expect(prompt).toContain("The door metaphor");
    expect(prompt).toContain("Running trait estimates");
    expect(prompt).toContain("Conflict style signal");
    expect(prompt).toContain("Do not ask a substantially similar question");
  });

  it("includes steering section, insight delivery, and moral scenarios when values are active", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      steering: {
        domainCoverage: [
          { domain: "origins", depth: "explored", evidence: "Rural Oregon childhood" },
          { domain: "relationships", depth: "mentioned", evidence: "Referenced best friend" },
          { domain: "work_and_purpose", depth: "deep", evidence: "Career transition" },
          { domain: "values_and_beliefs", depth: "explored", evidence: "Talked about loyalty and fairness" },
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
    expect(prompt).toContain("Insight delivery");
    expect(prompt).toContain("Uncharted territory");
    expect(prompt).toContain("Steering pressure");
    expect(prompt).toContain("Scenario prompts you may use naturally");
  });

  it("includes story-over-assessment instruction and current events when provided", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      xaiNews: [
        { topic: "AI safety", headline: "New regulations proposed", summary: "The EU proposed new AI safety regulations." }
      ]
    }));

    expect(prompt).toContain("Ask for stories, not self-assessments");
    expect(prompt).toContain("CURRENT CONTEXT");
    expect(prompt).toContain("AI safety");
  });
});

describe("buildSoulFallbackResponse", () => {
  it("returns an opening question for first ever message", () => {
    const response = buildSoulFallbackResponse(makeContext({ openingKind: "first_ever" }));
    expect(response.length).toBeGreaterThan(20);
    expect(response).toMatch(/\?$/);
  });

  it("returns a resume response with portrait when resuming after gap", () => {
    const response = buildSoulFallbackResponse(makeContext({
      openingKind: "resume_after_gap",
      visibleSoulFile: makeVisibleSoulFile({ portrait: "A dreamer who builds alone" })
    }));
    expect(response).toContain("A dreamer");
  });

  it("returns a reply-shaped fallback when the assistant turn is pending", () => {
    const response = buildSoulFallbackResponse(makeContext({
      openingKind: "assistant_turn",
      messages: [
        { role: "assistant", content: "Earlier you said work feels thin." },
        { role: "user", content: "I keep thinking about leaving." }
      ]
    }));
    expect(response).toContain("I keep thinking about leaving");
  });
});

describe("conversation steering helpers", () => {
  it("normalizes domain coverage to all 7 domains", () => {
    const coverage = normalizeDomainCoverage([
      { domain: "origins", depth: "mentioned", evidence: "Childhood move" },
      { domain: "work_and_purpose", depth: "explored", evidence: "Career tension" }
    ]);

    expect(coverage).toHaveLength(7);
    expect(coverage.find((entry) => entry.domain === "relationships")?.depth).toBe("untouched");
    expect(coverage.find((entry) => entry.domain === "work_and_purpose")?.depth).toBe("explored");
  });

  it("picks the least covered domain", () => {
    const domain = pickLeastCoveredDomain([
      { domain: "origins", depth: "deep", evidence: "Detailed stories" },
      { domain: "relationships", depth: "mentioned", evidence: "Brief mention" },
      { domain: "work_and_purpose", depth: "explored", evidence: "Discussed in depth" }
    ]);

    expect(domain).toBe("values_and_beliefs");
  });

  it("derives steering from reflection snapshots", () => {
    const { steering, source } = deriveConversationSteering(makeReflectionNote({
      factualAnchors: { work: "I keep trying to leave this job" },
      tensions: ["Wants freedom but clings to stability"],
      recurringThemes: ["job drift", "creative hunger"],
      emotionalArc: "Restless",
      domainCoverage: [
        { domain: "work_and_purpose", depth: "explored", evidence: "Repeated job discussion" },
        { domain: "aspirations", depth: "mentioned", evidence: "Wants something more" }
      ],
      recentAssistantQuestions: ["What would freedom cost you?"],
      openLoops: ["What 'something more' actually looks like"]
    }));

    expect(source).toBe("reflection_snapshot");
    expect(steering).not.toBeNull();
    expect(steering?.domainCoverage).toHaveLength(7);
    expect(steering?.unlockTopics).toContain("Wants freedom but clings to stability");
    expect(steering?.currentlyLiveTopics).toContain("What 'something more' actually looks like");
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

  it("returns info when gap exceeds threshold", () => {
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
