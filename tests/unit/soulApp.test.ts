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

  it("parses the latest ready snapshot", async () => {
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
        openLoops: ["The job decision"]
      }
    }]);

    const note = await getLatestReflectionSnapshot(mockSQL, "user-1");
    expect(note?.factualAnchors.job).toBe("engineer");
    expect(note?.recentAssistantQuestions).toContain("What are you avoiding?");
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
      openLoops: ["Why painting feels dangerous now"]
    }));

    const note = await runReflectionSnapshot(mockSQL, "test-api-key", "user-1");
    expect(note).not.toBeNull();
    expect(note?.openLoops).toContain("Why painting feels dangerous now");
  });
});

describe("visible/hidden soul files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes hidden soul file timestamps and partial depth maps", async () => {
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
      analyst_notes: []
    }]);

    const file = await getHiddenSoulFile(mockSQL, "user-1");
    expect(file?.lastUpdated).toBe(timestamp.toISOString());
    expect(file?.depthMap.safeEntryPoints).toEqual(["work"]);
    expect(file?.depthMap.currentlyLiveTopics).toEqual([]);
  });

  it("normalizes visible soul file timestamps", async () => {
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
      compass_scores: {}
    }]);

    const file = await getVisibleSoulFile(mockSQL, "user-1");
    expect(file?.lastUpdated).toBe(timestamp.toISOString());
  });
});

describe("soul synthesis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs full synthesis using all messages and latest reflection snapshot", async () => {
    mockSQL
      .mockResolvedValueOnce([
        { id: "m1", user_id: "user-1", role: "assistant", content: "Hello", created_at: "2026-03-26" },
        { id: "m2", user_id: "user-1", role: "user", content: "I build walls.", created_at: "2026-03-26" }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ note: null }])
      .mockResolvedValue([])
      .mockResolvedValue([]);

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

    const synthesisOutput = JSON.stringify(visible) + "\n<<<SPLIT>>>\n" + JSON.stringify(hidden);
    vi.mocked(streamClaude).mockReturnValueOnce((async function* () {
      yield synthesisOutput;
    })());

    const result = await runSoulSynthesis(mockSQL, "test-api-key", "user-1");

    expect(result.visible?.portrait).toBe("A synthesized soul");
    expect(result.hidden?.expertReflections.psychologist).toContain("Avoidant");
  });

  it("handles synthesis failure gracefully", async () => {
    mockSQL
      .mockResolvedValueOnce([
        { id: "m1", user_id: "user-1", role: "user", content: "test", created_at: "2026-03-26" }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    vi.mocked(streamClaude).mockReturnValueOnce((async function* () {
      throw new Error("API error");
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
