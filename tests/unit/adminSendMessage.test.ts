import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../workers/src/notifications.ts", () => ({
  notifyAdminMessage: vi.fn().mockResolvedValue(undefined),
  upsertPushToken: vi.fn(),
  notifyNewMatch: vi.fn()
}));

vi.mock("../../workers/src/soulApp.ts", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../workers/src/soulApp.ts");
  return {
    ...actual,
    insertSoulMessage: vi.fn().mockResolvedValue(undefined)
  };
});

import { handleAdminSendMessage } from "../../workers/src/handlers/admin-send-message.ts";
import { insertSoulMessage } from "../../workers/src/soulApp.ts";
import { notifyAdminMessage } from "../../workers/src/notifications.ts";
import type { Env } from "../../workers/src/env.ts";

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://api.test/admin/send-message", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers }
  });
}

function envWith(token: string | undefined): Env {
  return { ADMIN_TOKEN: token } as unknown as Env;
}

describe("handleAdminSendMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when ADMIN_TOKEN is not configured", async () => {
    const sql = vi.fn();
    const res = await handleAdminSendMessage(
      sql as never,
      envWith(undefined),
      { user_id: VALID_USER_ID, content: "hi" },
      makeRequest({ "x-thumos-admin-token": "anything" })
    );
    expect(res.status).toBe(503);
  });

  it("returns 403 when admin token is missing or wrong", async () => {
    const sql = vi.fn();
    const env = envWith("real-token");

    const missing = await handleAdminSendMessage(
      sql as never, env, { user_id: VALID_USER_ID, content: "hi" }, makeRequest()
    );
    expect(missing.status).toBe(403);

    const wrong = await handleAdminSendMessage(
      sql as never, env, { user_id: VALID_USER_ID, content: "hi" },
      makeRequest({ "x-thumos-admin-token": "wrong" })
    );
    expect(wrong.status).toBe(403);
  });

  it("returns 400 on invalid payload", async () => {
    const sql = vi.fn();
    const res = await handleAdminSendMessage(
      sql as never,
      envWith("real-token"),
      { user_id: "not-a-uuid", content: "hi" },
      makeRequest({ "x-thumos-admin-token": "real-token" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when user does not exist", async () => {
    const sql = vi.fn(async () => []);
    const res = await handleAdminSendMessage(
      sql as never,
      envWith("real-token"),
      { user_id: VALID_USER_ID, content: "hi" },
      makeRequest({ "x-thumos-admin-token": "real-token" })
    );
    expect(res.status).toBe(404);
    expect(insertSoulMessage).not.toHaveBeenCalled();
  });

  it("inserts admin_message and triggers push on success", async () => {
    const sql = vi.fn(async () => [{ id: VALID_USER_ID }]);
    const res = await handleAdminSendMessage(
      sql as never,
      envWith("real-token"),
      { user_id: VALID_USER_ID, content: "hello there" },
      makeRequest({ "x-thumos-admin-token": "real-token" })
    );
    expect(res.status).toBe(200);
    expect(insertSoulMessage).toHaveBeenCalledWith(
      sql, VALID_USER_ID, "assistant", "hello there", "admin_message"
    );
    // Push fires async; allow microtasks to flush.
    await Promise.resolve();
    expect(notifyAdminMessage).toHaveBeenCalledWith(
      sql, expect.any(Object), VALID_USER_ID, "hello there"
    );
  });
});
