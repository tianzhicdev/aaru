import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../workers/src/claude.ts", () => ({
  callClaude: vi.fn(),
  streamClaude: vi.fn()
}));

const mockSQL = vi.fn();
vi.mock("../../workers/src/db.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../workers/src/db.ts")>();
  return {
    ...actual,
    createSQL: vi.fn(() => mockSQL)
  };
});

import {
  checkReflectionSnapshotNeeded,
  checkSynthesisNeeded,
  getHiddenSoulFile,
  getLatestReflectionSnapshot,
  getVisibleSoulFile,
  markReflectionSnapshotPending,
  markSynthesisFailed,
  markSynthesisPending,
  runReflectionSnapshot,
  runSoulSynthesis
} from "../../workers/src/soulApp.ts";
import { callClaude, streamClaude } from "../../workers/src/claude.ts";

describe("reflection snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no snapshot exists", async () => {
    mockSQL.mockResolvedValueOnce([]);
    const note = await getLatestReflectionSnapshot(mockSQL, "user-1");
    expect(note).toBeNull();
  });

  it("parses the latest ready snapshot with new fields", async () => {
    mockSQL.mockResolvedValueOnce([{
      note: {
        updatedAt: "2026-03-26",
        factualAnchors: { job: "engineer" },
        tensions: [],
        recurringThemes: [],
        notableAbsences: [],
        emotionalArc: "",
        domainCoverage: [],
        recentAssistantQuestions: ["What are you avoiding?"],
        openLoops: ["The job decision"],
        inferredBigFive: {
          openness: { score: 70, confidence: "medium", evidence: "Explores ideas" }
        },
        attachmentSignals: [],
        valueSignals: [],
        moralFoundationSignals: [],
        conflictStyle: "",
        meaningOrientation: ""
      }
    }]);

    const note = await getLatestReflectionSnapshot(mockSQL, "user-1");
    expect(note?.factualAnchors.job).toBe("engineer");
    expect(note?.recentAssistantQuestions).toContain("What are you avoiding?");
    expect(note?.inferredBigFive.openness?.score).toBe(70);
  });

  it("flags snapshot work when transcript crossed a new 10-message block", async () => {
    mockSQL.mockResolvedValueOnce([{ cnt: 23, last_created_at: "2026-03-29T20:00:00Z" }]);
    mockSQL.mockResolvedValueOnce([{ status: "ready", through_message_count: 10, started_at: null }]);

    const result = await checkReflectionSnapshotNeeded(mockSQL, "user-1");
    expect(result.needed).toBe(true);
    expect(result.pending).toBe(false);
    expect(result.totalMessageCount).toBe(23);
  });

  it("marks reflection snapshot rows as pending", async () => {
    mockSQL.mockResolvedValueOnce([{ user_id: "user-1" }]);
    const claimed = await markReflectionSnapshotPending(
      mockSQL,
      "user-1",
      20,
      "2026-03-29T20:00:00Z"
    );
    expect(claimed).toBe(true);
    expect(mockSQL).toHaveBeenCalled();
  });

  it("runs a reflection snapshot from all persisted messages", async () => {
    mockSQL
      .mockResolvedValueOnce([
        { id: "m1", user_id: "user-1", role: "assistant", content: "Hello", created_at: "2026-03-26T00:00:00Z" },
        { id: "m2", user_id: "user-1", role: "user", content: "I build walls.", created_at: "2026-03-26T00:01:00Z" },
        { id: "m3", user_id: "user-1", role: "assistant", content: "What are the walls protecting?", created_at: "2026-03-26T00:02:00Z" },
        { id: "m4", user_id: "user-1", role: "user", content: "My time.", created_at: "2026-03-26T00:03:00Z" },
        { id: "m5", user_id: "user-1", role: "assistant", content: "What does losing time mean for you?", created_at: "2026-03-26T00:04:00Z" },
        { id: "m6", user_id: "user-1", role: "user", content: "Being swallowed.", created_at: "2026-03-26T00:05:00Z" },
        { id: "m7", user_id: "user-1", role: "assistant", content: "Where do you still feel free?", created_at: "2026-03-26T00:06:00Z" },
        { id: "m8", user_id: "user-1", role: "user", content: "When I paint.", created_at: "2026-03-26T00:07:00Z" },
        { id: "m9", user_id: "user-1", role: "assistant", content: "Why did you stop?", created_at: "2026-03-26T00:08:00Z" },
        { id: "m10", user_id: "user-1", role: "user", content: "I got scared.", created_at: "2026-03-26T00:09:00Z" }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    vi.mocked(callClaude).mockResolvedValueOnce(JSON.stringify({
      updatedAt: "2026-03-26T00:10:00Z",
      factualAnchors: { art: "When I paint." },
      tensions: ["Wants freedom but protects time with walls"],
      recurringThemes: ["walls", "painting"],
      notableAbsences: ["family"],
      emotionalArc: "Guarded, then more direct",
      domainCoverage: [],
      recentAssistantQuestions: ["Why did you stop?"],
      openLoops: ["Why painting feels dangerous now"],
      inferredBigFive: {
        openness: { score: 74, confidence: "medium", evidence: "Explores inner symbolism" }
      },
      attachmentSignals: [{ dimension: "avoidance", signal: "Retreats into walls", strength: "moderate" }],
      valueSignals: [{ value: "Self-Direction", evidence: "Protects creative space", direction: "high_priority" }],
      moralFoundationSignals: [{ foundation: "fairness", signal: "Resents being swallowed by others' demands" }],
      conflictStyle: "Pulls back before responding.",
      meaningOrientation: "Painting feels like the clearest path to meaning."
    }));

    const note = await runReflectionSnapshot(mockSQL, "test-api-key", "user-1");
    expect(note).not.toBeNull();
    expect(note?.openLoops).toContain("Why painting feels dangerous now");
    expect(note?.inferredBigFive.openness?.score).toBe(74);
  });
});

describe("visible/hidden soul files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes hidden soul file timestamps and new profile fields", async () => {
    const timestamp = new Date("2026-03-29T20:00:00.000Z");
    mockSQL.mockResolvedValueOnce([{
      user_id: "user-1",
      version: 1,
      last_updated: timestamp,
      confidence: "low",
      expert_reflections: {},
      core_drivers: [],
      core_values: [],
      voice: {},
      depth_map: {
        safeEntryPoints: ["work"],
        unlockTopics: ["family distance"]
      },
      analyst_notes: [],
      big_five_scores: {
        openness: { score: 80, confidence: 0.8, evidence: "Pattern-driven" }
      },
      schwartz_profile: [{ value: "Self-Direction", priority: 1, evidence: "Protects autonomy" }],
      attachment_scores: { anxiety: 25, avoidance: 60, style: "dismissive", evidence: "Retreats under pressure" },
      moral_foundations: { care: 70, fairness: 62 },
      meaning_orientation: "meaning_seeking"
    }]);

    const file = await getHiddenSoulFile(mockSQL, "user-1");
    expect(file?.lastUpdated).toBe(timestamp.toISOString());
    expect(file?.depthMap.safeEntryPoints).toEqual(["work"]);
    expect(file?.bigFiveScores.openness?.score).toBe(80);
    expect(file?.attachmentScores.style).toBe("dismissive");
    expect(file?.meaningOrientation).toBe("meaning_seeking");
  });

  it("normalizes visible soul file timestamps and new dashboard fields", async () => {
    const timestamp = new Date("2026-03-29T20:00:00.000Z");
    mockSQL.mockResolvedValueOnce([{
      user_id: "user-1",
      version: 1,
      last_updated: timestamp,
      portrait: "Test",
      how_you_move: "",
      how_you_think: "",
      how_you_connect: "",
      what_you_carry: "",
      what_lights_you_up: "",
      your_contradictions: "",
      your_voice: "",
      crystallized_moments: [],
      open_threads: [],
      compass_scores: {},
      personality_spectrum: {
        openness: { position: 72, label: "Curious", evidence: "Explores many frames" }
      },
      top_values: [{ value: "Self-Direction", description: "Needs freedom" }],
      relational_style: "Opens through shared perspective."
    }]);

    const file = await getVisibleSoulFile(mockSQL, "user-1");
    expect(file?.lastUpdated).toBe(timestamp.toISOString());
    expect(file?.personalitySpectrum.openness?.position).toBe(72);
    expect(file?.topValues[0]?.value).toBe("Self-Direction");
    expect(file?.relationalStyle).toContain("shared perspective");
  });
});

describe("soul synthesis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the dashboard-v2 synthesis pipeline using all messages and latest reflection snapshot", async () => {
    mockSQL
      .mockResolvedValueOnce([
        { id: "m1", user_id: "user-1", role: "assistant", content: "Hello", created_at: "2026-03-26" },
        { id: "m2", user_id: "user-1", role: "user", content: "I build walls.", created_at: "2026-03-26" }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        note: {
          updatedAt: "2026-03-26T00:00:00Z",
          factualAnchors: {},
          tensions: [],
          recurringThemes: ["walls"],
          notableAbsences: [],
          emotionalArc: "",
          domainCoverage: [],
          recentAssistantQuestions: [],
          openLoops: [],
          inferredBigFive: {},
          attachmentSignals: [],
          valueSignals: [],
          moralFoundationSignals: [],
          conflictStyle: "",
          meaningOrientation: ""
        }
      }])
      .mockResolvedValue([])
      .mockResolvedValue([]);

    vi.mocked(callClaude)
      .mockResolvedValueOnce(JSON.stringify({
        bigFive: {
          openness: { score: 80, confidence: 0.8, evidence: "Thinks in symbols" },
          conscientiousness: null,
          extraversion: null,
          agreeableness: null,
          neuroticism: null
        },
        schwartzValues: [{ value: "Self-Direction", priority: 1, evidence: "Protects autonomy" }],
        attachment: { anxiety: 30, avoidance: 62, style: "dismissive", evidence: "Uses walls as protection" },
        moralFoundations: { care: 72, fairness: 65, loyalty: null, authority: null, purity: null },
        meaningOrientation: "meaning_seeking",
        conflictStyle: "Withdraws first.",
        coreDrivers: [{ driver: "Autonomy", strength: 0.9, inferred: true, evidence: "Walls metaphor" }],
        coreValues: ["independence"]
      }))
      .mockResolvedValueOnce(JSON.stringify({
        version: 1,
        lastUpdated: "2026-03-27",
        confidence: "medium",
        expertReflections: { psychologist: ["Avoidant"], sociologist: ["Outsider"], linguist: ["Metaphorical"], narrativeAnalyst: ["Hero journey"] },
        coreDrivers: [{ driver: "Autonomy", strength: 0.9, inferred: true, evidence: "walls" }],
        coreValues: ["independence"],
        voice: { register: "casual", density: "moderate", humorStyle: "dry", conflictStyle: "avoidant", disclosureRate: "gradual", signaturePatterns: [], voiceExamples: [] },
        depthMap: { safeEntryPoints: ["work"], unlockTopics: ["behind walls"], avoidEarly: ["family"], currentlyLiveTopics: ["identity"], domainCoverage: [] },
        analystNotes: ["Session 1 analysis"],
        bigFiveScores: {
          openness: { score: 80, confidence: 0.8, evidence: "Thinks in symbols" },
          conscientiousness: null,
          extraversion: null,
          agreeableness: null,
          neuroticism: null
        },
        schwartzProfile: [{ value: "Self-Direction", priority: 1, evidence: "Protects autonomy" }],
        attachmentScores: { anxiety: 30, avoidance: 62, style: "dismissive", evidence: "Uses walls as protection" },
        moralFoundations: { care: 72, fairness: 65, loyalty: null, authority: null, purity: null },
        meaningOrientation: "meaning_seeking"
      }));

    vi.mocked(streamClaude).mockReturnValueOnce((async function* () {
      yield JSON.stringify({
        version: 1,
        lastUpdated: "2026-03-27",
        portrait: "You build distance when the world feels too loud.",
        sections: { howYouMove: "Deliberately", howYouThink: "In systems", howYouConnect: "Cautiously", whatYouCarry: "Weight", whatLightsYouUp: "Flow", yourContradictions: "Many", yourVoice: "Measured" },
        crystallizedMoments: [{ quote: "I build walls", reflection: "Protection" }],
        openThreads: ["Behind the walls"],
        compassScores: {},
        personalitySpectrum: {
          openness: { position: 76, label: "Curious beneath the guard", evidence: "Keeps reaching for larger frames" },
          conscientiousness: null,
          extraversion: null,
          agreeableness: null,
          emotionalSensitivity: { position: 68, label: "Sensitive to pressure", evidence: "Overwhelm comes quickly" }
        },
        topValues: [{ value: "Self-Direction", description: "You need room to choose your own path." }],
        relationalStyle: "You open through shared perspective before deeper closeness."
      });
    })());

    const result = await runSoulSynthesis(mockSQL, "test-api-key", "user-1");

    expect(result.visible?.portrait).toContain("distance");
    expect(result.visible?.personalitySpectrum.openness?.position).toBe(76);
    expect(result.hidden?.bigFiveScores.openness?.score).toBe(80);
    expect(result.hidden?.attachmentScores.style).toBe("dismissive");
  });

  it("falls back to the single-call synthesis when assessment parsing fails", async () => {
    mockSQL
      .mockResolvedValueOnce([
        { id: "m1", user_id: "user-1", role: "user", content: "test", created_at: "2026-03-26" }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    vi.mocked(callClaude).mockResolvedValueOnce("not valid json");
    vi.mocked(streamClaude).mockReturnValueOnce((async function* () {
      yield `${JSON.stringify({
        version: 1,
        lastUpdated: "2026-03-27",
        portrait: "Fallback portrait",
        sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
        crystallizedMoments: [],
        openThreads: [],
        compassScores: {},
        personalitySpectrum: {},
        topValues: [],
        relationalStyle: null
      })}\n<<<SPLIT>>>\n${JSON.stringify({
        version: 1,
        lastUpdated: "2026-03-27",
        confidence: "low",
        expertReflections: { psychologist: [], sociologist: [], linguist: [], narrativeAnalyst: [] },
        coreDrivers: [],
        coreValues: [],
        voice: { register: "casual", density: "moderate", humorStyle: "", conflictStyle: "", disclosureRate: "gradual", signaturePatterns: [], voiceExamples: [] },
        depthMap: { safeEntryPoints: [], unlockTopics: [], avoidEarly: [], currentlyLiveTopics: [], domainCoverage: [] },
        analystNotes: [],
        bigFiveScores: {},
        schwartzProfile: [],
        attachmentScores: {},
        moralFoundations: {},
        meaningOrientation: null
      })}`;
    })());

    const result = await runSoulSynthesis(mockSQL, "test-api-key", "user-1");
    expect(result.visible?.portrait).toBe("Fallback portrait");
  });

  it("handles total synthesis failure gracefully", async () => {
    mockSQL
      .mockResolvedValueOnce([
        { id: "m1", user_id: "user-1", role: "user", content: "test", created_at: "2026-03-26" }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    vi.mocked(callClaude).mockRejectedValueOnce(new Error("API error"));
    vi.mocked(streamClaude).mockReturnValue((async function* () {
      throw new Error("fallback error");
    })());

    const result = await runSoulSynthesis(mockSQL, "test-api-key", "user-1");
    expect(result.visible).toBeNull();
    expect(result.hidden).toBeNull();
  });
});

describe("synthesis status helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pending true when a non-stale pending synthesis exists", async () => {
    mockSQL.mockResolvedValueOnce([{ synthesis_started_at: new Date().toISOString() }]);
    const result = await checkSynthesisNeeded(mockSQL, "user-1");
    expect(result.needed).toBe(false);
    expect(result.pending).toBe(true);
  });

  it("marks synthesis rows pending and failed", async () => {
    mockSQL.mockResolvedValueOnce([{ user_id: "user-1" }]);
    const claimed = await markSynthesisPending(mockSQL, "user-1");
    expect(claimed).toBe(true);

    mockSQL.mockResolvedValueOnce([]);
    await markSynthesisFailed(mockSQL, "user-1");
    expect(mockSQL).toHaveBeenCalled();
  });
});
