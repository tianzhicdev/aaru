import { describe, test, expect } from "vitest";
import {
  COMPLETENESS_THRESHOLD,
  computeCoverageProgress,
  computeSoulFileCompleteness
} from "../../src/domain/matching.ts";
import { emptyVisibleSoulFile } from "../../src/domain/soulFile.ts";
import { LIFE_DOMAINS, type DomainCoverageEntry, type VisibleSoulFile } from "../../src/domain/schemas.ts";

describe("computeSoulFileCompleteness", () => {
  test("empty soul file has completeness 0", () => {
    const file = emptyVisibleSoulFile();
    expect(computeSoulFileCompleteness(file)).toBe(0);
  });

  test("fully filled soul file has completeness 1.0", () => {
    const file = fullSoulFile();
    expect(computeSoulFileCompleteness(file)).toBe(1.0);
  });

  test("portrait only gives 1/26", () => {
    const file = emptyVisibleSoulFile();
    file.portrait = "A warm soul.";
    expect(computeSoulFileCompleteness(file)).toBeCloseTo(1 / 26, 2);
  });

  test("all sections filled gives 7/26", () => {
    const file = emptyVisibleSoulFile();
    file.sections = {
      howYouLightUp: "x",
      howYouShowUp: "x",
      howYouLove: "x",
      howYouWeatherStorms: "x",
      whatYoureLookingFor: "x",
      yourGrowingEdges: "x",
      yourWarmth: "x"
    };
    expect(computeSoulFileCompleteness(file)).toBeCloseTo(7 / 26, 2);
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
    expect(computeSoulFileCompleteness(file)).toBeCloseTo(2 / 26, 2);
  });

  test("compass axes count individually", () => {
    const file = emptyVisibleSoulFile();
    file.compassScores = {
      openness: 70,
      playfulness: 80,
      warmth: null,
      emotional_depth: null,
      devotion: null,
      resilience: null,
      independence: null,
      passion: null
    };
    expect(computeSoulFileCompleteness(file)).toBeCloseTo(2 / 26, 2);
  });

  test("typical mid-conversation soul file scores reasonably", () => {
    const file = emptyVisibleSoulFile();
    file.portrait = "A reflective thinker.";
    file.sections.howYouShowUp = "Pattern-oriented.";
    file.sections.howYouLove = "Deeply.";
    file.crystallizedMoments = [{ quote: "test", reflection: "test" }];
    file.openThreads = ["creativity"];
    file.personalitySpectrum = {
      openness: { position: 82, label: "High", evidence: "..." },
      conscientiousness: null,
      extraversion: null,
      agreeableness: null,
      emotionalSensitivity: null
    };
    // 1 (portrait) + 2 (sections) + 1 (moments) + 1 (threads) + 1 (spectrum) = 6/26 = 0.23
    expect(computeSoulFileCompleteness(file)).toBeCloseTo(6 / 26, 2);
  });

  test("whitespace-only strings don't count as filled", () => {
    const file = emptyVisibleSoulFile();
    file.portrait = "   ";
    file.sections.howYouLightUp = "  \n  ";
    file.relationalStyle = "   ";
    expect(computeSoulFileCompleteness(file)).toBe(0);
  });
});

describe("computeCoverageProgress", () => {
  test("empty coverage gives all untouched and locked", () => {
    const progress = computeCoverageProgress([]);
    expect(progress.unlocked).toBe(false);
    expect(progress.exploredCount).toBe(0);
    expect(progress.totalDomains).toBe(7);
    for (const domain of LIFE_DOMAINS) {
      expect(progress.perDomain[domain]).toBe("untouched");
    }
  });

  test("null/undefined coverage is treated as empty", () => {
    expect(computeCoverageProgress(null).unlocked).toBe(false);
    expect(computeCoverageProgress(undefined).unlocked).toBe(false);
  });

  test("'mentioned' depth does NOT satisfy the gate", () => {
    const coverage: DomainCoverageEntry[] = LIFE_DOMAINS.map((d) => ({
      domain: d,
      depth: "mentioned",
      evidence: ""
    }));
    const progress = computeCoverageProgress(coverage);
    expect(progress.unlocked).toBe(false);
    expect(progress.exploredCount).toBe(0);
  });

  test("all 7 domains at 'explored' unlocks", () => {
    const coverage: DomainCoverageEntry[] = LIFE_DOMAINS.map((d) => ({
      domain: d,
      depth: "explored",
      evidence: ""
    }));
    const progress = computeCoverageProgress(coverage);
    expect(progress.unlocked).toBe(true);
    expect(progress.exploredCount).toBe(7);
  });

  test("mix of 'explored' and 'deep' counts equally and unlocks", () => {
    const coverage: DomainCoverageEntry[] = LIFE_DOMAINS.map((d, i) => ({
      domain: d,
      depth: i % 2 === 0 ? "deep" : "explored",
      evidence: ""
    }));
    expect(computeCoverageProgress(coverage).unlocked).toBe(true);
  });

  test("6 of 7 explored does not unlock", () => {
    const coverage: DomainCoverageEntry[] = LIFE_DOMAINS.slice(0, 6).map((d) => ({
      domain: d,
      depth: "explored",
      evidence: ""
    }));
    const progress = computeCoverageProgress(coverage);
    expect(progress.unlocked).toBe(false);
    expect(progress.exploredCount).toBe(6);
  });

  test("ignores entries with unknown domain names", () => {
    const coverage = [
      { domain: "not_a_real_domain", depth: "deep", evidence: "" }
    ] as unknown as DomainCoverageEntry[];
    const progress = computeCoverageProgress(coverage);
    expect(progress.exploredCount).toBe(0);
  });

  test("last entry wins for duplicate domain", () => {
    const coverage: DomainCoverageEntry[] = [
      { domain: "daily_rhythm", depth: "untouched", evidence: "" },
      { domain: "daily_rhythm", depth: "deep", evidence: "" }
    ];
    expect(computeCoverageProgress(coverage).perDomain.daily_rhythm).toBe("deep");
  });
});

function fullSoulFile(): VisibleSoulFile {
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    portrait: "A warm soul.",
    sections: {
      howYouLightUp: "Deliberately.",
      howYouShowUp: "In patterns.",
      howYouLove: "Deeply.",
      howYouWeatherStorms: "Responsibility.",
      whatYoureLookingFor: "Ideas.",
      yourGrowingEdges: "Solitude vs connection.",
      yourWarmth: "Direct but warm."
    },
    crystallizedMoments: [{ quote: "test", reflection: "test" }],
    openThreads: ["creativity"],
    compassScores: {
      openness: 80,
      playfulness: 75,
      warmth: 82,
      emotional_depth: 90,
      devotion: 88,
      resilience: 70,
      independence: 65,
      passion: 77
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
    attachmentStyle: "Secure with anxious lean",
    loveSignature: "Loves through presence",
    completeness: 0
  };
}
