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
  isSessionStale,
  bootstrapSoulState,
  autoCompleteStaleSession,
  runReflectionUpdate,
  runSoulSynthesis
} from "../../workers/src/soulApp.ts";
import { callClaude } from "../../workers/src/claude.ts";
import { STALE_SESSION_HOURS } from "../../src/domain/constants.ts";

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    user_id: "user-1",
    session_number: 1,
    status: "in_session",
    exchange_count: 8,
    reflection_notes: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    next_available_at: null,
    extraction_error: null,
    created_at: new Date().toISOString(),
    ...overrides
  };
}

describe("bootstrapSoulState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty state for new user with no data", async () => {
    // getVisibleSoulFile → null, getActiveSession → null, getLatestSession → null
    mockSQL
      .mockResolvedValueOnce([]) // visible_soul_files
      .mockResolvedValueOnce([]) // active soul_sessions
      .mockResolvedValueOnce([]); // latest soul_sessions

    const state = await bootstrapSoulState(mockSQL, "new-user");

    expect(state.visibleSoulFile).toBeNull();
    expect(state.activeSession).toBeNull();
    expect(state.canStartSession).toBe(true);
    expect(state.cooldownRemainingMs).toBe(0);
    expect(state.nextSessionNumber).toBe(1);
  });

  it("returns existing soul file and active session", async () => {
    const session = makeSession({ session_number: 2, exchange_count: 5 });

    mockSQL
      .mockResolvedValueOnce([{
        user_id: "user-1",
        version: 2,
        last_updated: "2026-03-26",
        portrait: "A builder of worlds",
        how_you_move: "Boldly",
        how_you_think: "",
        how_you_connect: "",
        what_you_carry: "",
        what_lights_you_up: "",
        your_contradictions: "",
        your_voice: "",
        crystallized_moments: [],
        open_threads: []
      }]) // visible_soul_files
      .mockResolvedValueOnce([session]) // active soul_sessions
      .mockResolvedValueOnce([session]); // latest soul_sessions

    const state = await bootstrapSoulState(mockSQL, "user-1");

    expect(state.visibleSoulFile).not.toBeNull();
    expect(state.visibleSoulFile!.portrait).toBe("A builder of worlds");
    expect(state.activeSession).not.toBeNull();
    expect(state.canStartSession).toBe(false);
    expect(state.nextSessionNumber).toBe(2); // same as active
  });

  it("auto-completes stale active session", async () => {
    const staleTime = new Date(
      Date.now() - (STALE_SESSION_HOURS + 1) * 60 * 60 * 1000
    ).toISOString();
    const staleSession = makeSession({
      started_at: staleTime,
      created_at: staleTime
    });

    mockSQL
      .mockResolvedValueOnce([]) // visible_soul_files
      .mockResolvedValueOnce([staleSession]) // active session (stale)
      .mockResolvedValue([]); // updateSoulSession calls + latest session

    const state = await bootstrapSoulState(mockSQL, "user-1");

    // stale session was completed, so no active session
    expect(state.activeSession).toBeNull();
    expect(state.canStartSession).toBe(true);
  });
});

describe("autoCompleteStaleSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates session to complete status", async () => {
    mockSQL.mockResolvedValue([]); // All update calls return empty

    const session = makeSession();
    await autoCompleteStaleSession(mockSQL, session);

    // Should have been called for status, completed_at, extraction_error updates
    expect(mockSQL).toHaveBeenCalled();
  });
});

describe("runReflectionUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs reflection + light extraction and returns results", async () => {
    const session = makeSession({ exchange_count: 8, reflection_notes: [] });

    // getSoulMessages
    mockSQL.mockResolvedValueOnce([
      { id: "m1", session_id: "session-1", user_id: "user-1", role: "assistant", content: "Tell me about yourself.", created_at: "2026-03-26" },
      { id: "m2", session_id: "session-1", user_id: "user-1", role: "user", content: "I build walls.", created_at: "2026-03-26" }
    ]);
    // getVisibleSoulFile
    mockSQL.mockResolvedValueOnce([]);

    // callClaude for reflection → valid JSON note
    vi.mocked(callClaude).mockResolvedValueOnce(JSON.stringify({
      updatedAtExchange: 8,
      factualAnchors: { identity: "builder" },
      tensions: ["solitude vs connection"],
      recurringThemes: ["walls"],
      notableAbsences: ["family"],
      emotionalArc: "Guarded"
    }));

    // updateSoulSession (save reflection note) - multiple SQL calls
    mockSQL.mockResolvedValue([]);

    // callClaude for light visible extraction
    vi.mocked(callClaude).mockResolvedValueOnce(JSON.stringify({
      portrait: "A builder of walls and worlds",
      crystallizedMoments: [{ quote: "I build walls", reflection: "Protection as art" }],
      openThreads: ["What's behind the walls?"]
    }));

    const result = await runReflectionUpdate(mockSQL, "test-api-key", session, "user-1");

    expect(result.reflectionNote).not.toBeNull();
    expect(result.reflectionNote!.factualAnchors["identity"]).toBe("builder");
    expect(result.visibleSoulFile).not.toBeNull();
    expect(result.visibleSoulFile!.portrait).toBe("A builder of walls and worlds");
  });

  it("returns null on Claude failure (non-fatal)", async () => {
    const session = makeSession({ exchange_count: 8, reflection_notes: [] });

    // getSoulMessages
    mockSQL.mockResolvedValueOnce([
      { id: "m1", session_id: "session-1", user_id: "user-1", role: "user", content: "test", created_at: "2026-03-26" }
    ]);
    // getVisibleSoulFile
    mockSQL.mockResolvedValueOnce([]);

    // callClaude fails
    vi.mocked(callClaude).mockRejectedValueOnce(new Error("ANTHROPIC_API_KEY not configured"));

    const result = await runReflectionUpdate(mockSQL, "test-api-key", session, "user-1");

    expect(result.reflectionNote).toBeNull();
    expect(result.visibleSoulFile).toBeNull();
  });
});

describe("runSoulSynthesis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs full 4-expert synthesis and returns merged files", async () => {
    const session = makeSession({ exchange_count: 15, reflection_notes: [] });

    // getSoulMessages
    mockSQL.mockResolvedValueOnce([
      { id: "m1", session_id: "session-1", user_id: "user-1", role: "assistant", content: "Hello", created_at: "2026-03-26" },
      { id: "m2", session_id: "session-1", user_id: "user-1", role: "user", content: "I build walls.", created_at: "2026-03-26" }
    ]);
    // getVisibleSoulFile
    mockSQL.mockResolvedValueOnce([]);
    // getHiddenSoulFile
    mockSQL.mockResolvedValueOnce([]);

    // updateSoulSession (status → synthesizing) - resolve all subsequent SQL calls
    mockSQL.mockResolvedValue([]);

    const visible = {
      version: 1,
      lastUpdated: "2026-03-27",
      portrait: "A synthesized soul",
      sections: { howYouMove: "Deliberately", howYouThink: "In systems", howYouConnect: "Cautiously", whatYouCarry: "Weight", whatLightsYouUp: "Flow", yourContradictions: "Many", yourVoice: "Measured" },
      crystallizedMoments: [{ quote: "I build walls", reflection: "Protection" }],
      openThreads: ["Behind the walls"]
    };
    const hidden = {
      version: 1,
      lastUpdated: "2026-03-27",
      confidence: "low",
      expertReflections: { psychologist: ["Avoidant"], sociologist: ["Outsider"], linguist: ["Metaphorical"], narrativeAnalyst: ["Hero journey"] },
      coreDrivers: [{ driver: "Autonomy", strength: 0.9, inferred: true, evidence: "walls" }],
      coreValues: ["independence"],
      voice: { register: "casual", density: "moderate", humorStyle: "dry", conflictStyle: "avoidant", disclosureRate: "gradual", signaturePatterns: [], voiceExamples: [] },
      depthMap: { safeEntryPoints: ["work"], unlockTopics: ["behind walls"], avoidEarly: ["family"], currentlyLiveTopics: ["identity"] },
      analystNotes: ["Session 1 analysis"]
    };

    // callClaude returns synthesis
    vi.mocked(callClaude).mockResolvedValueOnce(
      JSON.stringify(visible) + "\n<<<SPLIT>>>\n" + JSON.stringify(hidden)
    );

    const result = await runSoulSynthesis(mockSQL, "test-api-key", session, "user-1");

    expect(result.visible).not.toBeNull();
    expect(result.visible!.portrait).toBe("A synthesized soul");
    expect(result.hidden).not.toBeNull();
    expect(result.hidden!.expertReflections.psychologist).toContain("Avoidant");
  });

  it("handles synthesis failure gracefully", async () => {
    const session = makeSession({ exchange_count: 15, reflection_notes: [] });

    // getSoulMessages
    mockSQL.mockResolvedValueOnce([
      { id: "m1", session_id: "session-1", user_id: "user-1", role: "user", content: "test", created_at: "2026-03-26" }
    ]);
    // getVisibleSoulFile
    mockSQL.mockResolvedValueOnce([]);
    // getHiddenSoulFile
    mockSQL.mockResolvedValueOnce([]);
    // updateSoulSession calls
    mockSQL.mockResolvedValue([]);

    // callClaude fails
    vi.mocked(callClaude).mockRejectedValueOnce(new Error("API error"));

    const result = await runSoulSynthesis(mockSQL, "test-api-key", session, "user-1");

    // Falls back to existing (null in this case)
    expect(result.visible).toBeNull();
    expect(result.hidden).toBeNull();
  });
});
