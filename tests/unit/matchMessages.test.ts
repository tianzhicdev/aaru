import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock auth layer ──────────────────────────────────────────
vi.mock("../../workers/src/auth.ts", () => ({
  readSessionToken: vi.fn(),
  hashSessionToken: vi.fn()
}));

vi.mock("../../workers/src/db.ts", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../workers/src/db.ts");
  return {
    ...actual,
    getActiveSessionByTokenHash: vi.fn(),
    touchDeviceSession: vi.fn().mockResolvedValue(undefined)
  };
});

// ── Mock matchApp DB functions ───────────────────────────────
vi.mock("../../workers/src/matchApp.ts", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../workers/src/matchApp.ts");
  return {
    ...actual,
    getMatchMessages: vi.fn(),
    insertMatchMessage: vi.fn(),
    getMatchedUserIds: vi.fn()
  };
});

import { handleGetMatchMessages, handlePostMatchMessage } from "../../workers/src/handlers/match-messages.ts";
import { readSessionToken, hashSessionToken } from "../../workers/src/auth.ts";
import { getActiveSessionByTokenHash } from "../../workers/src/db.ts";
import { getMatchMessages, insertMatchMessage, getMatchedUserIds } from "../../workers/src/matchApp.ts";
import type { MatchMessageRow } from "../../workers/src/matchApp.ts";

// ── Fixtures ─────────────────────────────────────────────────
const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const UNMATCHED_USER_ID = "00000000-0000-4000-8000-000000000099";

const session = {
  id: "ds-1",
  user_id: USER_ID,
  device_id: "device-1",
  token_hash: "hash-1",
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  last_seen_at: new Date().toISOString(),
  revoked_at: null
};

const sampleMessage: MatchMessageRow = {
  id: "msg-1",
  sender_id: USER_ID,
  receiver_id: OTHER_USER_ID,
  content: "Hey there!",
  created_at: new Date().toISOString()
};

const sampleMessage2: MatchMessageRow = {
  id: "msg-2",
  sender_id: OTHER_USER_ID,
  receiver_id: USER_ID,
  content: "Hi! How are you?",
  created_at: new Date(Date.now() + 1000).toISOString()
};

// ── Helpers ──────────────────────────────────────────────────
function makeGetRequest(
  params: Record<string, string> = {},
  headers: Record<string, string> = {}
): Request {
  const url = new URL("https://api.test/match-messages");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString(), {
    method: "GET",
    headers: { "content-type": "application/json", ...headers }
  });
}

function makePostRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://api.test/match-messages", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers }
  });
}

function setupAuth() {
  vi.mocked(readSessionToken).mockReturnValue("session-token");
  vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
  vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(session);
}

function setupMatched() {
  vi.mocked(getMatchedUserIds).mockResolvedValue([OTHER_USER_ID]);
}

// ─────────────────────────────────────────────────────────────
// GET /match-messages
// ─────────────────────────────────────────────────────────────
describe("handleGetMatchMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Auth ─────────────────────────────────────────────────
  it("returns 401 without a session token", async () => {
    vi.mocked(readSessionToken).mockReturnValue(null);
    const res = await handleGetMatchMessages(
      vi.fn() as never,
      undefined,
      makeGetRequest({ other_user_id: OTHER_USER_ID })
    );
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, message: "Missing device session" });
    expect(getMatchedUserIds).not.toHaveBeenCalled();
  });

  it("returns 401 with an expired session", async () => {
    vi.mocked(readSessionToken).mockReturnValue("session-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue({
      ...session,
      expires_at: new Date(Date.now() - 1000).toISOString()
    });
    const res = await handleGetMatchMessages(
      vi.fn() as never,
      undefined,
      makeGetRequest({ other_user_id: OTHER_USER_ID })
    );
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, message: "Invalid device session" });
  });

  it("returns 401 when session is not found", async () => {
    vi.mocked(readSessionToken).mockReturnValue("session-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-unknown");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(null);
    const res = await handleGetMatchMessages(
      vi.fn() as never,
      undefined,
      makeGetRequest({ other_user_id: OTHER_USER_ID })
    );
    expect(res.status).toBe(401);
  });

  // ── Validation ───────────────────────────────────────────
  it("returns 400 when other_user_id is missing", async () => {
    setupAuth();
    const res = await handleGetMatchMessages(
      vi.fn() as never,
      undefined,
      makeGetRequest() // no other_user_id param
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 400, message: "other_user_id is required" });
  });

  // ── Authorization ────────────────────────────────────────
  it("returns 403 when users are not matched", async () => {
    setupAuth();
    vi.mocked(getMatchedUserIds).mockResolvedValue([]);
    const res = await handleGetMatchMessages(
      vi.fn() as never,
      undefined,
      makeGetRequest({ other_user_id: UNMATCHED_USER_ID })
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 403, message: "Not matched with this user" });
    expect(getMatchMessages).not.toHaveBeenCalled();
  });

  it("returns 403 when matched with someone else but not the requested user", async () => {
    setupAuth();
    vi.mocked(getMatchedUserIds).mockResolvedValue([OTHER_USER_ID]);
    const res = await handleGetMatchMessages(
      vi.fn() as never,
      undefined,
      makeGetRequest({ other_user_id: UNMATCHED_USER_ID })
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 403, message: "Not matched with this user" });
  });

  // ── Happy paths ──────────────────────────────────────────
  it("returns messages for matched users", async () => {
    setupAuth();
    setupMatched();
    vi.mocked(getMatchMessages).mockResolvedValue([sampleMessage, sampleMessage2]);

    const sql = vi.fn();
    const res = await handleGetMatchMessages(
      sql as never,
      undefined,
      makeGetRequest({ other_user_id: OTHER_USER_ID })
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ messages: [sampleMessage, sampleMessage2] });
    expect(getMatchMessages).toHaveBeenCalledWith(sql, USER_ID, OTHER_USER_ID, undefined);
  });

  it("returns empty array when no messages exist", async () => {
    setupAuth();
    setupMatched();
    vi.mocked(getMatchMessages).mockResolvedValue([]);

    const res = await handleGetMatchMessages(
      vi.fn() as never,
      undefined,
      makeGetRequest({ other_user_id: OTHER_USER_ID })
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ messages: [] });
  });

  it("passes after_id for pagination", async () => {
    setupAuth();
    setupMatched();
    vi.mocked(getMatchMessages).mockResolvedValue([sampleMessage2]);

    const sql = vi.fn();
    const res = await handleGetMatchMessages(
      sql as never,
      undefined,
      makeGetRequest({ other_user_id: OTHER_USER_ID, after_id: "msg-1" })
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ messages: [sampleMessage2] });
    expect(getMatchMessages).toHaveBeenCalledWith(sql, USER_ID, OTHER_USER_ID, "msg-1");
  });

  it("passes undefined when after_id is not provided", async () => {
    setupAuth();
    setupMatched();
    vi.mocked(getMatchMessages).mockResolvedValue([]);

    const sql = vi.fn();
    await handleGetMatchMessages(
      sql as never,
      undefined,
      makeGetRequest({ other_user_id: OTHER_USER_ID })
    );

    expect(getMatchMessages).toHaveBeenCalledWith(sql, USER_ID, OTHER_USER_ID, undefined);
  });

  // ── Edge: getMatchedUserIds returns empty ─────────────────
  it("returns 403 when getMatchedUserIds returns empty array", async () => {
    setupAuth();
    vi.mocked(getMatchedUserIds).mockResolvedValue([]);
    const res = await handleGetMatchMessages(
      vi.fn() as never,
      undefined,
      makeGetRequest({ other_user_id: OTHER_USER_ID })
    );
    expect(res.status).toBe(403);
    expect(getMatchMessages).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// POST /match-messages
// ─────────────────────────────────────────────────────────────
describe("handlePostMatchMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Auth ─────────────────────────────────────────────────
  it("returns 401 without a session token", async () => {
    vi.mocked(readSessionToken).mockReturnValue(null);
    const res = await handlePostMatchMessage(
      vi.fn() as never,
      { receiver_id: OTHER_USER_ID, content: "hello" },
      makePostRequest()
    );
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 401, message: "Missing device session" });
    expect(insertMatchMessage).not.toHaveBeenCalled();
  });

  it("returns 401 with an expired session", async () => {
    vi.mocked(readSessionToken).mockReturnValue("session-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue({
      ...session,
      expires_at: new Date(Date.now() - 1000).toISOString()
    });
    const res = await handlePostMatchMessage(
      vi.fn() as never,
      { receiver_id: OTHER_USER_ID, content: "hello" },
      makePostRequest()
    );
    expect(res.status).toBe(401);
  });

  // ── Validation ───────────────────────────────────────────
  it("returns 400 when receiver_id is missing", async () => {
    setupAuth();
    const res = await handlePostMatchMessage(
      vi.fn() as never,
      { content: "hello" },
      makePostRequest()
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 400, message: "receiver_id is required" });
  });

  it("returns 400 when receiver_id is empty string", async () => {
    setupAuth();
    const res = await handlePostMatchMessage(
      vi.fn() as never,
      { receiver_id: "", content: "hello" },
      makePostRequest()
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 400, message: "receiver_id is required" });
  });

  it("returns 400 when content is empty", async () => {
    setupAuth();
    const res = await handlePostMatchMessage(
      vi.fn() as never,
      { receiver_id: OTHER_USER_ID, content: "" },
      makePostRequest()
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 400, message: "content must be 1-2000 characters" });
  });

  it("returns 400 when content is whitespace only", async () => {
    setupAuth();
    const res = await handlePostMatchMessage(
      vi.fn() as never,
      { receiver_id: OTHER_USER_ID, content: "   " },
      makePostRequest()
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 400, message: "content must be 1-2000 characters" });
  });

  it("returns 400 when content exceeds 2000 characters", async () => {
    setupAuth();
    const longContent = "a".repeat(2001);
    const res = await handlePostMatchMessage(
      vi.fn() as never,
      { receiver_id: OTHER_USER_ID, content: longContent },
      makePostRequest()
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 400, message: "content must be 1-2000 characters" });
  });

  it("returns 400 when content is missing entirely", async () => {
    setupAuth();
    const res = await handlePostMatchMessage(
      vi.fn() as never,
      { receiver_id: OTHER_USER_ID },
      makePostRequest()
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 400, message: "content must be 1-2000 characters" });
  });

  // ── Authorization ────────────────────────────────────────
  it("returns 403 when users are not matched", async () => {
    setupAuth();
    vi.mocked(getMatchedUserIds).mockResolvedValue([]);
    const res = await handlePostMatchMessage(
      vi.fn() as never,
      { receiver_id: UNMATCHED_USER_ID, content: "hello" },
      makePostRequest()
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 403, message: "Not matched with this user" });
    expect(insertMatchMessage).not.toHaveBeenCalled();
  });

  it("returns 403 when matched with someone else but not the receiver", async () => {
    setupAuth();
    vi.mocked(getMatchedUserIds).mockResolvedValue([OTHER_USER_ID]);
    const res = await handlePostMatchMessage(
      vi.fn() as never,
      { receiver_id: UNMATCHED_USER_ID, content: "hello" },
      makePostRequest()
    );
    expect(res.status).toBe(403);
    expect(insertMatchMessage).not.toHaveBeenCalled();
  });

  // ── Happy paths ──────────────────────────────────────────
  it("inserts and returns message on success", async () => {
    setupAuth();
    setupMatched();
    vi.mocked(insertMatchMessage).mockResolvedValue(sampleMessage);

    const sql = vi.fn();
    const res = await handlePostMatchMessage(
      sql as never,
      { receiver_id: OTHER_USER_ID, content: "Hey there!" },
      makePostRequest()
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: sampleMessage });
    expect(insertMatchMessage).toHaveBeenCalledWith(sql, USER_ID, OTHER_USER_ID, "Hey there!");
  });

  it("trims whitespace from content before inserting", async () => {
    setupAuth();
    setupMatched();
    vi.mocked(insertMatchMessage).mockResolvedValue({
      ...sampleMessage,
      content: "trimmed"
    });

    const sql = vi.fn();
    await handlePostMatchMessage(
      sql as never,
      { receiver_id: OTHER_USER_ID, content: "  trimmed  " },
      makePostRequest()
    );

    expect(insertMatchMessage).toHaveBeenCalledWith(sql, USER_ID, OTHER_USER_ID, "trimmed");
  });

  it("accepts content at exactly 2000 characters", async () => {
    setupAuth();
    setupMatched();
    const exactContent = "a".repeat(2000);
    vi.mocked(insertMatchMessage).mockResolvedValue({
      ...sampleMessage,
      content: exactContent
    });

    const sql = vi.fn();
    const res = await handlePostMatchMessage(
      sql as never,
      { receiver_id: OTHER_USER_ID, content: exactContent },
      makePostRequest()
    );

    expect(res.status).toBe(200);
    expect(insertMatchMessage).toHaveBeenCalledWith(sql, USER_ID, OTHER_USER_ID, exactContent);
  });

  it("accepts single-character content", async () => {
    setupAuth();
    setupMatched();
    vi.mocked(insertMatchMessage).mockResolvedValue({
      ...sampleMessage,
      content: "h"
    });

    const sql = vi.fn();
    const res = await handlePostMatchMessage(
      sql as never,
      { receiver_id: OTHER_USER_ID, content: "h" },
      makePostRequest()
    );

    expect(res.status).toBe(200);
    expect(insertMatchMessage).toHaveBeenCalledWith(sql, USER_ID, OTHER_USER_ID, "h");
  });

  it("returns the correct message shape from insertMatchMessage", async () => {
    setupAuth();
    setupMatched();
    const insertedMsg: MatchMessageRow = {
      id: "msg-new",
      sender_id: USER_ID,
      receiver_id: OTHER_USER_ID,
      content: "How are you doing?",
      created_at: "2026-04-30T12:00:00.000Z"
    };
    vi.mocked(insertMatchMessage).mockResolvedValue(insertedMsg);

    const res = await handlePostMatchMessage(
      vi.fn() as never,
      { receiver_id: OTHER_USER_ID, content: "How are you doing?" },
      makePostRequest()
    );

    expect(res.status).toBe(200);
    const body = res.body as { message: MatchMessageRow };
    expect(body.message).toEqual(insertedMsg);
    expect(body.message.id).toBe("msg-new");
    expect(body.message.sender_id).toBe(USER_ID);
    expect(body.message.receiver_id).toBe(OTHER_USER_ID);
    expect(body.message.content).toBe("How are you doing?");
    expect(body.message.created_at).toBe("2026-04-30T12:00:00.000Z");
  });

  // ── Edge: getMatchedUserIds returns empty ─────────────────
  it("returns 403 when getMatchedUserIds returns empty array", async () => {
    setupAuth();
    vi.mocked(getMatchedUserIds).mockResolvedValue([]);
    const res = await handlePostMatchMessage(
      vi.fn() as never,
      { receiver_id: OTHER_USER_ID, content: "hello" },
      makePostRequest()
    );
    expect(res.status).toBe(403);
    expect(insertMatchMessage).not.toHaveBeenCalled();
  });

  // ── Edge: receiver_id coercion ────────────────────────────
  it("coerces non-string receiver_id to string", async () => {
    setupAuth();
    // getMatchedUserIds returns the stringified version
    vi.mocked(getMatchedUserIds).mockResolvedValue(["123"]);
    vi.mocked(insertMatchMessage).mockResolvedValue({
      ...sampleMessage,
      receiver_id: "123"
    });

    const sql = vi.fn();
    const res = await handlePostMatchMessage(
      sql as never,
      { receiver_id: 123, content: "hello" },
      makePostRequest()
    );

    // String(123) === "123", which is in matchedIds
    expect(res.status).toBe(200);
    expect(insertMatchMessage).toHaveBeenCalledWith(sql, USER_ID, "123", "hello");
  });
});
