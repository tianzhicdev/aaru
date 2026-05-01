import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../../workers/src/notifications.ts", () => ({
  upsertPushToken: vi.fn().mockResolvedValue(undefined),
  notifyAdminMessage: vi.fn(),
  notifyNewMatch: vi.fn()
}));

import { handleRegisterPushToken } from "../../workers/src/handlers/register-push-token.ts";
import { readSessionToken, hashSessionToken } from "../../workers/src/auth.ts";
import { getActiveSessionByTokenHash } from "../../workers/src/db.ts";
import { upsertPushToken } from "../../workers/src/notifications.ts";

const session = {
  id: "ds-1",
  user_id: "user-1",
  device_id: "device-1",
  token_hash: "hash-1",
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  last_seen_at: new Date().toISOString(),
  revoked_at: null
};

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://api.test/push-tokens/register", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers }
  });
}

describe("handleRegisterPushToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionToken).mockReturnValue("session-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(session);
  });

  it("returns 401 without a session", async () => {
    vi.mocked(readSessionToken).mockReturnValue(null);
    const res = await handleRegisterPushToken(
      vi.fn() as never,
      { token: "tok-abcdefg" },
      makeRequest()
    );
    expect(res.status).toBe(401);
    expect(upsertPushToken).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid payload", async () => {
    const res = await handleRegisterPushToken(
      vi.fn() as never,
      { token: "" },
      makeRequest({ "x-thumos-session": "session-token" })
    );
    expect(res.status).toBe(400);
  });

  it("upserts token on success", async () => {
    const sql = vi.fn();
    const res = await handleRegisterPushToken(
      sql as never,
      { token: "tok-abcdefg" },
      makeRequest({ "x-thumos-session": "session-token" })
    );
    expect(res.status).toBe(200);
    expect(upsertPushToken).toHaveBeenCalledWith(sql, "user-1", "tok-abcdefg", "ios");
  });
});
