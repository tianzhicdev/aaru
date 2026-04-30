import { describe, expect, it } from "vitest";

import {
  buildSimPersona,
  parseSimTurn,
  formatTranscript,
  buildObserverPrompt,
  buildUserReasoningPrompt,
  observerResultSchema,
  SCENES,
  SCENE_IDS,
  CONNECTION_ZONES,
  type SimTurn,
  type ObserverResult,
  type SceneId
} from "../../src/domain/matchSimulation.ts";
import type { VisibleSoulFile, HiddenSoulFile } from "../../src/domain/schemas.ts";

const makeVisibleSoulFile = (overrides?: Partial<VisibleSoulFile>): VisibleSoulFile => ({
  version: 1,
  lastUpdated: "",
  portrait: "A warm person",
  sections: {
    howYouLightUp: "Through laughter",
    howYouShowUp: "With presence",
    howYouLove: "Deeply",
    howYouWeatherStorms: "With calm",
    whatYoureLookingFor: "Connection",
    yourGrowingEdges: "Patience",
    yourWarmth: "Genuine"
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
  relationalStyle: "Secure and open",
  attachmentStyle: "Secure",
  loveSignature: "Acts of service",
  completeness: 0.8,
  ...overrides
});

const makeHiddenSoulFile = (overrides?: Partial<HiddenSoulFile>): HiddenSoulFile => ({
  version: 1,
  lastUpdated: "",
  confidence: "medium",
  expertReflections: {
    psychologist: [],
    relationshipScientist: [],
    linguist: [],
    attachmentAnalyst: []
  },
  coreDrivers: [
    { driver: "connection", strength: 0.9, inferred: true, evidence: "seeks deep bonds" }
  ],
  coreValues: ["honesty", "growth"],
  voice: {
    register: "casual",
    density: "moderate",
    humorStyle: "dry wit",
    conflictStyle: "collaborative",
    disclosureRate: "gradual",
    signaturePatterns: ["uses metaphors"],
    voiceExamples: []
  },
  depthMap: { domainCoverage: [] },
  attachmentAssessment: "Secure with anxious tendencies",
  conflictProfile: "Collaborative, avoids escalation",
  analystNotes: [],
  honestInsights: [],
  ...overrides
});

describe("buildSimPersona", () => {
  it("builds a persona with voice profile and attachment info", () => {
    const visible = makeVisibleSoulFile();
    const hidden = makeHiddenSoulFile();
    const persona = buildSimPersona("Alex", visible, hidden);

    expect(persona.name).toBe("Alex");
    expect(persona.systemPrompt).toContain("You are Alex");
    expect(persona.systemPrompt).toContain("warm");
    expect(persona.systemPrompt).toContain("dry wit");
    expect(persona.systemPrompt).toContain("Secure with anxious tendencies");
    expect(persona.systemPrompt).toContain("Collaborative, avoids escalation");
    expect(persona.systemPrompt).toContain("connection (90%)");
    expect(persona.systemPrompt).toContain("honesty, growth");
    expect(persona.systemPrompt).toContain("THINK:");
    expect(persona.systemPrompt).toContain("SPEAK:");
  });

  it("handles missing optional fields gracefully", () => {
    const visible = makeVisibleSoulFile({
      relationalStyle: null,
      loveSignature: null
    });
    const hidden = makeHiddenSoulFile({
      attachmentAssessment: null,
      conflictProfile: null,
      coreDrivers: [],
      coreValues: []
    });
    const persona = buildSimPersona("Sam", visible, hidden);

    expect(persona.name).toBe("Sam");
    expect(persona.systemPrompt).toContain("You are Sam");
    expect(persona.systemPrompt).toContain("ATTACHMENT STYLE: unknown");
    expect(persona.systemPrompt).toContain("CONFLICT PROFILE: unknown");
  });
});

describe("parseSimTurn", () => {
  it("parses well-formatted THINK/SPEAK response", () => {
    const raw = "THINK: I'm nervous but excited to meet them.\nSPEAK: Hey! So nice to finally meet you in person.";
    const turn = parseSimTurn(raw, "Alex");

    expect(turn.speaker).toBe("Alex");
    expect(turn.think).toBe("I'm nervous but excited to meet them.");
    expect(turn.speak).toBe("Hey! So nice to finally meet you in person.");
  });

  it("handles missing THINK section", () => {
    const raw = "SPEAK: Hi there!";
    const turn = parseSimTurn(raw, "Jordan");

    expect(turn.speaker).toBe("Jordan");
    expect(turn.think).toBe("");
    expect(turn.speak).toBe("Hi there!");
  });

  it("falls back to raw text when no format is detected", () => {
    const raw = "Just a casual response without format.";
    const turn = parseSimTurn(raw, "Casey");

    expect(turn.speaker).toBe("Casey");
    expect(turn.speak).toBe("Just a casual response without format.");
  });

  it("handles multiline SPEAK content", () => {
    const raw = "THINK: This is deep.\nSPEAK: You know, I've been thinking about that too.\nIt really changed how I see things.";
    const turn = parseSimTurn(raw, "Riley");

    expect(turn.speaker).toBe("Riley");
    expect(turn.think).toBe("This is deep.");
    expect(turn.speak).toContain("I've been thinking about that too.");
    expect(turn.speak).toContain("It really changed how I see things.");
  });
});

describe("formatTranscript", () => {
  it("formats turns with speaker, think, and speak", () => {
    const turns: SimTurn[] = [
      { speaker: "Alex", think: "Nervous", speak: "Hey there!" },
      { speaker: "Jordan", think: "They seem nice", speak: "Hi! Great to meet you." }
    ];
    const result = formatTranscript(turns);

    expect(result).toContain("[Alex]");
    expect(result).toContain("THINK: Nervous");
    expect(result).toContain("SPEAK: Hey there!");
    expect(result).toContain("[Jordan]");
  });
});

describe("SCENES", () => {
  it("has 3 scene types", () => {
    expect(SCENE_IDS).toHaveLength(3);
    expect(SCENE_IDS).toEqual(["first_date", "vulnerability", "friction"]);
  });

  it("each scene has valid config", () => {
    for (const id of SCENE_IDS) {
      const scene = SCENES[id];
      expect(scene.id).toBe(id);
      expect(scene.label).toBeTruthy();
      expect(scene.setup).toBeTruthy();
      expect(scene.minTurns).toBeGreaterThanOrEqual(3);
      expect(scene.maxTurns).toBeGreaterThanOrEqual(scene.minTurns);
    }
  });
});

describe("observerResultSchema", () => {
  it("validates a correct observer result", () => {
    const input: ObserverResult = {
      dimensions: [
        { name: "Emotional Attunement", score: 0.8, evidence: "They responded with warmth" }
      ],
      connectionZones: ["Deep Divers", "Safe Harbor"],
      keyMoments: ["When Alex opened up about their fear"],
      overallScore: 0.75,
      decision: "match"
    };

    const result = observerResultSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects score out of range", () => {
    const input = {
      dimensions: [{ name: "Test", score: 1.5, evidence: "test" }],
      connectionZones: [],
      keyMoments: [],
      overallScore: 0.5,
      decision: "match"
    };

    const result = observerResultSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid decision", () => {
    const input = {
      dimensions: [],
      connectionZones: [],
      keyMoments: [],
      overallScore: 0.5,
      decision: "maybe"
    };

    const result = observerResultSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("buildObserverPrompt", () => {
  it("includes all three scene transcripts", () => {
    const transcripts: Record<SceneId, SimTurn[]> = {
      first_date: [{ speaker: "A", think: "hi", speak: "Hello" }],
      vulnerability: [{ speaker: "B", think: "deep", speak: "I need to tell you something" }],
      friction: [{ speaker: "A", think: "tense", speak: "I disagree" }]
    };

    const prompt = buildObserverPrompt(transcripts, "Alex", "Jordan");

    expect(prompt).toContain("Alex");
    expect(prompt).toContain("Jordan");
    expect(prompt).toContain("First Date");
    expect(prompt).toContain("Vulnerability");
    expect(prompt).toContain("Friction");
    expect(prompt).toContain("Hello");
    expect(prompt).toContain("I need to tell you something");
    expect(prompt).toContain("I disagree");
    expect(prompt).toContain("connectionZones");
    expect(prompt).toContain("keyMoments");
    expect(prompt).toContain("overallScore");
  });

  it("includes connection zone vocabulary", () => {
    const transcripts: Record<SceneId, SimTurn[]> = {
      first_date: [],
      vulnerability: [],
      friction: []
    };

    const prompt = buildObserverPrompt(transcripts, "A", "B");
    for (const zone of CONNECTION_ZONES) {
      expect(prompt).toContain(zone);
    }
  });
});

describe("buildUserReasoningPrompt", () => {
  it("includes other person's name and language instruction", () => {
    const observerResult: ObserverResult = {
      dimensions: [
        { name: "Emotional Attunement", score: 0.8, evidence: "Great emotional resonance" }
      ],
      connectionZones: ["Deep Divers", "Spark Igniters"],
      keyMoments: ["The café moment when eyes met"],
      overallScore: 0.78,
      decision: "match"
    };

    const prompt = buildUserReasoningPrompt(observerResult, "Jordan", "English");

    expect(prompt).toContain("Jordan");
    expect(prompt).toContain("English");
    expect(prompt).toContain("Do NOT start with any opener");
    expect(prompt).toContain("Deep Divers");
    expect(prompt).toContain("Great emotional resonance");
  });

  it("respects different languages", () => {
    const observerResult: ObserverResult = {
      dimensions: [],
      connectionZones: [],
      keyMoments: [],
      overallScore: 0.7,
      decision: "match"
    };

    const prompt = buildUserReasoningPrompt(observerResult, "太郎", "Japanese");
    expect(prompt).toContain("Japanese");
    expect(prompt).toContain("太郎");
  });
});
