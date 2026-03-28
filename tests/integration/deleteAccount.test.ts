import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../supabase/functions/_shared/db.ts", () => ({
  getActiveSessionByTokenHash: vi.fn()
}));

vi.mock("../../supabase/functions/_shared/auth.ts", () => ({
  readBearerToken: vi.fn(),
  hashSessionToken: vi.fn()
}));

vi.mock("../../supabase/functions/_shared/env.ts", () => ({
  supabaseUrl: vi.fn(() => "https://test.supabase.co"),
  supabaseServiceRoleKey: vi.fn(() => "test-service-key"),
  thumosSessionSecret: vi.fn(() => "test-secret")
}));

import { handleDeleteAccount } from "../../supabase/functions/delete-account/index.ts";
import { readBearerToken, hashSessionToken } from "../../supabase/functions/_shared/auth.ts";
import { getActiveSessionByTokenHash } from "../../supabase/functions/_shared/db.ts";

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
  return new Request("https://edge.supabase.co/delete-account", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers }
  });
}

describe("handleDeleteAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns 401 without bearer token", async () => {
    vi.mocked(readBearerToken).mockReturnValue(null);

    const request = makeRequest();
    const response = await handleDeleteAccount({}, request);

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("message", "Missing device session");
  });

  it("returns 401 for expired session", async () => {
    vi.mocked(readBearerToken).mockReturnValue("expired-token");
    vi.mocked(hashSessionToken).mockResolvedValue("expired-hash");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue({
      ...mockDeviceSession,
      expires_at: new Date(Date.now() - 1000).toISOString()
    });

    const request = makeRequest({ "x-thumos-session": "expired-token" });
    const response = await handleDeleteAccount({}, request);

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("message", "Invalid device session");
  });

  it("deletes user and returns success", async () => {
    vi.mocked(readBearerToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockDeviceSession);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const request = makeRequest({ "x-thumos-session": "valid-token" });
    const response = await handleDeleteAccount({}, request);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("deleted", true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("users?id=eq.user-1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
