import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all shared modules before importing handlers
vi.mock("../../workers/src/db.ts", () => ({
  getActiveSessionByTokenHash: vi.fn(),
  touchDeviceSession: vi.fn(),
  ensureUser: vi.fn(),
  createDeviceSession: vi.fn(),
  revokeSessionsForDevice: vi.fn(),
  deleteUser: vi.fn(),
  createSQL: vi.fn()
}));

vi.mock("../../workers/src/soulApp.ts", () => ({
  getAllSoulMessages: vi.fn(),
  getLastNMessages: vi.fn(),
  getVisibleSoulFile: vi.fn(),
  getHiddenSoulFile: vi.fn(),
  getReflectionNote: vi.fn(),
  upsertReflectionNote: vi.fn(),
  runSoulSynthesis: vi.fn(),
  insertSoulMessage: vi.fn(),
  parseReflectionNote: vi.fn(),
  emptyVisibleSoulFile: vi.fn(() => ({
    version: 1,
    lastUpdated: "",
    portrait: null,
    sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
    crystallizedMoments: [],
    openThreads: [],
    compassScores: {}
  }))
}));

vi.mock("../../workers/src/auth.ts", () => ({
  readBearerToken: vi.fn(),
  hashSessionToken: vi.fn(),
  issueSessionToken: vi.fn()
}));

import { handleBootstrapSoul } from "../../workers/src/handlers/bootstrap-soul.ts";
import { handleGetSoulFile } from "../../workers/src/handlers/get-soul-file.ts";
import { handleEndSoulSession } from "../../workers/src/handlers/end-soul-session.ts";
import { handleSynthesizeSoulFile } from "../../workers/src/handlers/synthesize-soul-file.ts";

import { readBearerToken, hashSessionToken, issueSessionToken } from "../../workers/src/auth.ts";
import { getActiveSessionByTokenHash, touchDeviceSession, ensureUser, createDeviceSession, revokeSessionsForDevice } from "../../workers/src/db.ts";
import { getAllSoulMessages, getLastNMessages, getVisibleSoulFile, getReflectionNote, runSoulSynthesis } from "../../workers/src/soulApp.ts";

const mockSQL = vi.fn();
const mockEnv = { DATABASE_URL: "mock", ANTHROPIC_API_KEY: "mock", THUMOS_SESSION_SECRET: "mock" };

function makeRequest(headers: Record<string, string> = {}, body?: unknown): Request {
  return new Request("https://api.trythumos.com/test", {
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

  it("returns soul state for authenticated user", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(getLastNMessages).mockResolvedValue([]);

    const request = makeRequest({ "x-thumos-session": "valid-token" });
    const response = await handleBootstrapSoul(mockSQL, mockEnv, { device_id: "device-1" }, request);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("user_id", "user-1");
    expect(response.body).toHaveProperty("has_messages", false);
    expect(response.body).toHaveProperty("visible_soul_file");
  });

  it("creates new user and session when no bearer token", async () => {
    vi.mocked(readBearerToken).mockReturnValue(null);
    vi.mocked(ensureUser).mockResolvedValue({
      id: "new-user",
      device_id: "new-device",
      display_name: "Soul abc1"
    });
    vi.mocked(revokeSessionsForDevice).mockResolvedValue(undefined);
    vi.mocked(issueSessionToken).mockResolvedValue({
      token: "new-token",
      tokenHash: "new-hash",
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    vi.mocked(createDeviceSession).mockResolvedValue(mockDeviceSession);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(getLastNMessages).mockResolvedValue([]);

    const request = makeRequest();
    const response = await handleBootstrapSoul(mockSQL, mockEnv, { device_id: "new-device" }, request);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("user_id", "new-user");
    expect(response.body).toHaveProperty("token", "new-token");
  });

  it("includes messages when user has recent messages", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(getLastNMessages).mockResolvedValue([
      { id: "m1", user_id: "user-1", role: "assistant", content: "Welcome.", created_at: new Date().toISOString() },
      { id: "m2", user_id: "user-1", role: "user", content: "Hello.", created_at: new Date().toISOString() }
    ]);

    const request = makeRequest({ "x-thumos-session": "valid-token" });
    const response = await handleBootstrapSoul(mockSQL, mockEnv, { device_id: "device-1" }, request);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("messages");
    expect(response.body).toHaveProperty("has_messages", true);
    const body = response.body as Record<string, unknown>;
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("assistant");
    expect(messages[1].content).toBe("Hello.");
  });

  it("rejects invalid device_id", async () => {
    const request = makeRequest();
    await expect(
      handleBootstrapSoul(mockSQL, mockEnv, { device_id: "" }, request)
    ).rejects.toThrow();
  });

  it("has_messages is true when visible soul file exists but no messages loaded", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getVisibleSoulFile).mockResolvedValue({
      version: 2,
      lastUpdated: "2026-03-26",
      portrait: "A builder",
      sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
      crystallizedMoments: [],
      openThreads: [],
      compassScores: {}
    });
    vi.mocked(getLastNMessages).mockResolvedValue([]);

    const request = makeRequest({ "x-thumos-session": "valid-token" });
    const response = await handleBootstrapSoul(mockSQL, mockEnv, { device_id: "device-1" }, request);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("has_messages", true);
  });
});

describe("handleGetSoulFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without bearer token", async () => {
    vi.mocked(readBearerToken).mockReturnValue(null);

    const request = makeRequest();
    const response = await handleGetSoulFile(mockSQL, {}, request);

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

    const request = makeRequest({ "x-thumos-session": "expired-token" });
    const response = await handleGetSoulFile(mockSQL, {}, request);

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
      openThreads: [],
      compassScores: {}
    });

    const request = makeRequest({ "x-thumos-session": "valid-token" });
    const response = await handleGetSoulFile(mockSQL, {}, request);

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body).toHaveProperty("visible_soul_file");
    expect(body).toHaveProperty("version", 2);
    const vsf = body.visible_soul_file as Record<string, unknown>;
    expect(vsf.portrait).toBe("A builder of worlds");
  });
});

describe("handleEndSoulSession (deprecated — no-op)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without bearer token", async () => {
    vi.mocked(readBearerToken).mockReturnValue(null);

    const request = makeRequest();
    const response = await handleEndSoulSession(mockSQL, mockEnv, {}, request);

    expect(response.status).toBe(401);
  });

  it("returns 200 with success for any authenticated user (no-op)", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getVisibleSoulFile).mockResolvedValue({
      version: 2,
      lastUpdated: "2026-03-26",
      portrait: "A builder",
      sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
      crystallizedMoments: [],
      openThreads: [],
      compassScores: {}
    });

    const request = makeRequest({ "x-thumos-session": "valid-token" });
    const response = await handleEndSoulSession(mockSQL, mockEnv, {}, request);

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body).toHaveProperty("session_completed", true);
    expect(body).toHaveProperty("synthesis_succeeded", true);
    const vsf = body.visible_soul_file as Record<string, unknown>;
    expect(vsf.portrait).toBe("A builder");
  });

  it("returns empty soul file when no soul file exists", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);

    const request = makeRequest({ "x-thumos-session": "valid-token" });
    const response = await handleEndSoulSession(mockSQL, mockEnv, {}, request);

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body).toHaveProperty("session_completed", true);
  });
});

describe("handleSynthesizeSoulFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without bearer token", async () => {
    vi.mocked(readBearerToken).mockReturnValue(null);

    const request = makeRequest();
    const response = await handleSynthesizeSoulFile(mockSQL, mockEnv, {}, request);

    expect(response.status).toBe(401);
  });

  it("skips synthesis when fewer than 3 user messages", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(getAllSoulMessages).mockResolvedValue([
      { id: "m1", user_id: "user-1", role: "user", content: "hello", created_at: new Date().toISOString() }
    ]);

    const request = makeRequest({ "x-thumos-session": "valid-token" });
    const response = await handleSynthesizeSoulFile(mockSQL, mockEnv, {}, request);

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body).toHaveProperty("synthesis_succeeded", true);
    expect(runSoulSynthesis).not.toHaveBeenCalled();
  });

  it("skips synthesis when no new messages since last update", async () => {
    const lastUpdated = new Date().toISOString();
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getVisibleSoulFile).mockResolvedValue({
      version: 2,
      lastUpdated,
      portrait: "Existing portrait",
      sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
      crystallizedMoments: [],
      openThreads: [],
      compassScores: {}
    });
    vi.mocked(getAllSoulMessages).mockResolvedValue([
      { id: "m1", user_id: "user-1", role: "user", content: "old", created_at: new Date(Date.now() - 60000).toISOString() },
      { id: "m2", user_id: "user-1", role: "user", content: "old2", created_at: new Date(Date.now() - 50000).toISOString() },
      { id: "m3", user_id: "user-1", role: "user", content: "old3", created_at: new Date(Date.now() - 40000).toISOString() }
    ]);

    const request = makeRequest({ "x-thumos-session": "valid-token" });
    const response = await handleSynthesizeSoulFile(mockSQL, mockEnv, {}, request);

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body).toHaveProperty("synthesis_succeeded", true);
    const vsf = body.visible_soul_file as Record<string, unknown>;
    expect(vsf.portrait).toBe("Existing portrait");
    expect(runSoulSynthesis).not.toHaveBeenCalled();
  });

  it("runs synthesis and returns result", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    const synthMsgs = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`, user_id: "user-1",
      role: "user", content: `msg ${i}`, created_at: new Date().toISOString()
    }));
    vi.mocked(getAllSoulMessages).mockResolvedValue(synthMsgs);
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
        openThreads: [],
        compassScores: {}
      },
      hidden: null
    });

    const request = makeRequest({ "x-thumos-session": "valid-token" });
    const response = await handleSynthesizeSoulFile(mockSQL, mockEnv, {}, request);

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body).toHaveProperty("synthesis_succeeded", true);
    const vsf = body.visible_soul_file as Record<string, unknown>;
    expect(vsf.portrait).toBe("A synthesized portrait");
    expect(runSoulSynthesis).toHaveBeenCalledWith(mockSQL, "mock", "user-1");
  });
});
