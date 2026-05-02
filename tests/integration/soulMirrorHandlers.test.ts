import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../workers/src/db.ts", () => ({
  getActiveSessionByTokenHash: vi.fn(),
  getUserModelProfileId: vi.fn(),
  getUserLanguage: vi.fn(),
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
    sections: { howYouLightUp: "", howYouShowUp: "", howYouLove: "", howYouWeatherStorms: "", whatYoureLookingFor: "", yourGrowingEdges: "", yourWarmth: "" },
    crystallizedMoments: [],
    openThreads: [],
    compassScores: {},
    personalitySpectrum: {},
    topValues: [],
    relationalStyle: null,
    attachmentStyle: null,
    loveSignature: null
  })),
  getAllSoulMessages: vi.fn(),
  getSoulMessagesAfter: vi.fn(),
  setProcessingRequestId: vi.fn(),
  getProcessingRequestId: vi.fn(),
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
  runVisibleSynthesis: vi.fn(),
  withCompatSections: vi.fn((file: Record<string, unknown>) => ({
    ...file,
    sections: {
      ...(file.sections as Record<string, unknown>),
      howYouMove: (file.sections as Record<string, string>).howYouLightUp ?? "",
      howYouThink: (file.sections as Record<string, string>).howYouShowUp ?? "",
      howYouConnect: (file.sections as Record<string, string>).howYouLove ?? "",
      whatYouCarry: (file.sections as Record<string, string>).howYouWeatherStorms ?? "",
      whatLightsYouUp: (file.sections as Record<string, string>).whatYoureLookingFor ?? "",
      yourTensions: (file.sections as Record<string, string>).yourGrowingEdges ?? "",
      yourVoice: (file.sections as Record<string, string>).yourWarmth ?? ""
    }
  }))
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
  streamLlmText: vi.fn(),
  callLlmText: vi.fn()
}));

vi.mock("../../workers/src/debugTraces.ts", () => ({
  recordClaudeDebugTrace: vi.fn().mockResolvedValue(undefined)
}));

import { handleBootstrapSoul } from "../../workers/src/handlers/bootstrap-soul.ts";
import { handleDebugDump } from "../../workers/src/handlers/debug-dump.ts";
import { handleGetSoulFile } from "../../workers/src/handlers/get-soul-file.ts";
import { handleGetDebugInfo } from "../../workers/src/handlers/get-debug-info.ts";
import { handleSetModelProfile } from "../../workers/src/handlers/set-model-profile.ts";
import { handleSoulConverse } from "../../workers/src/handlers/soul-converse.ts";
import { handleSoulSend } from "../../workers/src/handlers/soul-send.ts";
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
  getUserLanguage,
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
  getSoulMessagesAfter,
  getHiddenSoulFile,
  getLatestReflectionSnapshot,
  getVisibleSoulFile,
  insertSoulMessage,
  markHiddenSynthesisPending,
  markReflectionSnapshotPending,
  markSynthesisPending,
  setProcessingRequestId,
  getProcessingRequestId
} from "../../workers/src/soulApp.ts";
import { streamLlmText, callLlmText } from "../../workers/src/llm.ts";

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
  return new Request("https://api.trymagpie.xyz/test", {
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
    vi.mocked(getUserModelProfileId).mockResolvedValue("frontier");
    vi.mocked(getUserLanguage).mockResolvedValue("en");
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
      model_profile_id: "frontier",
      language: "en"
    });
    vi.mocked(issueSessionToken).mockResolvedValue({
      token: "new-token",
      tokenHash: "new-hash",
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
    vi.mocked(createDeviceSession).mockResolvedValue(mockDeviceSession);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(getUserModelProfileId).mockResolvedValue("frontier");
    vi.mocked(getUserLanguage).mockResolvedValue("en");
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

  it("returns a hardcoded intro message for first-ever opening without calling the LLM", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getUserModelProfileId).mockResolvedValue("frontier");
    vi.mocked(getUserLanguage).mockResolvedValue("en");
    vi.mocked(getLatestReflectionSnapshot).mockResolvedValue(null);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(getAllSoulMessages).mockResolvedValue([]);
    vi.mocked(insertSoulMessage).mockResolvedValue(undefined);
    mockSQL.mockResolvedValue([]);

    const response = await handleSoulConverse(
      mockSQL,
      mockEnv,
      makeRequest({ "x-thumos-session": "valid-token", "Accept": "application/json" }, { mode: "opening" })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.role).toBe("assistant");
    expect(body.content).toContain("Hey — I'm Magpie.");
    expect(body.content).toContain("your person"); // intro ends with partner-framed question
    expect(streamLlmText).not.toHaveBeenCalled();
    expect(insertSoulMessage).toHaveBeenCalledWith(
      mockSQL,
      "user-1",
      "assistant",
      expect.stringContaining("Hey — I'm Magpie.")
    );
  });
});

describe("handleSoulSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns accepted for a first-ever opening and inserts the intro message in background", async () => {
    vi.useFakeTimers();

    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getUserModelProfileId).mockResolvedValue("frontier");
    vi.mocked(getUserLanguage).mockResolvedValue("en");
    vi.mocked(getLatestReflectionSnapshot).mockResolvedValue(null);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(getAllSoulMessages).mockResolvedValue([]);
    vi.mocked(insertSoulMessage).mockResolvedValue(undefined);
    vi.mocked(setProcessingRequestId).mockResolvedValue(undefined);
    vi.mocked(getProcessingRequestId).mockImplementation(async () => {
      // Return the same requestId that was set (simulates no concurrent write)
      const calls = vi.mocked(setProcessingRequestId).mock.calls;
      return calls.length > 0 ? calls[calls.length - 1][2] : null;
    });
    mockSQL.mockResolvedValue([]);

    const waitUntilPromises: Promise<unknown>[] = [];
    const mockCtx = { waitUntil: (p: Promise<unknown>) => waitUntilPromises.push(p) };

    const response = await handleSoulSend(
      mockSQL,
      mockEnv,
      { mode: "opening" },
      makeRequest({ "x-thumos-session": "valid-token" }),
      mockCtx
    );

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "accepted");

    // Advance timers to flush all 2s delays between intro sentences
    await vi.runAllTimersAsync();
    await Promise.allSettled(waitUntilPromises);

    // First-ever intro is split into separate messages (one per sentence)
    const insertCalls = vi.mocked(insertSoulMessage).mock.calls;
    expect(insertCalls.length).toBeGreaterThanOrEqual(2);
    expect(insertCalls[0]).toEqual([mockSQL, "user-1", "assistant", expect.stringContaining("Hey — I'm Magpie.")]);
    // All calls should be assistant messages for user-1
    for (const call of insertCalls) {
      expect(call[1]).toBe("user-1");
      expect(call[2]).toBe("assistant");
    }
    expect(callLlmText).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("returns accepted for a reply and calls LLM in background", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getUserModelProfileId).mockResolvedValue("frontier");
    vi.mocked(getUserLanguage).mockResolvedValue("en");
    vi.mocked(getLatestReflectionSnapshot).mockResolvedValue(null);
    vi.mocked(getVisibleSoulFile).mockResolvedValue(null);
    vi.mocked(getAllSoulMessages).mockResolvedValue([
      { id: "m1", user_id: "user-1", role: "assistant", content: "Welcome.", created_at: "2026-03-29T20:00:00Z" },
      { id: "m2", user_id: "user-1", role: "user", content: "Hi there.", created_at: "2026-03-29T20:01:00Z" }
    ]);
    vi.mocked(insertSoulMessage).mockResolvedValue(undefined);
    vi.mocked(setProcessingRequestId).mockResolvedValue(undefined);
    vi.mocked(getProcessingRequestId).mockImplementation(async () => {
      const calls = vi.mocked(setProcessingRequestId).mock.calls;
      return calls.length > 0 ? calls[calls.length - 1][2] : null;
    });
    vi.mocked(callLlmText).mockResolvedValue("That's a great question!");
    vi.mocked(checkReflectionSnapshotNeeded).mockResolvedValue({
      needed: false,
      pending: false,
      totalMessageCount: 2,
      lastMessageCreatedAt: "2026-03-29T20:01:00Z"
    });
    mockSQL.mockResolvedValue([]);

    const waitUntilPromises: Promise<unknown>[] = [];
    const mockCtx = { waitUntil: (p: Promise<unknown>) => waitUntilPromises.push(p) };

    const response = await handleSoulSend(
      mockSQL,
      mockEnv,
      { mode: "reply", message: "Hi there." },
      makeRequest({ "x-thumos-session": "valid-token" }),
      mockCtx
    );

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "accepted");

    // User message inserted immediately
    expect(insertSoulMessage).toHaveBeenCalledWith(mockSQL, "user-1", "user", "Hi there.");

    // Wait for background processing
    await Promise.allSettled(waitUntilPromises);

    // LLM called and assistant message inserted
    expect(callLlmText).toHaveBeenCalled();
    expect(insertSoulMessage).toHaveBeenCalledWith(
      mockSQL,
      "user-1",
      "assistant",
      "That's a great question!"
    );
  });

  it("rejects invalid request body", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);

    const response = await handleSoulSend(
      mockSQL,
      mockEnv,
      { mode: "invalid" },
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(response.status).toBe(400);
  });
});

describe("sync-messages with after_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns incremental messages when after_id is provided", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getSoulMessagesAfter).mockResolvedValue([
      { id: "m3", user_id: "user-1", role: "assistant", content: "New message.", created_at: "2026-03-29T20:02:00Z" }
    ]);

    const response = await handleSyncMessages(
      mockSQL,
      mockEnv,
      { after_id: "m2" },
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(response.status).toBe(200);
    const body = response.body as { messages: Array<{ id: string }> };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toHaveProperty("id", "m3");
    // Should NOT check reflection when doing incremental poll
    expect(checkReflectionSnapshotNeeded).not.toHaveBeenCalled();
  });

  it("returns empty array when no new messages after after_id", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(touchDeviceSession).mockResolvedValue(undefined);
    vi.mocked(getSoulMessagesAfter).mockResolvedValue([]);

    const response = await handleSyncMessages(
      mockSQL,
      mockEnv,
      { after_id: "m2" },
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(response.status).toBe(200);
    const body = response.body as { messages: unknown[] };
    expect(body.messages).toHaveLength(0);
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
    vi.mocked(getUserModelProfileId).mockResolvedValue("value_default");
    vi.mocked(getLatestReflectionSnapshot).mockResolvedValue({
      updatedAt: "2026-03-31T00:00:00Z",
      conversationPhase: "spark",
      domainCoverage: [
        { domain: "daily_rhythm", depth: "deep", evidence: "Repeated discussion" }
      ],
      currentThreads: ["job drift"],
      avoidPastObservations: ["You use humor as armor"],
      avoidPastQuestions: ["What are you protecting?"],
      steerToTopics: ["relationships — the guard around intimacy"],
      steeringPressure: "gentle",
      steeringReasoning: "The current thread is cooling.",
      userOpenness: "warming",
      opennessEvidence: "Testing trust with medium-length responses.",
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
    expect(response.body).toHaveProperty("model_profile_id", "value_default");
    expect(response.body).toHaveProperty("steering_preview.steer_to_topics");
  });

  it("updates the current user's model profile via the debug route", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(updateUserModelProfileId).mockResolvedValue("value_default");

    const response = await handleSetModelProfile(
      mockSQL,
      mockEnv,
      { model_profile_id: "value_default" },
      makeRequest({
        "x-thumos-session": "valid-token",
        "x-thumos-debug-token": "debug-token"
      })
    );

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("model_profile_id", "value_default");
    expect(updateUserModelProfileId).toHaveBeenCalledWith(mockSQL, "user-1", "value_default");
  });
});
