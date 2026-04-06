import { describe, expect, it } from "vitest";
import {
  buildHiddenClinicalPrompt,
  buildVisibleNarrativePrompt,
  emptyHiddenSoulFile,
  emptyVisibleSoulFile,
  getHiddenSoulFileJsonSchema,
  getVisibleSoulFileJsonSchema,
  parseHiddenClinical,
  parseVisibleNarrative
} from "../../src/domain/soulFile.ts";
describe("empty constructors", () => {
  it("returns visible defaults with the renamed tensions section", () => {
    const empty = emptyVisibleSoulFile();
    expect(empty.sections.yourTensions).toBe("");
    expect(empty.topValues).toEqual([]);
    expect(empty.relationalStyle).toBeNull();
  });

  it("returns hidden defaults with honest insights", () => {
    const empty = emptyHiddenSoulFile();
    expect(empty.expertReflections.psychologist).toEqual([]);
    expect(empty.depthMap.domainCoverage).toEqual([]);
    expect(empty.honestInsights).toEqual([]);
  });
});

describe("prompt builders", () => {
  const messages = [
    { role: "assistant", content: "Tell me about yourself." },
    { role: "user", content: "I build walls when I feel overwhelmed." }
  ];

  it("builds visible and hidden prompts without an assessment step", () => {
    const visiblePrompt = buildVisibleNarrativePrompt(messages);
    expect(visiblePrompt).toContain("yourTensions");
    expect(visiblePrompt).toContain("personalitySpectrum");
    expect(visiblePrompt).not.toContain("Assessment JSON");

    const hiddenPrompt = buildHiddenClinicalPrompt(messages);
    expect(hiddenPrompt).toContain("honestInsights");
    expect(hiddenPrompt).toContain("domainCoverage");
    expect(hiddenPrompt).not.toContain("bigFiveScores");
  });

  it("exposes json schemas for structured output calls", () => {
    expect(getVisibleSoulFileJsonSchema()).toMatchObject({ type: "object" });
    expect(getHiddenSoulFileJsonSchema()).toMatchObject({ type: "object" });
  });
});

describe("parsers", () => {
  it("parses visible narrative output with your tensions", () => {
    const visible = parseVisibleNarrative(JSON.stringify({
      version: 2,
      lastUpdated: "2026-03-31T00:00:00Z",
      portrait: "You move through the world like someone protecting a quiet interior room.",
      sections: {
        howYouMove: "With deliberation.",
        howYouThink: "In layered metaphors.",
        howYouConnect: "Slowly.",
        whatYouCarry: "A fear of being swallowed.",
        whatLightsYouUp: "Creative freedom.",
        yourTensions: "You want closeness but brace against it.",
        yourVoice: "Measured, dry, and precise."
      },
      crystallizedMoments: [{ quote: "I build walls.", reflection: "Protection is architecture for you." }],
      openThreads: ["What freedom would actually cost"],
      compassScores: { depth: 82, warmth: 61 },
      personalitySpectrum: {
        openness: { position: 78, label: "Curious beneath the guard", evidence: "You keep reaching for deeper frames." }
      },
      topValues: [{ value: "Self-Direction", description: "You need room to choose your own path." }],
      relationalStyle: "You open through shared perspective before deeper closeness."
    }));

    expect(visible).not.toBeNull();
    expect(visible?.sections.yourTensions).toContain("closeness");
    expect(visible?.personalitySpectrum.openness?.position).toBe(78);
    expect(visible?.topValues[0]?.value).toBe("Self-Direction");
  });

  it("parses hidden clinical output without legacy psychometric fields", () => {
    const hidden = parseHiddenClinical(JSON.stringify({
      version: 3,
      lastUpdated: "2026-03-31T00:00:00Z",
      confidence: "medium",
      expertReflections: {
        psychologist: ["Uses humor to regulate vulnerability."],
        sociologist: ["Performs masculinity as social protection."],
        linguist: ["Relies on self-mocking emphasis to stay in control."],
        narrativeAnalyst: ["Keeps returning to the mask versus self split."]
      },
      coreDrivers: [{ driver: "Autonomy", strength: 0.9, inferred: true, evidence: "Walls metaphor" }],
      coreValues: ["independence"],
      voice: {
        register: "casual",
        density: "moderate",
        humorStyle: "dry",
        conflictStyle: "avoidant",
        disclosureRate: "gradual",
        signaturePatterns: ["starts with a joke, lands with something true"],
        voiceExamples: [{ trigger: "vulnerability", response: "cracks a joke before answering" }]
      },
      depthMap: {
        domainCoverage: [
          { domain: "work_and_purpose", depth: "explored", evidence: "Repeated job discussion" },
          { domain: "relationships", depth: "mentioned", evidence: "Talks around closeness" }
        ]
      },
      analystNotes: ["Relationship avoidance is the sharper growth edge now."],
      honestInsights: ["You still treat being truly seen like a threat condition."]
    }));

    expect(hidden).not.toBeNull();
    expect(hidden?.expertReflections.psychologist).toHaveLength(1);
    expect(hidden?.depthMap.domainCoverage[0]?.domain).toBe("work_and_purpose");
    expect(hidden?.honestInsights[0]).toContain("seen");
  });
});
