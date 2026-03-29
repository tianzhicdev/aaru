import { describe, it, expect } from "vitest";
import {
  buildReengagementPrompt,
  parseReengagementQuestion,
  getReengagementFallback
} from "../../src/domain/reengagement.ts";
import type { HiddenSoulFile, VisibleSoulFile } from "../../src/domain/schemas.ts";

const mockHiddenSoulFile: HiddenSoulFile = {
  version: 1,
  lastUpdated: "2026-03-25T00:00:00Z",
  confidence: "medium",
  expertReflections: {
    psychologist: ["Shows avoidant attachment patterns"],
    sociologist: ["Positions as outsider in group contexts"],
    linguist: ["Uses nature metaphors for emotional states"],
    narrativeAnalyst: ["Casts self as reluctant hero"]
  },
  coreDrivers: [
    { driver: "autonomy", strength: 0.9, inferred: true, evidence: "I need space to think" },
    { driver: "meaning", strength: 0.8, inferred: false, evidence: "What's the point if it doesn't matter?" }
  ],
  coreValues: ["authenticity", "freedom", "depth"],
  voice: {
    register: "casual",
    density: "moderate",
    humorStyle: "dry, self-deprecating",
    conflictStyle: "avoidant then explosive",
    disclosureRate: "gradual",
    signaturePatterns: ["trailing off mid-thought"],
    voiceExamples: []
  },
  depthMap: {
    safeEntryPoints: ["creative work", "travel memories"],
    unlockTopics: ["relationship with father", "career pivot"],
    avoidEarly: ["childhood trauma"],
    currentlyLiveTopics: ["whether to leave current job"],
    domainCoverage: []
  },
  analystNotes: ["Contradiction: craves connection but builds walls"]
};

const mockVisibleSoulFile: VisibleSoulFile = {
  version: 2,
  lastUpdated: "2026-03-25T00:00:00Z",
  portrait: "You move through the world like someone who left home a long time ago and hasn't quite found the next one.",
  sections: {
    howYouMove: "Deliberately, with quiet observation",
    howYouThink: "In spirals, circling back to the same questions",
    howYouConnect: "Through shared silence more than words",
    whatYouCarry: "The weight of unfinished conversations",
    whatLightsYouUp: "Dawn light and the first coffee of the day",
    yourContradictions: "You want to be seen but hide instinctively",
    yourVoice: "Measured and dry, with sudden bursts of poetry"
  },
  crystallizedMoments: [
    { quote: "I built walls so tall I forgot there was a door", reflection: "Protection became prison" }
  ],
  openThreads: [
    "The door metaphor — what's on the other side?",
    "Why you stopped painting",
    "The letter you never sent"
  ],
  compassScores: {}
};

describe("buildReengagementPrompt", () => {
  it("builds a prompt with full user context", () => {
    const prompt = buildReengagementPrompt(
      mockHiddenSoulFile,
      mockVisibleSoulFile,
      [
        { role: "user", content: "I've been thinking about doors again" },
        { role: "assistant", content: "Tell me about the door you see right now" }
      ]
    );

    expect(prompt).toContain("re-engagement question");
    expect(prompt).toContain("The door metaphor");
    expect(prompt).toContain("autonomy");
    expect(prompt).toContain("whether to leave current job");
    expect(prompt).toContain("Thumos: Tell me about the door");
    expect(prompt).toContain("notificationText");
    expect(prompt).toContain("under 100 characters");
  });

  it("builds a prompt with null soul files", () => {
    const prompt = buildReengagementPrompt(null, null, []);
    expect(prompt).toContain("early-stage user");
    expect(prompt).toContain("No recent messages");
    expect(prompt).toContain("No open threads");
  });

  it("limits recent messages to 5", () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`
    }));
    const prompt = buildReengagementPrompt(null, null, messages);
    // Should contain last 5 messages (indices 5-9)
    expect(prompt).toContain("Message 5");
    expect(prompt).toContain("Message 9");
    expect(prompt).not.toContain("Message 4");
  });
});

describe("parseReengagementQuestion", () => {
  it("parses valid JSON response", () => {
    const raw = JSON.stringify({
      notificationText: "What happened with that letter you never sent?",
      fullQuestion: "You mentioned a letter you never sent. What would you say in it today if you could?",
      threadReference: "The letter you never sent"
    });

    const result = parseReengagementQuestion(raw);
    expect(result).not.toBeNull();
    expect(result!.notificationText).toBe("What happened with that letter you never sent?");
    expect(result!.fullQuestion).toContain("letter you never sent");
    expect(result!.threadReference).toBe("The letter you never sent");
  });

  it("truncates notificationText to 100 chars", () => {
    const raw = JSON.stringify({
      notificationText: "A".repeat(150),
      fullQuestion: "Test question",
      threadReference: "general"
    });

    const result = parseReengagementQuestion(raw);
    expect(result).not.toBeNull();
    expect(result!.notificationText.length).toBeLessThanOrEqual(100);
  });

  it("truncates fullQuestion to 500 chars", () => {
    const raw = JSON.stringify({
      notificationText: "Short",
      fullQuestion: "B".repeat(600),
      threadReference: "general"
    });

    const result = parseReengagementQuestion(raw);
    expect(result).not.toBeNull();
    expect(result!.fullQuestion.length).toBeLessThanOrEqual(500);
  });

  it("returns null for invalid JSON", () => {
    expect(parseReengagementQuestion("not json")).toBeNull();
  });

  it("returns null for missing required fields", () => {
    expect(parseReengagementQuestion(JSON.stringify({ notificationText: "test" }))).toBeNull();
    expect(parseReengagementQuestion(JSON.stringify({ fullQuestion: "test" }))).toBeNull();
  });

  it("strips markdown code fences", () => {
    const raw = "```json\n" + JSON.stringify({
      notificationText: "Test",
      fullQuestion: "Full test question",
      threadReference: "general"
    }) + "\n```";

    const result = parseReengagementQuestion(raw);
    expect(result).not.toBeNull();
    expect(result!.notificationText).toBe("Test");
  });

  it("defaults threadReference to 'general' if missing", () => {
    const raw = JSON.stringify({
      notificationText: "Test",
      fullQuestion: "Full question"
    });

    const result = parseReengagementQuestion(raw);
    expect(result).not.toBeNull();
    expect(result!.threadReference).toBe("general");
  });
});

describe("getReengagementFallback", () => {
  it("returns a valid question structure", () => {
    const question = getReengagementFallback();
    expect(question.notificationText).toBeTruthy();
    expect(question.notificationText.length).toBeLessThanOrEqual(100);
    expect(question.fullQuestion).toBeTruthy();
    expect(question.threadReference).toBe("general");
  });

  it("returns consistent question for same user in same week", () => {
    const q1 = getReengagementFallback("user-123");
    const q2 = getReengagementFallback("user-123");
    expect(q1.notificationText).toBe(q2.notificationText);
  });

  it("returns different questions for different users", () => {
    // With enough users, at least some should get different questions
    const questions = new Set<string>();
    for (let i = 0; i < 20; i++) {
      questions.add(getReengagementFallback(`user-${i}`).notificationText);
    }
    expect(questions.size).toBeGreaterThan(1);
  });

  it("returns a random question when no userId", () => {
    const question = getReengagementFallback();
    expect(question.notificationText.length).toBeGreaterThan(0);
  });
});
