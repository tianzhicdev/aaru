import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../workers/src/db.ts", () => ({
  getActiveSessionByTokenHash: vi.fn(),
  getUserModelProfileId: vi.fn(),
  updateUserModelProfileId: vi.fn(),
  touchDeviceSession: vi.fn(),
  ensureUser: vi.fn(),
  createDeviceSession: vi.fn(),
  deleteUser: vi.fn(),
  createSQL: vi.fn()
}));

vi.mock("../../workers/src/soulApp.ts", () => ({
  checkReflectionSnapshotNeeded: vi.fn(),
  checkSynthesisNeeded: vi.fn(),
  emptyVisibleSoulFile: vi.fn(() => ({
    version: 1,
    lastUpdated: "",
    portrait: null,
    sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: "" },
    crystallizedMoments: [],
    openThreads: [],
    compassScores: {}
  })),
  getAllSoulMessages: vi.fn(),
  getHiddenSoulFile: vi.fn(),
  getLatestReflectionSnapshot: vi.fn(),
  getReflectionSnapshotState: vi.fn(),
  getSynthesisStatus: vi.fn(),
  getVisibleSoulFile: vi.fn(),
  insertSoulMessage: vi.fn(),
  markReflectionSnapshotFailed: vi.fn(),
  markReflectionSnapshotPending: vi.fn(),
  markSynthesisFailed: vi.fn(),
  markSynthesisPending: vi.fn(),
  runReflectionSnapshot: vi.fn(),
  runSoulSynthesis: vi.fn()
}));

vi.mock("../../workers/src/backgroundJobsQueue.ts", () => ({
  enqueueReflectionSnapshot: vi.fn(),
  enqueueSoulSynthesis: vi.fn(),
  processBackgroundJobsBatch: vi.fn()
}));

vi.mock("../../workers/src/auth.ts", () => ({
  readSessionToken: vi.fn(),
  hashSessionToken: vi.fn(),
  issueSessionToken: vi.fn()
}));

vi.mock("../../workers/src/llm.ts", () => ({
  streamLlmText: vi.fn()
}));

import { handleBootstrapSoul } from "../../workers/src/handlers/bootstrap-soul.ts";
import { handleDebugDump } from "../../workers/src/handlers/debug-dump.ts";
import { handleGetSoulFile } from "../../workers/src/handlers/get-soul-file.ts";
import { handleGetDebugInfo } from "../../workers/src/handlers/get-debug-info.ts";
import { handleSetModelProfile } from "../../workers/src/handlers/set-model-profile.ts";
import { handleSoulConverse } from "../../workers/src/handlers/soul-converse.ts";
import { handleSyncMessages } from "../../workers/src/handlers/sync-messages.ts";
import { enqueueReflectionSnapshot, enqueueSoulSynthesis } from "../../workers/src/backgroundJobsQueue.ts";
import { readSessionToken, hashSessionToken, issueSessionToken } from "../../workers/src/auth.ts";
import {
  getActiveSessionByTokenHash,
  getUserModelProfileId,
  updateUserModelProfileId,
  touchDeviceSession,
  ensureUser,
  createDeviceSession
} from "../../workers/src/db.ts";
import {
  checkReflectionSnapshotNeeded,
  checkSynthesisNeeded,
  getAllSoulMessages,
  getLatestReflectionSnapshot,
  getVisibleSoulFile,
  insertSoulMessage,
  markReflectionSnapshotPending,
  markSynthesisPending
} from "../../workers/src/soulApp.ts";
import { streamLlmText } from "../../workers/src/llm.ts";

const mockSQL = vi.fn();
const mockEnv = {
  DATABASE_URL: "mock",
  ANTHROPIC_API_KEY: "mock",
  THUMOS_SESSION_SECRET: "mock",
  DEBUG_API_TOKEN: "debug-token",
  ENABLE_DEBUG_TRACES: "true",
  BACKGROUND_QUEUE: { send: vi.fn().mockResolvedValue(undefined) }
};

const mockDeviceSession = {
  id: "ds-1",
  user_id: "user-1",
  device_id: "device-1",
  token_hash: "hash-1",
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  last_seen_at: new Date().toISOString(),
  revoked_at: null
};

function makeRequest(headers: Record<string, string> = {}, body?: unknown): Request {
  return new Request("https://api.trythumos.com/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
}

describe("bootstrap + sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns bootstrap state and queues a reflection snapshot when needed", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getUserModelProfileId).mockResolvedValue("frontier_v1");
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(checkReflectionSnapshotNeeded).mockResolvedValue({
      needed: true,
      pending: false,
      totalMessageCount: 20,
      lastMessageCreatedAt: "2026-03-29T20:00:00Z"
    });
    vi.mocked(markReflectionSnapshotPending).mockResolvedValue(true);
    vi.mocked(enqueueReflectionSnapshot).mockResolvedValue({
      kind: "reflection_snapshot",
      jobId: "job-1",
      userId: "user-1",
      queuedAt: "2026-03-29T20:00:00Z",
      throughMessageCount: 20
    });

    const response = await handleBootstrapSoul(mockSQL, mockEnv, { device_id: "device-1" }, makeRequest({ "x-thumos-session": "valid-token" }));

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("has_messages", true);
    expect(enqueueReflectionSnapshot).toHaveBeenCalledWith(mockEnv.BACKGROUND_QUEUE, "user-1", 20);
  });

  it("creates a new user/session when no bearer token exists", async () => {
    vi.mocked(readSessionToken).mockReturnValue(null);
    vi.mocked(ensureUser).mockResolvedValue({
      id: "new-user",
      device_id: "new-device",
      display_name: "Soul abc1",
      model_profile_id: "frontier_v1"
    });
    vi.mocked(issueSessionToken).mockResolvedValue({
      token: "new-token",
      tokenHash: "new-hash",
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    vi.mocked(createDeviceSession).mockResolvedValue(mockDeviceSession);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(getUserModelProfileId).mockResolvedValue("frontier_v1");
    vi.mocked(checkReflectionSnapshotNeeded).mockResolvedValue({
      needed: false,
      pending: false,
      totalMessageCount: 0,
      lastMessageCreatedAt: null
    });

    const response = await handleBootstrapSoul(mockSQL, mockEnv, { device_id: "new-device" }, makeRequest());
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("user_id", "new-user");
    expect(response.body).toHaveProperty("token", "new-token");
    expect(response.body).toHaveProperty("model_profile_id", "frontier_v1");
    expect(ensureUser).toHaveBeenCalledWith(mockSQL, "new-device", "frontier_v1");
  });

  it("returns canonical messages from sync-messages", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getAllSoulMessages).mockResolvedValue([
      { id: "m1", user_id: "user-1", role: "assistant", content: "Welcome.", created_at: "2026-03-29T20:00:00Z" },
      { id: "m2", user_id: "user-1", role: "user", content: "Hello.", created_at: "2026-03-29T20:01:00Z" }
    ]);
    vi.mocked(checkReflectionSnapshotNeeded).mockResolvedValue({
      needed: false,
      pending: false,
      totalMessageCount: 2,
      lastMessageCreatedAt: "2026-03-29T20:01:00Z"
    });

    const response = await handleSyncMessages(mockSQL, mockEnv, {}, makeRequest({ "x-thumos-session": "valid-token" }));
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("messages");
    expect((response.body as { messages: Array<{ id: string }> }).messages[0].id).toBe("m1");
  });
});

describe("handleGetSoulFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns synthesis_pending true when synthesis is already running", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(checkSynthesisNeeded).mockResolvedValue({ needed: false, pending: true });

    const response = await handleGetSoulFile(mockSQL, mockEnv, {}, makeRequest({ "x-thumos-session": "valid-token" }));
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("synthesis_pending", true);
  });

  it("enqueues synthesis when new messages exist", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(checkSynthesisNeeded).mockResolvedValue({ needed: true, pending: false });
    vi.mocked(markSynthesisPending).mockResolvedValue(true);
    vi.mocked(enqueueSoulSynthesis).mockResolvedValue({
      kind: "soul_synthesis",
      jobId: "job-1",
      userId: "user-1",
      queuedAt: "2026-03-29T20:00:00Z"
    });

    const response = await handleGetSoulFile(mockSQL, mockEnv, {}, makeRequest({ "x-thumos-session": "valid-token" }));
    expect(response.status).toBe(200);
    expect(enqueueSoulSynthesis).toHaveBeenCalledWith(mockEnv.BACKGROUND_QUEUE, "user-1");
    expect(response.body).toHaveProperty("synthesis_pending", true);
  });
});

describe("handleSoulConverse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds opening mode with a synthetic prompt when there is no prior conversation", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getUserModelProfileId).mockResolvedValue("frontier_v1");
    vi.mocked(getLatestReflectionSnapshot).mockResolvedValue(null);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(getAllSoulMessages).mockResolvedValue([]);
    vi.mocked(insertSoulMessage).mockResolvedValue(undefined);
    vi.mocked(checkReflectionSnapshotNeeded).mockResolvedValue({
      needed: false,
      pending: false,
      totalMessageCount: 1,
      lastMessageCreatedAt: "2026-03-29T20:00:00Z"
    });
    mockSQL.mockResolvedValue([]);

    vi.mocked(streamLlmText).mockReturnValueOnce((async function* () {
      yield "What part of you has been hardest to say out loud lately?";
    })());

    const response = await handleSoulConverse(mockSQL, mockEnv, makeRequest({ "x-thumos-session": "valid-token" }, { mode: "opening" }));
    await response.text();
    expect(response.status).toBe(200);
    expect(insertSoulMessage).toHaveBeenCalledWith(
      mockSQL,
      "user-1",
      "assistant",
      "What part of you has been hardest to say out loud lately?"
    );
  });
});

describe("handleDebugDump", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns raw state plus latest debug traces for an authenticated user", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);

    mockSQL
      .mockResolvedValueOnce([{
        id: "user-1",
        device_id: "device-1",
        last_active_at: "2026-03-29T20:00:00Z",
        created_at: "2026-03-29T19:00:00Z",
        updated_at: "2026-03-29T20:00:00Z"
      }])
      .mockResolvedValueOnce([
        { id: "m1", user_id: "user-1", role: "assistant", content: "Hello", created_at: "2026-03-29T20:00:00Z" }
      ])
      .mockResolvedValueOnce([{
        user_id: "user-1",
        through_message_count: 10,
        through_last_message_created_at: "2026-03-29T20:00:00Z",
        note: {
          updatedAt: "2026-03-29T20:00:00Z",
          factualAnchors: {},
          tensions: [],
          recurringThemes: [],
          notableAbsences: [],
          emotionalArc: "",
          domainCoverage: [],
          recentAssistantQuestions: [],
          openLoops: []
        },
        status: "ready"
      }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: "trace-1",
        user_id: "user-1",
        trace_kind: "conversation",
        model: "claude-opus-4-20250514",
        system_prompt: "prompt",
        input_messages: [],
        raw_response: "raw",
        meta: {},
        created_at: "2026-03-29T20:00:00Z"
      }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await handleDebugDump(
      mockSQL,
      mockEnv,
      {},
      makeRequest({
        "x-thumos-session": "valid-token",
        "x-thumos-debug-token": "debug-token"
      })
    );
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("reflection_snapshot_row");
    expect(response.body).toHaveProperty("reflection_note");
    expect(response.body).toHaveProperty("latest_conversation_trace");
  });

  it("rejects debug access without the developer token", async () => {
    const response = await handleDebugDump(
      mockSQL,
      mockEnv,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty("message", "Invalid debug token");
  });
});

describe("debug model profile routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns model profile info plus available options for an authenticated user", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(getUserModelProfileId).mockResolvedValue("value_v1");
    vi.mocked(getLatestReflectionSnapshot).mockResolvedValue(null);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    mockSQL.mockResolvedValue([]);

    const response = await handleGetDebugInfo(
      mockSQL,
      mockEnv,
      {},
      makeRequest({
        "x-thumos-session": "valid-token",
        "x-thumos-debug-token": "debug-token"
      })
    );

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("model_profile_id", "value_v1");
    expect(response.body).toHaveProperty("available_model_profiles");
  });

  it("updates the current user's model profile when debug auth passes", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(updateUserModelProfileId).mockResolvedValue("value_v1");

    const response = await handleSetModelProfile(
      mockSQL,
      mockEnv,
      { model_profile_id: "value_v1" },
      makeRequest({
        "x-thumos-session": "valid-token",
        "x-thumos-debug-token": "debug-token"
      })
    );

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("model_profile_id", "value_v1");
    expect(updateUserModelProfileId).toHaveBeenCalledWith(mockSQL, "user-1", "value_v1");
  });
});
