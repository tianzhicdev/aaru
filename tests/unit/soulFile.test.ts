import { describe, it, expect } from "vitest";
import {
  emptyVisibleSoulFile,
  emptyHiddenSoulFile,
  buildSoulSynthesisPrompt,
  parseSoulSynthesis,
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
  });
});

describe("emptyHiddenSoulFile", () => {
  it("returns a valid empty structure", () => {
    const empty = emptyHiddenSoulFile();
    expect(empty.version).toBe(1);
    expect(empty.confidence).toBe("low");
    expect(empty.expertReflections.psychologist).toEqual([]);
    expect(empty.coreDrivers).toEqual([]);
    expect(empty.voice.register).toBe("casual");
    expect(empty.depthMap.safeEntryPoints).toEqual([]);
  });
});

describe("buildSoulSynthesisPrompt", () => {
  it("builds multi-expert synthesis prompt", () => {
    const messages = [
      { role: "assistant", content: "Tell me about yourself." },
      { role: "user", content: "I'm a wanderer at heart." }
    ];
    const notes: ReflectionNote[] = [{
      updatedAtExchange: 8,
      factualAnchors: { identity: "wanderer" },
      tensions: [],
      recurringThemes: ["movement"],
      notableAbsences: [],
      emotionalArc: "Reflective"
    }];
    const prompt = buildSoulSynthesisPrompt(messages, notes, null, null, 1);
    expect(prompt).toContain("Psychologist");
    expect(prompt).toContain("Sociologist");
    expect(prompt).toContain("Linguist");
    expect(prompt).toContain("Narrative Analyst");
    expect(prompt).toContain("<<<SPLIT>>>");
    expect(prompt).toContain("wanderer");
    // Visible soul file sections should use second person
    expect(prompt).toContain("How you move through the world");
    expect(prompt).toContain("Second person (you/your)");
  });
});

describe("parseSoulSynthesis", () => {
  it("parses valid synthesis with <<<SPLIT>>> separator", () => {
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
      openThreads: ["The door"]
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
        currentlyLiveTopics: ["identity as builder"]
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
  });

  it("returns null without <<<SPLIT>>> separator", () => {
    expect(parseSoulSynthesis('{"portrait": "test"}')).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseSoulSynthesis("bad<<<SPLIT>>>bad")).toBeNull();
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
    expect(merged.version).toBe(2); // empty base = version 1, merge bumps to 2
  });

  it("evolves portrait on update", () => {
    const existing: VisibleSoulFile = {
      version: 2,
      lastUpdated: "2026-03-25",
      portrait: "A builder",
      sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
      crystallizedMoments: [],
      openThreads: []
    };
    const merged = mergeVisibleSoulFile(existing, { portrait: "A builder who found the door" });
    expect(merged.portrait).toBe("A builder who found the door");
    expect(merged.version).toBe(3);
  });

  it("deduplicates crystallized moments", () => {
    const existing: VisibleSoulFile = {
      version: 1,
      lastUpdated: "2026-03-25",
      portrait: null,
      sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
      crystallizedMoments: [{ quote: "I built walls", reflection: "Protection" }],
      openThreads: []
    };
    const update = {
      crystallizedMoments: [
        { quote: "I built walls", reflection: "Updated reflection" }, // dup by quote
        { quote: "I found the door", reflection: "Discovery" } // new
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
      depthMap: { safeEntryPoints: [], unlockTopics: [], avoidEarly: [], currentlyLiveTopics: [] },
      analystNotes: ["First session analysis"]
    };
    const merged = mergeHiddenSoulFile(null, update);
    expect(merged.confidence).toBe("low");
    expect(merged.expertReflections.psychologist).toContain("Avoidant attachment");
    expect(merged.coreDrivers[0].driver).toBe("Autonomy");
    expect(merged.version).toBe(2); // empty base is v1, merge bumps
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
      depthMap: { safeEntryPoints: [], unlockTopics: [], avoidEarly: [], currentlyLiveTopics: [] },
      analystNotes: []
    };
    const update: HiddenSoulFile = {
      version: 2,
      lastUpdated: "2026-03-26",
      confidence: "medium",
      expertReflections: {
        psychologist: ["Opening up about fears"], // new
        sociologist: ["Outsider positioning"], // dup
        linguist: ["Uses architectural metaphors"],
        narrativeAnalyst: []
      },
      coreDrivers: [],
      coreValues: ["creativity"],
      voice: { register: "casual", density: "moderate", humorStyle: "", conflictStyle: "", disclosureRate: "gradual", signaturePatterns: [], voiceExamples: [] },
      depthMap: { safeEntryPoints: [], unlockTopics: [], avoidEarly: [], currentlyLiveTopics: [] },
      analystNotes: ["Session 2 analysis"]
    };
    const merged = mergeHiddenSoulFile(existing, update);
    expect(merged.expertReflections.psychologist).toHaveLength(2);
    expect(merged.expertReflections.sociologist).toHaveLength(1); // deduped
    expect(merged.expertReflections.linguist).toHaveLength(1);
    expect(merged.coreValues).toContain("independence");
    expect(merged.coreValues).toContain("creativity");
    expect(merged.version).toBe(3);
  });
});
