import { describe, test, expect } from "vitest";
import { computeSoulFileCompleteness, COMPLETENESS_THRESHOLD } from "../../src/domain/matching.ts";
import { emptyVisibleSoulFile } from "../../src/domain/soulFile.ts";
import type { VisibleSoulFile } from "../../src/domain/schemas.ts";

describe("computeSoulFileCompleteness", () => {
  test("empty soul file has completeness 0", () => {
    const file = emptyVisibleSoulFile();
    expect(computeSoulFileCompleteness(file)).toBe(0);
  });

  test("fully filled soul file has completeness 1.0", () => {
    const file = fullSoulFile();
    expect(computeSoulFileCompleteness(file)).toBe(1.0);
  });

  test("portrait only gives 1/24", () => {
    const file = emptyVisibleSoulFile();
    file.portrait = "A warm soul.";
    expect(computeSoulFileCompleteness(file)).toBeCloseTo(1 / 24, 2);
  });

  test("all sections filled gives 7/24", () => {
    const file = emptyVisibleSoulFile();
    file.sections = {
      howYouMove: "x",
      howYouThink: "x",
      howYouConnect: "x",
      whatYouCarry: "x",
      whatLightsYouUp: "x",
      yourTensions: "x",
      yourVoice: "x"
    };
    expect(computeSoulFileCompleteness(file)).toBeCloseTo(7 / 24, 2);
  });

  test("completeness threshold is 0.7", () => {
    expect(COMPLETENESS_THRESHOLD).toBe(0.7);
  });

  test("personality spectrum entries count individually", () => {
    const file = emptyVisibleSoulFile();
    file.personalitySpectrum = {
      openness: { position: 80, label: "High", evidence: "..." },
      conscientiousness: { position: 60, label: "Med", evidence: "..." },
      extraversion: null,
      agreeableness: null,
      emotionalSensitivity: null
    };
    expect(computeSoulFileCompleteness(file)).toBeCloseTo(2 / 24, 2);
  });

  test("compass axes count individually", () => {
    const file = emptyVisibleSoulFile();
    file.compassScores = {
      openness: 70,
      vitality: 80,
      warmth: null,
      depth: null,
      purpose: null,
      resilience: null,
      autonomy: null,
      connection: null
    };
    expect(computeSoulFileCompleteness(file)).toBeCloseTo(2 / 24, 2);
  });

  test("typical mid-conversation soul file scores reasonably", () => {
    const file = emptyVisibleSoulFile();
    file.portrait = "A reflective thinker.";
    file.sections.howYouThink = "Pattern-oriented.";
    file.sections.howYouConnect = "Deeply.";
    file.crystallizedMoments = [{ quote: "test", reflection: "test" }];
    file.openThreads = ["creativity"];
    file.personalitySpectrum = {
      openness: { position: 82, label: "High", evidence: "..." },
      conscientiousness: null,
      extraversion: null,
      agreeableness: null,
      emotionalSensitivity: null
    };
    // 1 (portrait) + 2 (sections) + 1 (moments) + 1 (threads) + 1 (spectrum) = 6/24 = 0.25
    expect(computeSoulFileCompleteness(file)).toBeCloseTo(6 / 24, 2);
  });

  test("whitespace-only strings don't count as filled", () => {
    const file = emptyVisibleSoulFile();
    file.portrait = "   ";
    file.sections.howYouMove = "  \n  ";
    file.relationalStyle = "   ";
    expect(computeSoulFileCompleteness(file)).toBe(0);
  });
});

function fullSoulFile(): VisibleSoulFile {
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    portrait: "A warm soul.",
    sections: {
      howYouMove: "Deliberately.",
      howYouThink: "In patterns.",
      howYouConnect: "Deeply.",
      whatYouCarry: "Responsibility.",
      whatLightsYouUp: "Ideas.",
      yourTensions: "Solitude vs connection.",
      yourVoice: "Direct but warm."
    },
    crystallizedMoments: [{ quote: "test", reflection: "test" }],
    openThreads: ["creativity"],
    compassScores: {
      openness: 80,
      vitality: 75,
      warmth: 82,
      depth: 90,
      purpose: 88,
      resilience: 70,
      autonomy: 65,
      connection: 77
    },
    personalitySpectrum: {
      openness: { position: 82, label: "High", evidence: "..." },
      conscientiousness: { position: 71, label: "Med", evidence: "..." },
      extraversion: { position: 38, label: "Low", evidence: "..." },
      agreeableness: { position: 65, label: "Med", evidence: "..." },
      emotionalSensitivity: { position: 74, label: "High", evidence: "..." }
    },
    topValues: [{ value: "Authenticity", description: "Being genuine." }],
    relationalStyle: "Through consistency and depth.",
    completeness: 0
  };
}
