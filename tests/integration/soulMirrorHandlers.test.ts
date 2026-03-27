import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all shared modules before importing handlers
vi.mock("../../supabase/functions/_shared/db.ts", () => ({
  getActiveSessionByTokenHash: vi.fn(),
  touchDeviceSession: vi.fn(),
  ensureUser: vi.fn(),
  createDeviceSession: vi.fn(),
  revokeSessionsForDevice: vi.fn()
}));

vi.mock("../../supabase/functions/_shared/soulApp.ts", () => ({
  bootstrapSoulState: vi.fn(),
  createSoulSession: vi.fn(),
  getSoulMessages: vi.fn(),
  getAllSoulMessages: vi.fn(),
  getActiveSession: vi.fn(),
  getLatestSession: vi.fn(),
  getVisibleSoulFile: vi.fn(),
  runSoulSynthesis: vi.fn(),
  isSessionStale: vi.fn(),
  autoCompleteStaleSession: vi.fn()
}));

vi.mock("../../supabase/functions/_shared/auth.ts", () => ({
  readBearerToken: vi.fn(),
  hashSessionToken: vi.fn(),
  issueSessionToken: vi.fn()
}));

import { handleBootstrapSoul } from "../../supabase/functions/bootstrap-soul/index.ts";
import { handleGetSoulFile } from "../../supabase/functions/get-soul-file/index.ts";
import { handleEndSoulSession } from "../../supabase/functions/end-soul-session/index.ts";
import { handleSynthesizeSoulFile } from "../../supabase/functions/synthesize-soul-file/index.ts";

import { readBearerToken, hashSessionToken, issueSessionToken } from "../../supabase/functions/_shared/auth.ts";
import { getActiveSessionByTokenHash, touchDeviceSession, ensureUser, createDeviceSession, revokeSessionsForDevice } from "../../supabase/functions/_shared/db.ts";
import { bootstrapSoulState, getAllSoulMessages, getActiveSession, getLatestSession, getVisibleSoulFile, runSoulSynthesis } from "../../supabase/functions/_shared/soulApp.ts";

function makeRequest(headers: Record<string, string> = {}, body?: unknown): Request {
  return new Request("https://edge.supabase.co/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
}

const mockDeviceSession = {
  id: "ds-1",
  user_id: "user-1",
  device_id: "device-1",
  token_hash: "hash-1",
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  last_seen_at: new Date().toISOString(),
  revoked_at: null
};

describe("handleBootstrapSoul", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns soul state for authenticated user with existing session", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(bootstrapSoulState).mockResolvedValue({
      visibleSoulFile: null,
      activeSession: null,
      canStartSession: true,
      cooldownRemainingMs: 0,
      nextSessionNumber: 1
    });
    vi.mocked(getAllSoulMessages).mockResolvedValue([]);

    const request = makeRequest({ "x-aaru-session": "valid-token" });
    const response = await handleBootstrapSoul({ device_id: "device-1" }, request);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("user_id", "user-1");
    expect(response.body).toHaveProperty("can_start_session", true);
    expect(response.body).toHaveProperty("next_session_number", 1);
    expect(response.body).toHaveProperty("visible_soul_file");
  });

  it("creates new user and session when no bearer token", async () => {
    vi.mocked(readBearerToken).mockReturnValue(null);
    vi.mocked(ensureUser).mockResolvedValue({
      id: "new-user",
      device_id: "new-device",
      display_name: "Soul abc1",
      instance_id: null,
      is_npc: false
    });
    vi.mocked(revokeSessionsForDevice).mockResolvedValue(undefined);
    vi.mocked(issueSessionToken).mockResolvedValue({
      token: "new-token",
      tokenHash: "new-hash",
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    vi.mocked(createDeviceSession).mockResolvedValue(mockDeviceSession);
    vi.mocked(bootstrapSoulState).mockResolvedValue({
      visibleSoulFile: null,
      activeSession: null,
      canStartSession: true,
      cooldownRemainingMs: 0,
      nextSessionNumber: 1
    });
    vi.mocked(getAllSoulMessages).mockResolvedValue([]);

    const request = makeRequest();
    const response = await handleBootstrapSoul({ device_id: "new-device" }, request);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("user_id", "new-user");
    expect(response.body).toHaveProperty("token", "new-token");
  });

  it("includes messages when user has conversation history", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(bootstrapSoulState).mockResolvedValue({
      visibleSoulFile: null,
      activeSession: {
        id: "session-1",
        user_id: "user-1",
        session_number: 1,
        status: "in_session",
        exchange_count: 3,
        reflection_notes: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        next_available_at: null,
        extraction_error: null,
        created_at: new Date().toISOString()
      },
      canStartSession: false,
      cooldownRemainingMs: 0,
      nextSessionNumber: 1
    });
    vi.mocked(getAllSoulMessages).mockResolvedValue([
      { id: "m1", session_id: "session-1", user_id: "user-1", role: "assistant", content: "Welcome.", created_at: new Date().toISOString() },
      { id: "m2", session_id: "session-1", user_id: "user-1", role: "user", content: "Hello.", created_at: new Date().toISOString() }
    ]);

    const request = makeRequest({ "x-aaru-session": "valid-token" });
    const response = await handleBootstrapSoul({ device_id: "device-1" }, request);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("messages");
    const body = response.body as Record<string, unknown>;
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("assistant");
    expect(messages[1].content).toBe("Hello.");
  });

  it("rejects invalid device_id", async () => {
    const request = makeRequest();
    await expect(
      handleBootstrapSoul({ device_id: "" }, request)
    ).rejects.toThrow();
  });
});

describe("handleGetSoulFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without bearer token", async () => {
    vi.mocked(readBearerToken).mockReturnValue(null);

    const request = makeRequest();
    const response = await handleGetSoulFile({}, request);

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("message", "Missing device session");
  });

  it("returns 401 for expired session", async () => {
    vi.mocked(readBearerToken).mockReturnValue("expired-token");
    vi.mocked(hashSessionToken).mockResolvedValue("expired-hash");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue({
      ...mockDeviceSession,
      expires_at: new Date(Date.now() - 1000).toISOString() // expired
    });

    const request = makeRequest({ "x-aaru-session": "expired-token" });
    const response = await handleGetSoulFile({}, request);

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("message", "Invalid device session");
  });

  it("returns visible soul file for authenticated user", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getVisibleSoulFile).mockResolvedValue({
      version: 2,
      lastUpdated: "2026-03-26",
      portrait: "A builder of worlds",
      sections: {
        howYouMove: "With deliberation",
        howYouThink: "",
        howYouConnect: "",
        whatYouCarry: "",
        whatLightsYouUp: "",
        yourContradictions: "",
        yourVoice: ""
      },
      crystallizedMoments: [],
      openThreads: []
    });

    const request = makeRequest({ "x-aaru-session": "valid-token" });
    const response = await handleGetSoulFile({}, request);

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body).toHaveProperty("visible_soul_file");
    expect(body).toHaveProperty("version", 2);
    const vsf = body.visible_soul_file as Record<string, unknown>;
    expect(vsf.portrait).toBe("A builder of worlds");
  });
});

describe("handleEndSoulSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without bearer token", async () => {
    vi.mocked(readBearerToken).mockReturnValue(null);

    const request = makeRequest();
    const response = await handleEndSoulSession({}, request);

    expect(response.status).toBe(401);
  });

  it("returns 404 when no active session", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getActiveSession).mockResolvedValue(null);

    const request = makeRequest({ "x-aaru-session": "valid-token" });
    const response = await handleEndSoulSession({}, request);

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty("message", "No active soul session");
  });

  it("runs synthesis and returns updated soul file", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getActiveSession).mockResolvedValue({
      id: "session-1",
      user_id: "user-1",
      session_number: 1,
      status: "in_session",
      exchange_count: 10,
      reflection_notes: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      next_available_at: null,
      extraction_error: null,
      created_at: new Date().toISOString()
    });
    vi.mocked(runSoulSynthesis).mockResolvedValue({
      visible: {
        version: 2,
        lastUpdated: "2026-03-27",
        portrait: "A synthesized portrait",
        sections: {
          howYouMove: "Boldly",
          howYouThink: "In systems",
          howYouConnect: "Cautiously",
          whatYouCarry: "The weight",
          whatLightsYouUp: "Discovery",
          yourContradictions: "Many",
          yourVoice: "Measured"
        },
        crystallizedMoments: [],
        openThreads: []
      },
      hidden: {
        version: 2,
        lastUpdated: "2026-03-27",
        confidence: "medium" as const,
        expertReflections: { psychologist: [], sociologist: [], linguist: [], narrativeAnalyst: [] },
        coreDrivers: [],
        coreValues: [],
        voice: { register: "casual", density: "moderate", humorStyle: "", conflictStyle: "", disclosureRate: "gradual", signaturePatterns: [], voiceExamples: [] },
        depthMap: { safeEntryPoints: [], unlockTopics: [], avoidEarly: [], currentlyLiveTopics: [] },
        analystNotes: []
      }
    });

    const request = makeRequest({ "x-aaru-session": "valid-token" });
    const response = await handleEndSoulSession({}, request);

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body).toHaveProperty("session_completed", true);
    expect(body).toHaveProperty("synthesis_succeeded", true);
    const vsf = body.visible_soul_file as Record<string, unknown>;
    expect(vsf.portrait).toBe("A synthesized portrait");
  });
});

describe("handleSynthesizeSoulFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without bearer token", async () => {
    vi.mocked(readBearerToken).mockReturnValue(null);

    const request = makeRequest();
    const response = await handleSynthesizeSoulFile({}, request);

    expect(response.status).toBe(401);
  });

  it("returns 404 when no session exists", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getActiveSession).mockResolvedValue(null);
    vi.mocked(getLatestSession).mockResolvedValue(null);

    const request = makeRequest({ "x-aaru-session": "valid-token" });
    const response = await handleSynthesizeSoulFile({}, request);

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty("message", "No soul session found");
  });

  it("skips synthesis when no new messages since last update", async () => {
    const lastUpdated = new Date().toISOString();
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getActiveSession).mockResolvedValue({
      id: "session-1",
      user_id: "user-1",
      session_number: 1,
      status: "in_session",
      exchange_count: 10,
      reflection_notes: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      next_available_at: null,
      extraction_error: null,
      created_at: new Date().toISOString()
    });
    vi.mocked(getVisibleSoulFile).mockResolvedValue({
      version: 2,
      lastUpdated,
      portrait: "Existing portrait",
      sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
      crystallizedMoments: [],
      openThreads: []
    });
    // All messages are older than last soul file update
    vi.mocked(getAllSoulMessages).mockResolvedValue([
      { id: "m1", session_id: "session-1", user_id: "user-1", role: "user", content: "old", created_at: new Date(Date.now() - 60000).toISOString() }
    ]);

    const request = makeRequest({ "x-aaru-session": "valid-token" });
    const response = await handleSynthesizeSoulFile({}, request);

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body).toHaveProperty("synthesis_succeeded", true);
    const vsf = body.visible_soul_file as Record<string, unknown>;
    expect(vsf.portrait).toBe("Existing portrait");
    // runSoulSynthesis should NOT have been called
    expect(runSoulSynthesis).not.toHaveBeenCalled();
  });

  it("runs synthesis on active session and returns result", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getActiveSession).mockResolvedValue({
      id: "session-1",
      user_id: "user-1",
      session_number: 1,
      status: "in_session",
      exchange_count: 10,
      reflection_notes: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      next_available_at: null,
      extraction_error: null,
      created_at: new Date().toISOString()
    });
    // Has new messages since last soul file update
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(getAllSoulMessages).mockResolvedValue([
      { id: "m1", session_id: "session-1", user_id: "user-1", role: "user", content: "Hello", created_at: new Date().toISOString() }
    ]);
    vi.mocked(runSoulSynthesis).mockResolvedValue({
      visible: {
        version: 2,
        lastUpdated: "2026-03-27",
        portrait: "A synthesized portrait",
        sections: {
          howYouMove: "Boldly",
          howYouThink: "In systems",
          howYouConnect: "Cautiously",
          whatYouCarry: "The weight",
          whatLightsYouUp: "Discovery",
          yourContradictions: "Many",
          yourVoice: "Measured"
        },
        crystallizedMoments: [],
        openThreads: []
      },
      hidden: null
    });

    const request = makeRequest({ "x-aaru-session": "valid-token" });
    const response = await handleSynthesizeSoulFile({}, request);

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body).toHaveProperty("synthesis_succeeded", true);
    const vsf = body.visible_soul_file as Record<string, unknown>;
    expect(vsf.portrait).toBe("A synthesized portrait");
  });

  it("falls back to latest completed session when no active session", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getActiveSession).mockResolvedValue(null);
    vi.mocked(getLatestSession).mockResolvedValue({
      id: "session-2",
      user_id: "user-1",
      session_number: 2,
      status: "complete",
      exchange_count: 12,
      reflection_notes: null,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      next_available_at: null,
      extraction_error: null,
      created_at: new Date().toISOString()
    });
    // Has new messages since last soul file update
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(getAllSoulMessages).mockResolvedValue([
      { id: "m1", session_id: "session-2", user_id: "user-1", role: "user", content: "test", created_at: new Date().toISOString() }
    ]);
    vi.mocked(runSoulSynthesis).mockResolvedValue({
      visible: {
        version: 3,
        lastUpdated: "2026-03-27",
        portrait: "Portrait from completed session",
        sections: {
          howYouMove: "", howYouThink: "", howYouConnect: "",
          whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: ""
        },
        crystallizedMoments: [],
        openThreads: []
      },
      hidden: null
    });

    const request = makeRequest({ "x-aaru-session": "valid-token" });
    const response = await handleSynthesizeSoulFile({}, request);

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body).toHaveProperty("synthesis_succeeded", true);
    const vsf = body.visible_soul_file as Record<string, unknown>;
    expect(vsf.portrait).toBe("Portrait from completed session");
  });
});
