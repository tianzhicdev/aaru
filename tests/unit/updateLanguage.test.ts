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
    touchDeviceSession: vi.fn().mockResolvedValue(undefined),
    getUserModelProfileId: vi.fn(),
    updateUserLanguage: vi.fn(),
    updateUserModelProfileId: vi.fn()
  };
});

import { handleUpdateLanguage } from "../../workers/src/handlers/update-language.ts";
import { readSessionToken, hashSessionToken } from "../../workers/src/auth.ts";
import {
  getActiveSessionByTokenHash,
  getUserModelProfileId,
  updateUserLanguage,
  updateUserModelProfileId
} from "../../workers/src/db.ts";

const sqlMock = vi.fn();

const mockSession = {
  id: "ds-1",
  user_id: "user-1",
  device_id: "device-1",
  token_hash: "hash-1",
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  last_seen_at: new Date().toISOString(),
  revoked_at: null
};

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://api.test/update-language", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers }
  });
}

describe("handleUpdateLanguage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockSession);
  });

  it("returns 401 without a session token", async () => {
    vi.mocked(readSessionToken).mockReturnValue(null);

    const res = await handleUpdateLanguage(
      sqlMock as never,
      { language: "en" },
      makeRequest()
    );

    expect(res.status).toBe(401);
    expect(updateUserLanguage).not.toHaveBeenCalled();
  });

  it("returns 400 for an unsupported language", async () => {
    vi.mocked(updateUserLanguage).mockResolvedValue("en");

    const res = await handleUpdateLanguage(
      sqlMock as never,
      { language: "klingon" },
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(400);
    const body = res.body as { message: string };
    expect(body.message).toContain("Unsupported language");
    expect(updateUserLanguage).not.toHaveBeenCalled();
  });

  it("throws on empty language (Zod validation)", async () => {
    await expect(
      handleUpdateLanguage(
        sqlMock as never,
        { language: "" },
        makeRequest({ "x-thumos-session": "valid-token" })
      )
    ).rejects.toThrow();
  });

  it("updates language and auto-derives model profile for non-frontier user", async () => {
    vi.mocked(updateUserLanguage).mockResolvedValue("ja");
    vi.mocked(getUserModelProfileId).mockResolvedValue("value_default");
    vi.mocked(updateUserModelProfileId).mockResolvedValue("value_cjk");

    const res = await handleUpdateLanguage(
      sqlMock as never,
      { language: "ja" },
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(200);
    expect(updateUserLanguage).toHaveBeenCalledWith(sqlMock, "user-1", "ja");
    // ja is CJK, so profile should switch from value_default to value_cjk
    expect(getUserModelProfileId).toHaveBeenCalledWith(sqlMock, "user-1");
    expect(updateUserModelProfileId).toHaveBeenCalledWith(sqlMock, "user-1", "value_cjk");
  });

  it("updates language but skips model profile change for frontier user", async () => {
    vi.mocked(updateUserLanguage).mockResolvedValue("zh-CN");
    vi.mocked(getUserModelProfileId).mockResolvedValue("frontier");

    const res = await handleUpdateLanguage(
      sqlMock as never,
      { language: "zh-CN" },
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(200);
    expect(updateUserLanguage).toHaveBeenCalledWith(sqlMock, "user-1", "zh-CN");
    expect(getUserModelProfileId).toHaveBeenCalledWith(sqlMock, "user-1");
    // Frontier users keep their profile — no updateUserModelProfileId call
    expect(updateUserModelProfileId).not.toHaveBeenCalled();
  });

  it("skips model profile update when derived profile matches current", async () => {
    vi.mocked(updateUserLanguage).mockResolvedValue("en");
    vi.mocked(getUserModelProfileId).mockResolvedValue("value_default");

    const res = await handleUpdateLanguage(
      sqlMock as never,
      { language: "en" },
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(200);
    // en derives to value_default, which is already the current profile
    expect(updateUserModelProfileId).not.toHaveBeenCalled();
  });

  it("switches from CJK to default when language changes to non-CJK", async () => {
    vi.mocked(updateUserLanguage).mockResolvedValue("fr");
    vi.mocked(getUserModelProfileId).mockResolvedValue("value_cjk");
    vi.mocked(updateUserModelProfileId).mockResolvedValue("value_default");

    const res = await handleUpdateLanguage(
      sqlMock as never,
      { language: "fr" },
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(200);
    expect(updateUserModelProfileId).toHaveBeenCalledWith(sqlMock, "user-1", "value_default");
  });

  it("returns the expected response shape", async () => {
    vi.mocked(updateUserLanguage).mockResolvedValue("ko");
    vi.mocked(getUserModelProfileId).mockResolvedValue("value_default");
    vi.mocked(updateUserModelProfileId).mockResolvedValue("value_cjk");

    const res = await handleUpdateLanguage(
      sqlMock as never,
      { language: "ko" },
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user_id: "user-1",
      language: "ko"
    });
  });
});
