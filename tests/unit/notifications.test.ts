import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../workers/src/apns.ts", () => ({
  configFromEnv: vi.fn(),
  sendPush: vi.fn()
}));

import { notifyAdminMessage, notifyNewMatch, upsertPushToken } from "../../workers/src/notifications.ts";
import { configFromEnv, sendPush } from "../../workers/src/apns.ts";

type SqlMock = ReturnType<typeof vi.fn>;

const APNS_CONFIG = {
  keyP8: "k", keyId: "k", teamId: "t", topic: "com.test", useSandbox: true
};

function makeSql(handlers: Array<(query: string, values: unknown[]) => unknown>): SqlMock {
  let callIndex = 0;
  return vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join("?").replace(/\s+/g, " ").trim();
    const handler = handlers[callIndex++];
    if (!handler) throw new Error(`Unexpected SQL call ${callIndex}: ${query}`);
    return handler(query, values);
  });
}

describe("notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upsertPushToken inserts on conflict update", async () => {
    const calls: string[] = [];
    const sql = makeSql([
      (q) => { calls.push(q); return []; }
    ]);

    await upsertPushToken(sql as never, "user-1", "tok-abc");

    expect(calls[0]).toContain("INSERT INTO device_push_tokens");
    expect(calls[0]).toContain("ON CONFLICT");
  });

  it("fanOut is a no-op when APNs is not configured", async () => {
    vi.mocked(configFromEnv).mockReturnValue(null);
    const sql = vi.fn(async () => { throw new Error("SQL should not be called"); });

    await notifyAdminMessage(sql as never, {} as never, "user-1", "Hi");

    expect(sendPush).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });

  it("fanOut returns early when user has no tokens", async () => {
    vi.mocked(configFromEnv).mockReturnValue(APNS_CONFIG);
    const sql = makeSql([
      () => []
    ]);

    await notifyAdminMessage(sql as never, {} as never, "user-1", "Hi");

    expect(sendPush).not.toHaveBeenCalled();
  });

  it("fanOut sends to every token for the user with admin payload", async () => {
    vi.mocked(configFromEnv).mockReturnValue(APNS_CONFIG);
    vi.mocked(sendPush).mockResolvedValue({ ok: true });
    const sql = makeSql([
      () => [{ token: "tok-a" }, { token: "tok-b" }]
    ]);

    await notifyAdminMessage(sql as never, {} as never, "user-1", "A long message that is going to be truncated".repeat(10));

    expect(sendPush).toHaveBeenCalledTimes(2);
    const firstCall = vi.mocked(sendPush).mock.calls[0];
    expect(firstCall[1]).toBe("tok-a");
    expect(firstCall[2].alert.title).toBe("Magpie");
    expect(firstCall[2].alert.body.length).toBeLessThanOrEqual(180);
    expect(firstCall[2].customData?.type).toBe("admin_message");
  });

  it("notifyNewMatch uses match payload and partner display name", async () => {
    vi.mocked(configFromEnv).mockReturnValue(APNS_CONFIG);
    vi.mocked(sendPush).mockResolvedValue({ ok: true });
    const sql = makeSql([
      () => [{ token: "tok-a" }]
    ]);

    await notifyNewMatch(sql as never, {} as never, "user-1", "Alex");

    expect(sendPush).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendPush).mock.calls[0];
    expect(call[2].alert.title).toBe("New soulmate match");
    expect(call[2].alert.body).toContain("Alex");
    expect(call[2].customData?.type).toBe("new_match");
  });

  it("falls back to 'someone' when display name is missing", async () => {
    vi.mocked(configFromEnv).mockReturnValue(APNS_CONFIG);
    vi.mocked(sendPush).mockResolvedValue({ ok: true });
    const sql = makeSql([
      () => [{ token: "tok-a" }]
    ]);

    await notifyNewMatch(sql as never, {} as never, "user-1", null);

    expect(vi.mocked(sendPush).mock.calls[0][2].alert.body).toContain("someone");
  });

  it("prunes invalid tokens reported by APNs", async () => {
    vi.mocked(configFromEnv).mockReturnValue(APNS_CONFIG);
    vi.mocked(sendPush).mockImplementation(async (_cfg, token) => {
      if (token === "bad-tok") {
        return { ok: false, status: 410, reason: "Unregistered", tokenInvalid: true };
      }
      return { ok: true };
    });

    const deletedTokens: string[] = [];
    const sql = makeSql([
      () => [{ token: "good-tok" }, { token: "bad-tok" }],
      (_q, values) => { deletedTokens.push(values[0] as string); return []; }
    ]);

    await notifyAdminMessage(sql as never, {} as never, "user-1", "Hi");

    expect(deletedTokens).toEqual(["bad-tok"]);
  });

  it("does not prune tokens on transient APNs errors", async () => {
    vi.mocked(configFromEnv).mockReturnValue(APNS_CONFIG);
    vi.mocked(sendPush).mockResolvedValue({
      ok: false, status: 500, reason: "InternalServerError", tokenInvalid: false
    });

    const deletedTokens: string[] = [];
    const sql = makeSql([
      () => [{ token: "tok-a" }]
    ]);

    await notifyAdminMessage(sql as never, {} as never, "user-1", "Hi");

    expect(deletedTokens).toEqual([]);
  });

  it("survives a thrown fetch error and continues other tokens", async () => {
    vi.mocked(configFromEnv).mockReturnValue(APNS_CONFIG);
    vi.mocked(sendPush).mockImplementation(async (_cfg, token) => {
      if (token === "broken") throw new Error("network down");
      return { ok: true };
    });

    const sql = makeSql([
      () => [{ token: "broken" }, { token: "good" }]
    ]);

    await notifyAdminMessage(sql as never, {} as never, "user-1", "Hi");

    expect(sendPush).toHaveBeenCalledTimes(2);
  });
});
