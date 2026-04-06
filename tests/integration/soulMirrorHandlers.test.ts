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
  checkHiddenSynthesisNeeded: vi.fn(),
  checkReflectionSnapshotNeeded: vi.fn(),
  checkSynthesisNeeded: vi.fn(),
  emptyVisibleSoulFile: vi.fn(() => ({
    version: 1,
    lastUpdated: "",
    portrait: null,
    sections: { howYouMove: "", howYouThink: "", howYouConnect: "", whatYouCarry: "", whatLightsYouUp: "", yourTensions: "", yourVoice: "" },
    crystallizedMoments: [],
    openThreads: [],
    compassScores: {},
    personalitySpectrum: {},
    topValues: [],
    relationalStyle: null
  })),
  getAllSoulMessages: vi.fn(),
  getHiddenSoulFile: vi.fn(),
  getLatestReflectionSnapshot: vi.fn(),
  getReflectionSnapshotState: vi.fn(),
  getHiddenSynthesisStatus: vi.fn(),
  getSynthesisStatus: vi.fn(),
  getVisibleSoulFile: vi.fn(),
  insertSoulMessage: vi.fn(),
  markHiddenSynthesisFailed: vi.fn(),
  markHiddenSynthesisPending: vi.fn(),
  markReflectionSnapshotFailed: vi.fn(),
  markReflectionSnapshotPending: vi.fn(),
  markSynthesisFailed: vi.fn(),
  markSynthesisPending: vi.fn(),
  runHiddenSynthesis: vi.fn(),
  runReflectionSnapshot: vi.fn(),
  runVisibleSynthesis: vi.fn()
}));

vi.mock("../../workers/src/backgroundJobsQueue.ts", () => ({
  enqueueReflectionSnapshot: vi.fn(),
  enqueueSynthesisHidden: vi.fn(),
  enqueueSynthesisVisible: vi.fn(),
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
import {
  enqueueReflectionSnapshot,
  enqueueSynthesisHidden,
  enqueueSynthesisVisible
} from "../../workers/src/backgroundJobsQueue.ts";
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
  checkHiddenSynthesisNeeded,
  checkReflectionSnapshotNeeded,
  checkSynthesisNeeded,
  getAllSoulMessages,
  getHiddenSoulFile,
  getLatestReflectionSnapshot,
  getVisibleSoulFile,
  insertSoulMessage,
  markHiddenSynthesisPending,
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

    const response = await handleBootstrapSoul(
      mockSQL,
      mockEnv,
      { device_id: "device-1" },
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("has_messages", true);
    expect(enqueueReflectionSnapshot).toHaveBeenCalledWith(mockEnv.BACKGROUND_QUEUE, "user-1", 20);
  });

  it("creates a new user/session when no session exists", async () => {
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
  });
});

describe("handleGetSoulFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns synthesis_pending true when visible synthesis is already running", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(checkSynthesisNeeded).mockResolvedValue({ needed: false, pending: true });
    vi.mocked(checkHiddenSynthesisNeeded).mockResolvedValue({ needed: false, pending: false });

    const response = await handleGetSoulFile(mockSQL, mockEnv, {}, makeRequest({ "x-thumos-session": "valid-token" }));
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("synthesis_pending", true);
  });

  it("enqueues visible and hidden synthesis when new messages exist", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(checkSynthesisNeeded).mockResolvedValue({ needed: true, pending: false });
    vi.mocked(checkHiddenSynthesisNeeded).mockResolvedValue({ needed: true, pending: false });
    vi.mocked(markSynthesisPending).mockResolvedValue(true);
    vi.mocked(markHiddenSynthesisPending).mockResolvedValue(true);
    vi.mocked(enqueueSynthesisVisible).mockResolvedValue({
      kind: "synthesis_visible",
      jobId: "job-1",
      userId: "user-1",
      queuedAt: "2026-03-29T20:00:00Z"
    });
    vi.mocked(enqueueSynthesisHidden).mockResolvedValue({
      kind: "synthesis_hidden",
      jobId: "job-2",
      userId: "user-1",
      queuedAt: "2026-03-29T20:00:00Z"
    });

    const response = await handleGetSoulFile(mockSQL, mockEnv, {}, makeRequest({ "x-thumos-session": "valid-token" }));
    expect(response.status).toBe(200);
    expect(enqueueSynthesisVisible).toHaveBeenCalledWith(mockEnv.BACKGROUND_QUEUE, "user-1");
    expect(enqueueSynthesisHidden).toHaveBeenCalledWith(mockEnv.BACKGROUND_QUEUE, "user-1");
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

    const response = await handleSoulConverse(
      mockSQL,
      mockEnv,
      makeRequest({ "x-thumos-session": "valid-token" }, { mode: "opening" })
    );
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

describe("debug routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("returns model profile info and the new steering preview", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(getUserModelProfileId).mockResolvedValue("value_v1");
    vi.mocked(getLatestReflectionSnapshot).mockResolvedValue({
      updatedAt: "2026-03-31T00:00:00Z",
      domainCoverage: [
        { domain: "work_and_purpose", depth: "deep", evidence: "Repeated discussion" }
      ],
      currentThreads: ["job drift"],
      avoidPastObservations: ["You use humor as armor"],
      avoidPastQuestions: ["What are you protecting?"],
      steerToTopics: ["relationships — the guard around intimacy"],
      steeringPressure: "gentle",
      steeringReasoning: "The current thread is cooling.",
      summary: "They're drifting at work and using humor as armor."
    });
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(getHiddenSoulFile).mockResolvedValue(null);

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
    expect(response.body).toHaveProperty("steering_preview.steer_to_topics");
  });

  it("updates the current user's model profile via the debug route", async () => {
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
