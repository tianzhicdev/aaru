import { describe, expect, it } from "vitest";
import {
  buildAssessmentPrompt,
  buildHiddenClinicalPrompt,
  buildReflectionPrompt,
  buildSoulSynthesisPrompt,
  buildVisibleNarrativePrompt,
  emptyHiddenSoulFile,
  emptyVisibleSoulFile,
  mergeHiddenSoulFile,
  mergeVisibleSoulFile,
  parseAssessment,
  parseHiddenClinical,
  parseReflectionNote,
  parseSoulSynthesis,
  parseVisibleNarrative
} from "../../src/domain/soulFile.ts";
import type { HiddenSoulFile, ReflectionNote, VisibleSoulFile } from "../../src/domain/schemas.ts";

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

function makeHiddenSoulFile(overrides: Partial<HiddenSoulFile> = {}): HiddenSoulFile {
  return {
    version: 1,
    lastUpdated: "2026-03-26T00:00:00Z",
    confidence: "low",
    expertReflections: {
      psychologist: [],
      sociologist: [],
      linguist: [],
      narrativeAnalyst: []
    },
    coreDrivers: [],
    coreValues: [],
    voice: {
      register: "casual",
      density: "moderate",
      humorStyle: "",
      conflictStyle: "",
      disclosureRate: "gradual",
      signaturePatterns: [],
      voiceExamples: []
    },
    depthMap: {
      safeEntryPoints: [],
      unlockTopics: [],
      avoidEarly: [],
      currentlyLiveTopics: [],
      domainCoverage: []
    },
    analystNotes: [],
    bigFiveScores: {
      openness: null,
      conscientiousness: null,
      extraversion: null,
      agreeableness: null,
      neuroticism: null
    },
    schwartzProfile: [],
    attachmentScores: { anxiety: null, avoidance: null, style: null, evidence: "" },
    moralFoundations: { care: null, fairness: null, loyalty: null, authority: null, purity: null },
    meaningOrientation: null,
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

describe("empty constructors", () => {
  it("returns visible defaults with dashboard-v2 fields", () => {
    const empty = emptyVisibleSoulFile();
    expect(empty.portrait).toBeNull();
    expect(empty.personalitySpectrum.openness).toBeNull();
    expect(empty.topValues).toEqual([]);
    expect(empty.relationalStyle).toBeNull();
  });

  it("returns hidden defaults with dashboard-v2 fields", () => {
    const empty = emptyHiddenSoulFile();
    expect(empty.bigFiveScores.openness).toBeNull();
    expect(empty.schwartzProfile).toEqual([]);
    expect(empty.attachmentScores.style).toBeNull();
    expect(empty.meaningOrientation).toBeNull();
  });
});

describe("prompt builders", () => {
  const messages = [
    { role: "assistant", content: "Tell me about yourself." },
    { role: "user", content: "I build walls when I feel overwhelmed." }
  ];

  it("includes new reflection fields in the reflection prompt", () => {
    const prompt = buildReflectionPrompt(messages, null, 2);
    expect(prompt).toContain("inferredBigFive");
    expect(prompt).toContain("attachmentSignals");
    expect(prompt).toContain("valueSignals");
    expect(prompt).toContain("moralFoundationSignals");
    expect(prompt).toContain("meaningOrientation");
  });

  it("builds assessment, visible, and hidden prompts", () => {
    const note = makeReflectionNote({
      recurringThemes: ["walls", "overwhelm"]
    });
    const assessmentPrompt = buildAssessmentPrompt(messages, note, null);
    expect(assessmentPrompt).toContain("psychometric analyst");
    expect(assessmentPrompt).toContain("bigFive");

    const assessment = parseAssessment(JSON.stringify({
      bigFive: {
        openness: { score: 72, confidence: 0.7, evidence: "Explores multiple perspectives" },
        conscientiousness: null,
        extraversion: null,
        agreeableness: null,
        neuroticism: null
      },
      schwartzValues: [{ value: "Self-Direction", priority: 1, evidence: "Values independence" }],
      attachment: { anxiety: 42, avoidance: 61, style: "dismissive", evidence: "Pulls back under pressure" },
      moralFoundations: { care: 60, fairness: 70, loyalty: null, authority: null, purity: null },
      meaningOrientation: "meaning_seeking",
      conflictStyle: "Withdraws first, then returns with clarity.",
      coreDrivers: [{ driver: "Autonomy", strength: 0.9, inferred: true, evidence: "Walls metaphor" }],
      coreValues: ["independence"]
    }))!;

    const visiblePrompt = buildVisibleNarrativePrompt(messages, note, assessment, null);
    expect(visiblePrompt).toContain("PERSONALITY SPECTRUM");
    expect(visiblePrompt).toContain("topValues");
    expect(visiblePrompt).toContain("relationalStyle");

    const hiddenPrompt = buildHiddenClinicalPrompt(messages, note, assessment, null);
    expect(hiddenPrompt).toContain("bigFiveScores");
    expect(hiddenPrompt).toContain("schwartzProfile");
    expect(hiddenPrompt).toContain("meaningOrientation");
  });

  it("keeps the fallback single-call synthesis prompt available", () => {
    const prompt = buildSoulSynthesisPrompt(messages, null, null, null);
    expect(prompt).toContain("<<<SPLIT>>>");
    expect(prompt).toContain("personalitySpectrum");
    expect(prompt).toContain("bigFiveScores");
  });
});

describe("parsers", () => {
  it("parses assessment JSON", () => {
    const assessment = parseAssessment(JSON.stringify({
      bigFive: {
        openness: { score: 81, confidence: 0.8, evidence: "Likes novelty" },
        conscientiousness: { score: 35, confidence: 0.5, evidence: "Self-described chaotic habits" },
        extraversion: null,
        agreeableness: null,
        neuroticism: null
      },
      schwartzValues: [
        { value: "Self-Direction", priority: 1, evidence: "Protects autonomy" },
        { value: "Universalism", priority: 2, evidence: "Concern for the broader world" }
      ],
      attachment: { anxiety: 33, avoidance: 59, style: "dismissive", evidence: "Retreats when pressed" },
      moralFoundations: { care: 72, fairness: 67, loyalty: 40, authority: null, purity: null },
      meaningOrientation: "meaning_seeking",
      conflictStyle: "Pulls away before returning to talk.",
      coreDrivers: [{ driver: "Autonomy", strength: 0.9, inferred: true, evidence: "Walls metaphor" }],
      coreValues: ["independence", "truthfulness"]
    }));

    expect(assessment).not.toBeNull();
    expect(assessment?.bigFive.openness?.score).toBe(81);
    expect(assessment?.schwartzValues[0]?.value).toBe("Self-Direction");
    expect(assessment?.attachment.style).toBe("dismissive");
    expect(assessment?.meaningOrientation).toBe("meaning_seeking");
  });

  it("parses reflection notes with new psychological signal fields", () => {
    const note = parseReflectionNote(JSON.stringify({
      updatedAt: "2026-03-26T00:10:00Z",
      factualAnchors: { work: "I keep trying to leave this job" },
      tensions: ["Wants freedom but clings to stability"],
      recurringThemes: ["freedom", "work drift"],
      notableAbsences: ["family"],
      emotionalArc: "Guarded, then more direct",
      domainCoverage: [{ domain: "work_and_purpose", depth: "explored", evidence: "Repeated job discussion" }],
      recentAssistantQuestions: ["What would freedom cost you?"],
      openLoops: ["What 'something more' actually looks like"],
      inferredBigFive: {
        openness: { score: 77, confidence: "medium", evidence: "Explores possibilities easily" },
        conscientiousness: null,
        extraversion: null,
        agreeableness: null,
        neuroticism: null
      },
      attachmentSignals: [{ dimension: "avoidance", signal: "Pulls back when feeling crowded", strength: "moderate" }],
      valueSignals: [{ value: "Self-Direction", evidence: "Protects autonomy", direction: "high_priority" }],
      moralFoundationSignals: [{ foundation: "fairness", signal: "Resentful of unfair expectations" }],
      conflictStyle: "Withdraws, then revisits the conversation later.",
      meaningOrientation: "Searching for a life that feels more fully chosen."
    }));

    expect(note).not.toBeNull();
    expect(note?.inferredBigFive.openness?.score).toBe(77);
    expect(note?.attachmentSignals[0]?.dimension).toBe("avoidance");
    expect(note?.valueSignals[0]?.value).toBe("Self-Direction");
    expect(note?.moralFoundationSignals[0]?.foundation).toBe("fairness");
  });

  it("parses visible narrative output with spectrum and values", () => {
    const visible = parseVisibleNarrative(JSON.stringify({
      version: 2,
      lastUpdated: "2026-03-27T00:00:00Z",
      portrait: "You move through the world like someone protecting a quiet interior room.",
      sections: {
        howYouMove: "With deliberation.",
        howYouThink: "In layered metaphors.",
        howYouConnect: "Slowly.",
        whatYouCarry: "Expectation.",
        whatLightsYouUp: "Creative flow.",
        yourContradictions: "You want closeness but brace against it.",
        yourVoice: "Measured and image-rich."
      },
      crystallizedMoments: [{ quote: "I build walls when I feel overwhelmed.", reflection: "Protection arrives as architecture." }],
      openThreads: ["What a life with fewer walls would feel like"],
      compassScores: { openness: 72, vitality: 58, warmth: null, depth: 84, purpose: 62, resilience: null, autonomy: 91, connection: 43 },
      personalitySpectrum: {
        openness: { position: 78, label: "You lean toward curiosity when the stakes feel worth it.", evidence: "Keeps reaching for bigger frames." },
        conscientiousness: null,
        extraversion: { position: 34, label: "You replenish alone before you rejoin the world.", evidence: "Protects private space." },
        agreeableness: null,
        emotionalSensitivity: { position: 69, label: "You feel things quickly and build rituals to steady yourself.", evidence: "Overwhelm comes fast." }
      },
      topValues: [
        { value: "Self-Direction", description: "You need room to choose your own way." },
        { value: "Universalism", description: "You care about what your life means beyond yourself." }
      ],
      relationalStyle: "You connect through shared perspective first, then let closeness build slowly."
    }));

    expect(visible).not.toBeNull();
    expect(visible?.personalitySpectrum.openness?.position).toBe(78);
    expect(visible?.topValues).toHaveLength(2);
    expect(visible?.relationalStyle).toContain("shared perspective");
  });

  it("parses hidden clinical output with structured profiles", () => {
    const hidden = parseHiddenClinical(JSON.stringify({
      version: 3,
      lastUpdated: "2026-03-27T00:00:00Z",
      confidence: "medium",
      expertReflections: {
        psychologist: ["Uses distance as self-protection."],
        sociologist: ["Frames autonomy as identity."],
        linguist: ["Relies on architectural metaphors."],
        narrativeAnalyst: ["Treats safety as something built, not inherited."]
      },
      coreDrivers: [{ driver: "Autonomy", strength: 0.92, inferred: true, evidence: "Walls metaphor" }],
      coreValues: ["independence", "truthfulness"],
      voice: {
        register: "casual",
        density: "moderate",
        humorStyle: "dry",
        conflictStyle: "withdraw-first",
        disclosureRate: "gradual",
        signaturePatterns: ["architectural metaphors"],
        voiceExamples: [{ trigger: "vulnerability", response: "abstracts the feeling into an image" }]
      },
      depthMap: {
        safeEntryPoints: ["work", "creative process"],
        unlockTopics: ["the door metaphor"],
        avoidEarly: ["family"],
        currentlyLiveTopics: ["leaving the job"],
        domainCoverage: [{ domain: "work_and_purpose", depth: "deep", evidence: "Repeated discussion" }]
      },
      analystNotes: ["Likely to open through metaphor before direct confession."],
      bigFiveScores: {
        openness: { score: 81, confidence: 0.82, evidence: "Thinks in symbols and alternatives" },
        conscientiousness: { score: 38, confidence: 0.44, evidence: "Describes uneven structure" },
        extraversion: null,
        agreeableness: null,
        neuroticism: { score: 63, confidence: 0.58, evidence: "Names overwhelm directly" }
      },
      schwartzProfile: [{ value: "Self-Direction", priority: 1, evidence: "Protects autonomy" }],
      attachmentScores: { anxiety: 34, avoidance: 61, style: "dismissive", evidence: "Retreats when crowded" },
      moralFoundations: { care: 70, fairness: 68, loyalty: 40, authority: null, purity: null },
      meaningOrientation: "meaning_seeking"
    }));

    expect(hidden).not.toBeNull();
    expect(hidden?.bigFiveScores.openness?.score).toBe(81);
    expect(hidden?.attachmentScores.style).toBe("dismissive");
    expect(hidden?.schwartzProfile[0]?.priority).toBe(1);
    expect(hidden?.meaningOrientation).toBe("meaning_seeking");
  });

  it("parses split synthesis output", () => {
    const visible = makeVisibleSoulFile({
      portrait: "You move carefully through thresholds.",
      topValues: [{ value: "Self-Direction", description: "You need space to choose." }]
    });
    const hidden = makeHiddenSoulFile({
      bigFiveScores: {
        openness: { score: 80, confidence: 0.7, evidence: "Sees patterns" },
        conscientiousness: null,
        extraversion: null,
        agreeableness: null,
        neuroticism: null
      }
    });

    const result = parseSoulSynthesis(`${JSON.stringify(visible)}\n<<<SPLIT>>>\n${JSON.stringify(hidden)}`);
    expect(result).not.toBeNull();
    expect(result?.visible.topValues[0]?.value).toBe("Self-Direction");
    expect(result?.hidden.bigFiveScores.openness?.score).toBe(80);
  });
});

describe("merge functions", () => {
  it("preserves existing visible fields when new ones are absent and updates when present", () => {
    const existing = makeVisibleSoulFile({
      version: 2,
      portrait: "Old portrait",
      personalitySpectrum: {
        openness: { position: 75, label: "Curious", evidence: "Asks why often" },
        conscientiousness: null,
        extraversion: null,
        agreeableness: null,
        emotionalSensitivity: null
      },
      topValues: [{ value: "Self-Direction", description: "Existing value" }]
    });

    const merged = mergeVisibleSoulFile(existing, {
      portrait: "New portrait",
      relationalStyle: "You open through ideas first.",
      compassScores: { openness: 82, vitality: null },
      topValues: [{ value: "Universalism", description: "You care about the larger whole." }]
    });

    expect(merged.version).toBe(3);
    expect(merged.portrait).toBe("New portrait");
    expect(merged.personalitySpectrum.openness?.position).toBe(75);
    expect(merged.topValues[0]?.value).toBe("Universalism");
    expect(merged.relationalStyle).toContain("ideas first");
    expect(merged.compassScores.openness).toBe(82);
  });

  it("merges hidden structured profiles without erasing good existing data", () => {
    const existing = makeHiddenSoulFile({
      version: 2,
      coreValues: ["independence"],
      bigFiveScores: {
        openness: { score: 78, confidence: 0.7, evidence: "Old evidence" },
        conscientiousness: null,
        extraversion: null,
        agreeableness: null,
        neuroticism: null
      },
      meaningOrientation: "meaning_seeking"
    });

    const merged = mergeHiddenSoulFile(existing, makeHiddenSoulFile({
      confidence: "medium",
      coreValues: ["truthfulness"],
      bigFiveScores: {
        openness: { score: 82, confidence: 0.8, evidence: "New evidence" },
        conscientiousness: { score: 40, confidence: 0.5, evidence: "Loose structure" },
        extraversion: null,
        agreeableness: null,
        neuroticism: null
      },
      attachmentScores: { anxiety: 32, avoidance: 58, style: "dismissive", evidence: "Retreats under pressure" },
      moralFoundations: { care: 70, fairness: null, loyalty: null, authority: null, purity: null },
      meaningOrientation: "meaning_present"
    }));

    expect(merged.version).toBe(3);
    expect(merged.coreValues).toContain("independence");
    expect(merged.coreValues).toContain("truthfulness");
    expect(merged.bigFiveScores.openness?.score).toBe(82);
    expect(merged.bigFiveScores.conscientiousness?.score).toBe(40);
    expect(merged.attachmentScores.style).toBe("dismissive");
    expect(merged.moralFoundations.care).toBe(70);
    expect(merged.meaningOrientation).toBe("meaning_present");
  });
});
