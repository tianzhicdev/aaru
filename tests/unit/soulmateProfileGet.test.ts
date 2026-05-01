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

vi.mock("../../workers/src/matchApp.ts", () => ({
  getSoulmateProfile: vi.fn(),
  getSoulmatePhotoEtags: vi.fn()
}));

import { handleGetSoulmateProfile } from "../../workers/src/handlers/soulmate-profile.ts";
import { readSessionToken, hashSessionToken } from "../../workers/src/auth.ts";
import { getActiveSessionByTokenHash } from "../../workers/src/db.ts";
import {
  getSoulmateProfile,
  getSoulmatePhotoEtags
} from "../../workers/src/matchApp.ts";

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
  return new Request("https://api.test/soulmate-profile", {
    method: "GET",
    headers: { "content-type": "application/json", ...headers }
  });
}

describe("GET /soulmate-profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionToken).mockReturnValue("valid-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockSession);
  });

  it("returns 401 without a session token", async () => {
    vi.mocked(readSessionToken).mockReturnValue(null);

    const res = await handleGetSoulmateProfile(
      sqlMock as never,
      undefined,
      makeRequest()
    );

    expect(res.status).toBe(401);
    expect(getSoulmateProfile).not.toHaveBeenCalled();
  });

  it("returns 401 with an expired session", async () => {
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue({
      ...mockSession,
      expires_at: new Date(Date.now() - 1000).toISOString()
    });

    const res = await handleGetSoulmateProfile(
      sqlMock as never,
      undefined,
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(401);
    expect(getSoulmateProfile).not.toHaveBeenCalled();
  });

  it("returns null profile when no profile exists", async () => {
    vi.mocked(getSoulmateProfile).mockResolvedValue(null);

    const res = await handleGetSoulmateProfile(
      sqlMock as never,
      undefined,
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ soulmate_profile: null });
    expect(getSoulmatePhotoEtags).not.toHaveBeenCalled();
  });

  it("returns profile with photos including photo_etags, bio, and photo_count", async () => {
    vi.mocked(getSoulmateProfile).mockResolvedValue({
      user_id: "user-1",
      display_name: "Alex",
      age: 30,
      gender: "male",
      latitude: 37.7749,
      longitude: -122.4194,
      preferred_age_min: 25,
      preferred_age_max: 40,
      preferred_genders: ["female"],
      active: true,
      selfie_url: null,
      bio: "Coffee enthusiast and bookworm",
      photo_count: 2,
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-15T00:00:00Z"
    });
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue(["aabb11223344", "ccdd55667788"]);

    const res = await handleGetSoulmateProfile(
      sqlMock as never,
      undefined,
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(200);
    const profile = (res.body as { soulmate_profile: Record<string, unknown> }).soulmate_profile;
    expect(profile.display_name).toBe("Alex");
    expect(profile.bio).toBe("Coffee enthusiast and bookworm");
    expect(profile.photo_count).toBe(2);
    expect(profile.photo_etags).toEqual(["aabb11223344", "ccdd55667788"]);
    expect(profile.age).toBe(30);
    expect(profile.gender).toBe("male");
  });

  it("returns empty etags and zero photo_count when profile has no photos", async () => {
    vi.mocked(getSoulmateProfile).mockResolvedValue({
      user_id: "user-1",
      display_name: "Jordan",
      age: 25,
      gender: "non_binary",
      latitude: 40.7128,
      longitude: -74.006,
      preferred_age_min: 22,
      preferred_age_max: 35,
      preferred_genders: ["male", "female"],
      active: true,
      selfie_url: null,
      bio: null,
      photo_count: 0,
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-15T00:00:00Z"
    });
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetSoulmateProfile(
      sqlMock as never,
      undefined,
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(200);
    const profile = (res.body as { soulmate_profile: Record<string, unknown> }).soulmate_profile;
    expect(profile.display_name).toBe("Jordan");
    expect(profile.bio).toBeNull();
    expect(profile.photo_count).toBe(0);
    expect(profile.photo_etags).toEqual([]);
  });

  it("normalizes null bio and undefined photo_count from DB row", async () => {
    vi.mocked(getSoulmateProfile).mockResolvedValue({
      user_id: "user-1",
      display_name: "Morgan",
      age: 28,
      gender: "female",
      latitude: 51.5074,
      longitude: -0.1278,
      preferred_age_min: 26,
      preferred_age_max: 38,
      preferred_genders: ["male"],
      active: true,
      selfie_url: null,
      bio: undefined as unknown as null,
      photo_count: undefined as unknown as number,
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-15T00:00:00Z"
    });
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetSoulmateProfile(
      sqlMock as never,
      undefined,
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(200);
    const profile = (res.body as { soulmate_profile: Record<string, unknown> }).soulmate_profile;
    // Handler normalizes: bio ?? null, photo_count ?? 0
    expect(profile.bio).toBeNull();
    expect(profile.photo_count).toBe(0);
  });
});
