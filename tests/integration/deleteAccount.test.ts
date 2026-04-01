import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../workers/src/db.ts", () => ({
  getActiveSessionByTokenHash: vi.fn(),
  deleteUser: vi.fn(),
  createSQL: vi.fn()
}));

vi.mock("../../workers/src/auth.ts", () => ({
  readSessionToken: vi.fn(),
  hashSessionToken: vi.fn()
}));

import { handleDeleteAccount } from "../../workers/src/handlers/delete-account.ts";
import { readSessionToken, hashSessionToken } from "../../workers/src/auth.ts";
import { getActiveSessionByTokenHash, deleteUser } from "../../workers/src/db.ts";

const mockSQL = vi.fn();

const mockDeviceSession = {
  id: "ds-1",
  user_id: "user-1",
  device_id: "device-1",
  token_hash: "hash-1",
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  last_seen_at: new Date().toISOString(),
  revoked_at: null
};

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://api.trythumos.com/delete-account", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers }
  });
}

describe("handleDeleteAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without bearer token", async () => {
    vi.mocked(readSessionToken).mockReturnValue(null);

    const request = makeRequest();
    const response = await handleDeleteAccount(mockSQL, {}, request);

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("message", "Missing device session");
  });

  it("returns 401 for expired session", async () => {
    vi.mocked(readSessionToken).mockReturnValue("expired-token");
    vi.mocked(hashSessionToken).mockResolvedValue("expired-hash");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue({
      ...mockDeviceSession,
      expires_at: new Date(Date.now() - 1000).toISOString()
    });

    const request = makeRequest({ "x-thumos-session": "expired-token" });
    const response = await handleDeleteAccount(mockSQL, {}, request);

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("message", "Invalid device session");
  });

  it("deletes user and returns success", async () => {
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(deleteUser).mockResolvedValue(undefined);

    const request = makeRequest({ "x-thumos-session": "valid-token" });
    const response = await handleDeleteAccount(mockSQL, {}, request);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("deleted", true);
    expect(deleteUser).toHaveBeenCalledWith(mockSQL, "user-1");
  });
});
