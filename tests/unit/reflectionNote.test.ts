import { describe, expect, it } from "vitest";
import {
  buildReflectionPrompt,
  getReflectionNoteJsonSchema,
  parseReflectionNote
} from "../../src/domain/reflectionNote.ts";

describe("prompt builder", () => {
  const messages = [
    { role: "assistant", content: "Tell me about yourself." },
    { role: "user", content: "I build walls when I feel overwhelmed." }
  ];

  it("uses steering fields and domain coverage", () => {
    const prompt = buildReflectionPrompt(messages, 2);
    expect(prompt).toContain("domainCoverage");
    expect(prompt).toContain("steerToTopics");
    expect(prompt).toContain("avoidPastObservations");
    expect(prompt).toContain("avoidPastQuestions");
    expect(prompt).toContain("summary");
    expect(prompt).not.toContain("factualAnchors");
    expect(prompt).not.toContain("inferredBigFive");
  });

  it("exposes json schema for structured output calls", () => {
    expect(getReflectionNoteJsonSchema()).toMatchObject({ type: "object" });
  });
});

describe("parseReflectionNote", () => {
  it("parses the new schema with domain coverage and summary", () => {
    const note = parseReflectionNote(JSON.stringify({
      updatedAt: "2026-04-05T00:10:00Z",
      domainCoverage: [
        { domain: "work_and_purpose", depth: "deep", evidence: "Repeated job discussion" },
        { domain: "relationships", depth: "untouched", evidence: "" }
      ],
      currentThreads: ["job drift", "creative hunger"],
      avoidPastObservations: ["You use humor as armor"],
      avoidPastQuestions: ["What would freedom cost you?"],
      steerToTopics: ["Relationships — who do they turn to when things get hard?"],
      steeringPressure: "moderate",
      steeringReasoning: "Conversation narrowing to work, relationships untouched.",
      summary: "This person is a software engineer who keeps trying to leave their job but can't seem to pull the trigger."
    }));

    expect(note).not.toBeNull();
    expect(note?.domainCoverage).toHaveLength(2);
    expect(note?.domainCoverage[0]?.domain).toBe("work_and_purpose");
    expect(note?.domainCoverage[0]?.depth).toBe("deep");
    expect(note?.currentThreads).toContain("job drift");
    expect(note?.avoidPastQuestions).toContain("What would freedom cost you?");
    expect(note?.steeringPressure).toBe("moderate");
    expect(note?.summary).toContain("software engineer");
  });

  it("coerces structured steer-to-topic objects into flat strings", () => {
    const note = parseReflectionNote(JSON.stringify({
      updatedAt: "2026-04-05T00:10:00Z",
      domainCoverage: [],
      currentThreads: [],
      avoidPastObservations: [],
      avoidPastQuestions: [],
      steerToTopics: [
        {
          domain: "values_and_beliefs",
          angle: "what stability means when it is chosen instead of inherited"
        }
      ],
      steeringPressure: "moderate",
      steeringReasoning: "The conversation is circling.",
      summary: ""
    }));

    expect(note).not.toBeNull();
    expect(note?.steerToTopics).toEqual([
      "Values & Beliefs — what stability means when it is chosen instead of inherited"
    ]);
  });

  it("defaults missing fields gracefully", () => {
    const note = parseReflectionNote(JSON.stringify({
      updatedAt: "2026-04-05T00:00:00Z"
    }));

    expect(note).not.toBeNull();
    expect(note?.domainCoverage).toEqual([]);
    expect(note?.currentThreads).toEqual([]);
    expect(note?.steeringPressure).toBe("minimal");
    expect(note?.summary).toBe("");
  });
});
