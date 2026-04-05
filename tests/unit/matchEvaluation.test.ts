import { describe, it, expect } from "vitest";
import {
  summarizeSoulForMatching,
  formatSoulSummary,
  buildMatchEvaluationPrompt,
  matchEvaluationResultSchema
} from "../../src/domain/matchEvaluation.ts";
import type { VisibleSoulFile } from "../../src/domain/schemas.ts";

function makeSoulFile(overrides: Partial<VisibleSoulFile> = {}): VisibleSoulFile {
  return {
    version: 1,
    lastUpdated: "2026-04-06T00:00:00Z",
    portrait: "A thoughtful introvert who loves deep conversations",
    sections: {
      howYouMove: "Deliberate and measured",
      howYouThink: "Systems thinker with creative sparks",
      howYouConnect: "One-on-one depth over crowds",
      whatYouCarry: "A sense of responsibility for others",
      whatLightsYouUp: "Learning something completely new",
      yourTensions: "Freedom vs. commitment",
      yourVoice: "Quiet but precise"
    },
    crystallizedMoments: [{ quote: "test", reflection: "test" }],
    openThreads: ["creativity"],
    compassScores: { openness: 80, warmth: 65, depth: 90 },
    personalitySpectrum: {
      openness: { position: 85, label: "Very open", evidence: "curious" },
      conscientiousness: { position: 60, label: "Moderate", evidence: "organized" },
      extraversion: null,
      agreeableness: null,
      emotionalSensitivity: null
    },
    topValues: [
      { value: "Authenticity", description: "Being genuine" },
      { value: "Growth", description: "Constant learning" }
    ],
    relationalStyle: "Secure with anxious tendencies",
    ...overrides,
    completeness: overrides.completeness ?? 0.75
  };
}

describe("summarizeSoulForMatching", () => {
  it("extracts non-empty sections", () => {
    const file = makeSoulFile();
    const summary = summarizeSoulForMatching(file);
    expect(Object.keys(summary.sections)).toHaveLength(7);
    expect(summary.sections.howYouMove).toBe("Deliberate and measured");
  });

  it("skips empty sections", () => {
    const file = makeSoulFile({
      sections: {
        howYouMove: "",
        howYouThink: "Active",
        howYouConnect: "",
        whatYouCarry: "",
        whatLightsYouUp: "",
        yourTensions: "",
        yourVoice: ""
      }
    });
    const summary = summarizeSoulForMatching(file);
    expect(Object.keys(summary.sections)).toHaveLength(1);
    expect(summary.sections.howYouThink).toBe("Active");
  });

  it("extracts compass scores", () => {
    const summary = summarizeSoulForMatching(makeSoulFile());
    expect(summary.compassScores.openness).toBe(80);
    expect(summary.compassScores.depth).toBe(90);
  });

  it("extracts personality highlights", () => {
    const summary = summarizeSoulForMatching(makeSoulFile());
    expect(summary.personalityHighlights).toHaveLength(2);
    expect(summary.personalityHighlights[0]).toContain("openness");
  });

  it("extracts top values", () => {
    const summary = summarizeSoulForMatching(makeSoulFile());
    expect(summary.topValues).toEqual(["Authenticity", "Growth"]);
  });

  it("extracts relational style", () => {
    const summary = summarizeSoulForMatching(makeSoulFile());
    expect(summary.relationalStyle).toBe("Secure with anxious tendencies");
  });

  it("handles empty soul file gracefully", () => {
    const file = makeSoulFile({
      portrait: null,
      sections: {
        howYouMove: "", howYouThink: "", howYouConnect: "",
        whatYouCarry: "", whatLightsYouUp: "", yourTensions: "", yourVoice: ""
      },
      compassScores: {},
      personalitySpectrum: {
        openness: null, conscientiousness: null, extraversion: null,
        agreeableness: null, emotionalSensitivity: null
      },
      topValues: [],
      relationalStyle: null
    });
    const summary = summarizeSoulForMatching(file);
    expect(Object.keys(summary.sections)).toHaveLength(0);
    expect(Object.keys(summary.compassScores)).toHaveLength(0);
    expect(summary.personalityHighlights).toHaveLength(0);
    expect(summary.topValues).toHaveLength(0);
    expect(summary.relationalStyle).toBeNull();
  });
});

describe("formatSoulSummary", () => {
  it("formats sections and metadata", () => {
    const summary = summarizeSoulForMatching(makeSoulFile());
    const text = formatSoulSummary("Person A", summary);
    expect(text).toContain("## Person A");
    expect(text).toContain("**howYouMove**: Deliberate and measured");
    expect(text).toContain("**Compass**:");
    expect(text).toContain("**Personality**:");
    expect(text).toContain("**Top Values**: Authenticity, Growth");
    expect(text).toContain("**Relational Style**: Secure with anxious tendencies");
  });
});

describe("buildMatchEvaluationPrompt", () => {
  it("includes both person summaries", () => {
    const summaryA = summarizeSoulForMatching(makeSoulFile());
    const summaryB = summarizeSoulForMatching(makeSoulFile({
      sections: {
        howYouMove: "Fast and energetic",
        howYouThink: "Intuitive",
        howYouConnect: "Through action",
        whatYouCarry: "Optimism",
        whatLightsYouUp: "Adventure",
        yourTensions: "Patience",
        yourVoice: "Bold"
      }
    }));
    const prompt = buildMatchEvaluationPrompt(summaryA, summaryB);
    expect(prompt).toContain("## Person A");
    expect(prompt).toContain("## Person B");
    expect(prompt).toContain("Deliberate and measured");
    expect(prompt).toContain("Fast and energetic");
  });
});

describe("matchEvaluationResultSchema", () => {
  it("validates a match result", () => {
    const result = matchEvaluationResultSchema.parse({
      decision: "match",
      score: 0.82,
      reasoning: "Strong value alignment and complementary personalities."
    });
    expect(result.decision).toBe("match");
    expect(result.score).toBe(0.82);
  });

  it("validates a no_match result", () => {
    const result = matchEvaluationResultSchema.parse({
      decision: "no_match",
      score: 0.3,
      reasoning: "Incompatible communication styles."
    });
    expect(result.decision).toBe("no_match");
  });

  it("rejects invalid decision", () => {
    expect(() => matchEvaluationResultSchema.parse({
      decision: "maybe",
      score: 0.5,
      reasoning: "Unsure."
    })).toThrow();
  });

  it("rejects score out of range", () => {
    expect(() => matchEvaluationResultSchema.parse({
      decision: "match",
      score: 1.5,
      reasoning: "Too high."
    })).toThrow();
  });
});
