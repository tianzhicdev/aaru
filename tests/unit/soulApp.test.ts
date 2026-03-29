import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Claude module
vi.mock("../../workers/src/claude.ts", () => ({
  callClaude: vi.fn()
}));

// Mock db module to provide a mock sql function
const mockSQL = vi.fn();
vi.mock("../../workers/src/db.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../workers/src/db.ts")>();
  return {
    ...actual,
    createSQL: vi.fn(() => mockSQL)
  };
});

import {
  getReflectionNote,
  upsertReflectionNote,
  getLastNMessages,
  runSoulSynthesis
} from "../../workers/src/soulApp.ts";
import { callClaude } from "../../workers/src/claude.ts";

describe("getReflectionNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no reflection note", async () => {
    mockSQL.mockResolvedValueOnce([{ reflection_note: null }]);

    const note = await getReflectionNote(mockSQL, "user-1");
    expect(note).toBeNull();
  });

  it("returns reflection note from users table", async () => {
    const noteData = {
      updatedAt: "2026-03-26",
      factualAnchors: { job: "engineer" },
      tensions: [],
      recurringThemes: [],
      notableAbsences: [],
      emotionalArc: "",
      domainCoverage: []
    };
    mockSQL.mockResolvedValueOnce([{ reflection_note: noteData }]);

    const note = await getReflectionNote(mockSQL, "user-1");
    expect(note).not.toBeNull();
    expect(note!.factualAnchors["job"]).toBe("engineer");
  });
});

describe("upsertReflectionNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates users table with reflection note", async () => {
    mockSQL.mockResolvedValueOnce([]);

    const note = {
      updatedAt: "2026-03-26",
      factualAnchors: { job: "engineer" },
      tensions: [],
      recurringThemes: [],
      notableAbsences: [],
      emotionalArc: "",
      domainCoverage: []
    };
    await upsertReflectionNote(mockSQL, "user-1", note);

    expect(mockSQL).toHaveBeenCalled();
  });
});

describe("getLastNMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns messages in chronological order", async () => {
    const messages = [
      { id: "m2", user_id: "u1", role: "user", content: "second", created_at: "2026-03-26T00:01:00Z" },
      { id: "m1", user_id: "u1", role: "assistant", content: "first", created_at: "2026-03-26T00:00:00Z" }
    ];
    mockSQL.mockResolvedValueOnce(messages);

    const result = await getLastNMessages(mockSQL, "u1", 10);
    // Should be reversed to chronological order
    expect(result[0].content).toBe("first");
    expect(result[1].content).toBe("second");
  });
});

describe("runSoulSynthesis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs full synthesis using all messages and returns merged files", async () => {
    // getAllSoulMessages
    mockSQL.mockResolvedValueOnce([
      { id: "m1", user_id: "user-1", role: "assistant", content: "Hello", created_at: "2026-03-26" },
      { id: "m2", user_id: "user-1", role: "user", content: "I build walls.", created_at: "2026-03-26" }
    ]);
    // getVisibleSoulFile
    mockSQL.mockResolvedValueOnce([]);
    // getHiddenSoulFile
    mockSQL.mockResolvedValueOnce([]);
    // getReflectionNote
    mockSQL.mockResolvedValueOnce([{ reflection_note: null }]);

    // upsertVisibleSoulFile + upsertHiddenSoulFile calls
    mockSQL.mockResolvedValue([]);

    const visible = {
      version: 1,
      lastUpdated: "2026-03-27",
      portrait: "A synthesized soul",
      sections: { howYouMove: "Deliberately", howYouThink: "In systems", howYouConnect: "Cautiously", whatYouCarry: "Weight", whatLightsYouUp: "Flow", yourContradictions: "Many", yourVoice: "Measured" },
      crystallizedMoments: [{ quote: "I build walls", reflection: "Protection" }],
      openThreads: ["Behind the walls"],
      compassScores: {}
    };
    const hidden = {
      version: 1,
      lastUpdated: "2026-03-27",
      confidence: "low",
      expertReflections: { psychologist: ["Avoidant"], sociologist: ["Outsider"], linguist: ["Metaphorical"], narrativeAnalyst: ["Hero journey"] },
      coreDrivers: [{ driver: "Autonomy", strength: 0.9, inferred: true, evidence: "walls" }],
      coreValues: ["independence"],
      voice: { register: "casual", density: "moderate", humorStyle: "dry", conflictStyle: "avoidant", disclosureRate: "gradual", signaturePatterns: [], voiceExamples: [] },
      depthMap: { safeEntryPoints: ["work"], unlockTopics: ["behind walls"], avoidEarly: ["family"], currentlyLiveTopics: ["identity"], domainCoverage: [] },
      analystNotes: ["Session 1 analysis"]
    };

    vi.mocked(callClaude).mockResolvedValueOnce(
      JSON.stringify(visible) + "\n<<<SPLIT>>>\n" + JSON.stringify(hidden)
    );

    const result = await runSoulSynthesis(mockSQL, "test-api-key", "user-1");

    expect(result.visible).not.toBeNull();
    expect(result.visible!.portrait).toBe("A synthesized soul");
    expect(result.hidden).not.toBeNull();
    expect(result.hidden!.expertReflections.psychologist).toContain("Avoidant");
  });

  it("handles synthesis failure gracefully", async () => {
    // getAllSoulMessages
    mockSQL.mockResolvedValueOnce([
      { id: "m1", user_id: "user-1", role: "user", content: "test", created_at: "2026-03-26" }
    ]);
    // getVisibleSoulFile
    mockSQL.mockResolvedValueOnce([]);
    // getHiddenSoulFile
    mockSQL.mockResolvedValueOnce([]);
    // getReflectionNote
    mockSQL.mockResolvedValueOnce([{ reflection_note: null }]);

    vi.mocked(callClaude).mockRejectedValueOnce(new Error("API error"));

    const result = await runSoulSynthesis(mockSQL, "test-api-key", "user-1");

    expect(result.visible).toBeNull();
    expect(result.hidden).toBeNull();
  });
});
