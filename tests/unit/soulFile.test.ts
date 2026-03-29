import { describe, it, expect } from "vitest";
import {
  emptyVisibleSoulFile,
  emptyHiddenSoulFile,
  buildSoulSynthesisPrompt,
  parseSoulSynthesis,
  parseReflectionNote,
  mergeVisibleSoulFile,
  mergeHiddenSoulFile
} from "../../src/domain/soulFile.ts";
import type { VisibleSoulFile, HiddenSoulFile, ReflectionNote } from "../../src/domain/schemas.ts";

describe("emptyVisibleSoulFile", () => {
  it("returns a valid empty structure", () => {
    const empty = emptyVisibleSoulFile();
    expect(empty.version).toBe(1);
    expect(empty.portrait).toBeNull();
    expect(empty.sections.howYouMove).toBe("");
    expect(empty.crystallizedMoments).toEqual([]);
    expect(empty.openThreads).toEqual([]);
    expect(empty.compassScores).toEqual({});
  });
});

describe("emptyHiddenSoulFile", () => {
  it("returns a valid empty structure with domainCoverage", () => {
    const empty = emptyHiddenSoulFile();
    expect(empty.version).toBe(1);
    expect(empty.confidence).toBe("low");
    expect(empty.expertReflections.psychologist).toEqual([]);
    expect(empty.coreDrivers).toEqual([]);
    expect(empty.voice.register).toBe("casual");
    expect(empty.depthMap.safeEntryPoints).toEqual([]);
    expect(empty.depthMap.domainCoverage).toEqual([]);
  });
});

describe("buildSoulSynthesisPrompt", () => {
  it("builds multi-expert synthesis prompt with reflection note", () => {
    const messages = [
      { role: "assistant", content: "Tell me about yourself." },
      { role: "user", content: "I'm a wanderer at heart." }
    ];
    const note: ReflectionNote = {
      updatedAt: "2026-03-26T00:00:00Z",
      factualAnchors: { identity: "wanderer" },
      tensions: [],
      recurringThemes: ["movement"],
      notableAbsences: [],
      emotionalArc: "Reflective",
      domainCoverage: [
        { domain: "origins", depth: "untouched", evidence: "" }
      ]
    };
    const prompt = buildSoulSynthesisPrompt(messages, note, null, null);
    expect(prompt).toContain("Psychologist");
    expect(prompt).toContain("Sociologist");
    expect(prompt).toContain("Linguist");
    expect(prompt).toContain("Narrative Analyst");
    expect(prompt).toContain("<<<SPLIT>>>");
    expect(prompt).toContain("wanderer");
    expect(prompt).toContain("How you move through the world");
    expect(prompt).toContain("MUST use second person");
    expect(prompt).toContain("domainCoverage");
    expect(prompt).toContain("Rate ALL 7 domains");
  });

  it("works with null reflection note", () => {
    const messages = [
      { role: "user", content: "Hello" }
    ];
    const prompt = buildSoulSynthesisPrompt(messages, null, null, null);
    expect(prompt).toContain("No reflection note yet");
    expect(prompt).toContain("Psychologist");
  });
});

describe("parseSoulSynthesis", () => {
  it("parses valid synthesis with <<<SPLIT>>> separator and domainCoverage", () => {
    const visible = {
      version: 1,
      lastUpdated: "2026-03-26",
      portrait: "A builder of worlds",
      sections: {
        howYouMove: "With deliberation",
        howYouThink: "In systems",
        howYouConnect: "Cautiously",
        whatYouCarry: "The weight of expectations",
        whatLightsYouUp: "Flow states",
        yourContradictions: "Loves solitude, craves connection",
        yourVoice: "Measured and metaphorical"
      },
      crystallizedMoments: [{ quote: "I built walls", reflection: "Protection" }],
      openThreads: ["The door"],
      compassScores: {
        openness: 72,
        vitality: null,
        warmth: 45,
        depth: 88,
        purpose: 65,
        resilience: null,
        autonomy: 91,
        connection: null
      }
    };
    const hidden = {
      version: 1,
      lastUpdated: "2026-03-26",
      confidence: "low",
      expertReflections: {
        psychologist: ["Avoidant attachment patterns"],
        sociologist: ["Positions as outsider-builder"],
        linguist: ["Heavy use of architectural metaphors"],
        narrativeAnalyst: ["Hero's journey — building phase"]
      },
      coreDrivers: [{ driver: "Autonomy", strength: 0.9, inferred: true, evidence: "walls metaphor" }],
      coreValues: ["independence", "creativity"],
      voice: {
        register: "casual",
        density: "moderate",
        humorStyle: "dry, deflective",
        conflictStyle: "avoidant",
        disclosureRate: "gradual",
        signaturePatterns: ["architectural metaphors"],
        voiceExamples: [{ trigger: "vulnerability", response: "redirects to abstract" }]
      },
      depthMap: {
        safeEntryPoints: ["work", "creative process"],
        unlockTopics: ["the door", "what's behind the walls"],
        avoidEarly: ["family", "romantic relationships"],
        currentlyLiveTopics: ["identity as builder"],
        domainCoverage: [
          { domain: "origins", depth: "explored", evidence: "Shared childhood memory" },
          { domain: "work_and_purpose", depth: "deep", evidence: "Career transition" }
        ]
      },
      analystNotes: ["Strong self-awareness about walls metaphor"]
    };

    const raw = JSON.stringify(visible) + "\n<<<SPLIT>>>\n" + JSON.stringify(hidden);
    const result = parseSoulSynthesis(raw);
    expect(result).not.toBeNull();
    expect(result!.visible.portrait).toBe("A builder of worlds");
    expect(result!.visible.sections.howYouMove).toBe("With deliberation");
    expect(result!.hidden.confidence).toBe("low");
    expect(result!.hidden.expertReflections.psychologist).toHaveLength(1);
    expect(result!.hidden.coreDrivers[0].driver).toBe("Autonomy");
    expect(result!.hidden.voice.register).toBe("casual");
    expect(result!.hidden.depthMap.domainCoverage).toHaveLength(2);
    expect(result!.hidden.depthMap.domainCoverage[0].domain).toBe("origins");
    expect(result!.hidden.depthMap.domainCoverage[0].depth).toBe("explored");
    // Compass scores
    expect(result!.visible.compassScores.openness).toBe(72);
    expect(result!.visible.compassScores.vitality).toBeNull();
    expect(result!.visible.compassScores.depth).toBe(88);
    expect(result!.visible.compassScores.autonomy).toBe(91);
    expect(result!.visible.compassScores.connection).toBeNull();
  });

  it("handles missing compassScores gracefully", () => {
    const visible = {
      version: 1, lastUpdated: "2026-03-26", portrait: "Test",
      sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
      crystallizedMoments: [], openThreads: []
    };
    const hidden = {
      version: 1, lastUpdated: "2026-03-26", confidence: "low",
      expertReflections: { psychologist: [], sociologist: [], linguist: [], narrativeAnalyst: [] },
      coreDrivers: [], coreValues: [],
      voice: { register: "casual", density: "moderate", humorStyle: "", conflictStyle: "", disclosureRate: "gradual", signaturePatterns: [], voiceExamples: [] },
      depthMap: { safeEntryPoints: [], unlockTopics: [], avoidEarly: [], currentlyLiveTopics: [], domainCoverage: [] },
      analystNotes: []
    };
    const raw = JSON.stringify(visible) + "\n<<<SPLIT>>>\n" + JSON.stringify(hidden);
    const result = parseSoulSynthesis(raw);
    expect(result).not.toBeNull();
    expect(result!.visible.compassScores).toEqual({});
  });

  it("clamps and rounds compass scores", () => {
    const visible = {
      version: 1, lastUpdated: "2026-03-26", portrait: "Test",
      sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
      crystallizedMoments: [], openThreads: [],
      compassScores: { openness: 72.7, vitality: -5, warmth: 150, depth: "invalid", purpose: 50, resilience: null, autonomy: 0, connection: 100 }
    };
    const hidden = {
      version: 1, lastUpdated: "2026-03-26", confidence: "low",
      expertReflections: { psychologist: [], sociologist: [], linguist: [], narrativeAnalyst: [] },
      coreDrivers: [], coreValues: [],
      voice: { register: "casual", density: "moderate", humorStyle: "", conflictStyle: "", disclosureRate: "gradual", signaturePatterns: [], voiceExamples: [] },
      depthMap: { safeEntryPoints: [], unlockTopics: [], avoidEarly: [], currentlyLiveTopics: [], domainCoverage: [] },
      analystNotes: []
    };
    const raw = JSON.stringify(visible) + "\n<<<SPLIT>>>\n" + JSON.stringify(hidden);
    const result = parseSoulSynthesis(raw);
    expect(result).not.toBeNull();
    expect(result!.visible.compassScores.openness).toBe(73); // rounded
    expect(result!.visible.compassScores.vitality).toBeNull(); // negative → null
    expect(result!.visible.compassScores.warmth).toBeNull(); // >100 → null
    expect(result!.visible.compassScores.depth).toBeNull(); // string → null
    expect(result!.visible.compassScores.purpose).toBe(50);
    expect(result!.visible.compassScores.resilience).toBeNull();
    expect(result!.visible.compassScores.autonomy).toBe(0);
    expect(result!.visible.compassScores.connection).toBe(100);
  });

  it("returns null without <<<SPLIT>>> separator", () => {
    expect(parseSoulSynthesis('{"portrait": "test"}')).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseSoulSynthesis("bad<<<SPLIT>>>bad")).toBeNull();
  });
});

describe("parseReflectionNote", () => {
  it("parses valid reflection note with domainCoverage", () => {
    const raw = JSON.stringify({
      updatedAt: "2026-03-26T00:00:00Z",
      factualAnchors: { job: "engineer" },
      tensions: ["work vs life"],
      recurringThemes: ["building"],
      notableAbsences: ["childhood"],
      emotionalArc: "Opening up gradually",
      domainCoverage: [
        { domain: "work_and_purpose", depth: "explored", evidence: "Discussed career" },
        { domain: "origins", depth: "untouched", evidence: "" }
      ]
    });
    const note = parseReflectionNote(raw);
    expect(note).not.toBeNull();
    expect(note!.updatedAt).toBe("2026-03-26T00:00:00Z");
    expect(note!.factualAnchors["job"]).toBe("engineer");
    expect(note!.domainCoverage).toHaveLength(2);
    expect(note!.domainCoverage[0].domain).toBe("work_and_purpose");
    expect(note!.domainCoverage[0].depth).toBe("explored");
  });

  it("handles missing domainCoverage gracefully", () => {
    const raw = JSON.stringify({
      updatedAt: "2026-03-26",
      factualAnchors: {},
      tensions: [],
      recurringThemes: [],
      notableAbsences: [],
      emotionalArc: ""
    });
    const note = parseReflectionNote(raw);
    expect(note).not.toBeNull();
    expect(note!.domainCoverage).toEqual([]);
  });

  it("returns null for invalid JSON", () => {
    expect(parseReflectionNote("not json")).toBeNull();
  });
});

describe("mergeVisibleSoulFile", () => {
  it("creates from null base", () => {
    const update = {
      portrait: "A builder of worlds",
      crystallizedMoments: [{ quote: "I built walls", reflection: "Protection" }]
    };
    const merged = mergeVisibleSoulFile(null, update);
    expect(merged.portrait).toBe("A builder of worlds");
    expect(merged.crystallizedMoments).toHaveLength(1);
    expect(merged.version).toBe(2);
  });

  it("evolves portrait on update", () => {
    const existing: VisibleSoulFile = {
      version: 2,
      lastUpdated: "2026-03-25",
      portrait: "A builder",
      sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
      crystallizedMoments: [],
      openThreads: [],
      compassScores: {}
    };
    const merged = mergeVisibleSoulFile(existing, { portrait: "A builder who found the door" });
    expect(merged.portrait).toBe("A builder who found the door");
    expect(merged.version).toBe(3);
  });

  it("merges compass scores — new scores overwrite, null doesn't erase", () => {
    const existing: VisibleSoulFile = {
      version: 2, lastUpdated: "2026-03-25", portrait: null,
      sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
      crystallizedMoments: [], openThreads: [],
      compassScores: { openness: 72, vitality: 60, warmth: null, depth: null }
    };
    const merged = mergeVisibleSoulFile(existing, {
      compassScores: { openness: 80, vitality: null, warmth: 55, depth: null }
    });
    expect(merged.compassScores.openness).toBe(80); // overwritten
    expect(merged.compassScores.vitality).toBe(60); // null didn't erase
    expect(merged.compassScores.warmth).toBe(55);   // new score
    expect(merged.compassScores.depth).toBeNull();   // both null
  });

  it("handles empty compass scores merge as no-op", () => {
    const existing: VisibleSoulFile = {
      version: 2, lastUpdated: "2026-03-25", portrait: null,
      sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
      crystallizedMoments: [], openThreads: [],
      compassScores: { openness: 72 }
    };
    const merged = mergeVisibleSoulFile(existing, { compassScores: {} });
    expect(merged.compassScores).toEqual({ openness: 72 });
  });

  it("deduplicates crystallized moments", () => {
    const existing: VisibleSoulFile = {
      version: 1,
      lastUpdated: "2026-03-25",
      portrait: null,
      sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
      crystallizedMoments: [{ quote: "I built walls", reflection: "Protection" }],
      openThreads: [],
      compassScores: {}
    };
    const update = {
      crystallizedMoments: [
        { quote: "I built walls", reflection: "Updated reflection" },
        { quote: "I found the door", reflection: "Discovery" }
      ]
    };
    const merged = mergeVisibleSoulFile(existing, update);
    expect(merged.crystallizedMoments).toHaveLength(2);
    expect(merged.crystallizedMoments[0].quote).toBe("I built walls");
    expect(merged.crystallizedMoments[1].quote).toBe("I found the door");
  });
});

describe("mergeHiddenSoulFile", () => {
  it("creates from null base", () => {
    const update: HiddenSoulFile = {
      version: 1,
      lastUpdated: "2026-03-26",
      confidence: "low",
      expertReflections: {
        psychologist: ["Avoidant attachment"],
        sociologist: [],
        linguist: [],
        narrativeAnalyst: []
      },
      coreDrivers: [{ driver: "Autonomy", strength: 0.9, inferred: true, evidence: "walls" }],
      coreValues: ["independence"],
      voice: { register: "casual", density: "moderate", humorStyle: "", conflictStyle: "", disclosureRate: "gradual", signaturePatterns: [], voiceExamples: [] },
      depthMap: { safeEntryPoints: [], unlockTopics: [], avoidEarly: [], currentlyLiveTopics: [], domainCoverage: [] },
      analystNotes: ["First session analysis"]
    };
    const merged = mergeHiddenSoulFile(null, update);
    expect(merged.confidence).toBe("low");
    expect(merged.expertReflections.psychologist).toContain("Avoidant attachment");
    expect(merged.coreDrivers[0].driver).toBe("Autonomy");
    expect(merged.version).toBe(2);
  });

  it("merges expert reflections across sessions", () => {
    const existing: HiddenSoulFile = {
      version: 2,
      lastUpdated: "2026-03-25",
      confidence: "low",
      expertReflections: {
        psychologist: ["Avoidant attachment"],
        sociologist: ["Outsider positioning"],
        linguist: [],
        narrativeAnalyst: []
      },
      coreDrivers: [],
      coreValues: ["independence"],
      voice: { register: "casual", density: "moderate", humorStyle: "", conflictStyle: "", disclosureRate: "gradual", signaturePatterns: [], voiceExamples: [] },
      depthMap: { safeEntryPoints: [], unlockTopics: [], avoidEarly: [], currentlyLiveTopics: [], domainCoverage: [] },
      analystNotes: []
    };
    const update: HiddenSoulFile = {
      version: 2,
      lastUpdated: "2026-03-26",
      confidence: "medium",
      expertReflections: {
        psychologist: ["Opening up about fears"],
        sociologist: ["Outsider positioning"],
        linguist: ["Uses architectural metaphors"],
        narrativeAnalyst: []
      },
      coreDrivers: [],
      coreValues: ["creativity"],
      voice: { register: "casual", density: "moderate", humorStyle: "", conflictStyle: "", disclosureRate: "gradual", signaturePatterns: [], voiceExamples: [] },
      depthMap: { safeEntryPoints: [], unlockTopics: [], avoidEarly: [], currentlyLiveTopics: [], domainCoverage: [] },
      analystNotes: ["Session 2 analysis"]
    };
    const merged = mergeHiddenSoulFile(existing, update);
    expect(merged.expertReflections.psychologist).toHaveLength(2);
    expect(merged.expertReflections.sociologist).toHaveLength(1);
    expect(merged.expertReflections.linguist).toHaveLength(1);
    expect(merged.coreValues).toContain("independence");
    expect(merged.coreValues).toContain("creativity");
    expect(merged.version).toBe(3);
  });
});
