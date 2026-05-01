import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../workers/src/auth.ts", () => ({
  readSessionToken: vi.fn(),
  hashSessionToken: vi.fn()
}));

vi.mock("../../workers/src/db.ts", () => ({
  getActiveSessionByTokenHash: vi.fn(),
  touchDeviceSession: vi.fn()
}));

vi.mock("../../workers/src/matchApp.ts", () => ({
  getMatchedUserIds: vi.fn(),
  getSoulmatePhoto: vi.fn(),
  getSoulmatePhotoEtags: vi.fn(),
  getSoulmateProfile: vi.fn(),
  upsertSoulmatePhotos: vi.fn(),
  upsertSoulmateProfile: vi.fn()
}));

import { handlePostSoulmateProfile } from "../../workers/src/handlers/soulmate-profile.ts";
import { handleGetSoulmatePhoto } from "../../workers/src/handlers/soulmate-photo.ts";
import { readSessionToken, hashSessionToken } from "../../workers/src/auth.ts";
import { getActiveSessionByTokenHash } from "../../workers/src/db.ts";
import {
  getMatchedUserIds,
  getSoulmatePhoto,
  getSoulmatePhotoEtags,
  upsertSoulmatePhotos,
  upsertSoulmateProfile
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

function authedRequest(method: "GET" | "POST", url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-thumos-session": "valid-token"
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

function jpegBase64(extraBytes = 8): string {
  const arr = new Uint8Array(3 + extraBytes);
  arr[0] = 0xff; arr[1] = 0xd8; arr[2] = 0xff;
  for (let i = 3; i < arr.length; i++) arr[i] = i & 0xff;
  let binary = "";
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readSessionToken).mockReturnValue("valid-token");
  vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
  vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockSession);
});

describe("POST /soulmate-profile photo + bio validation", () => {
  const baseValidBody = {
    display_name: "Sam",
    age: 28,
    gender: "non_binary",
    latitude: 40,
    longitude: -73,
    preferred_age_min: 25,
    preferred_age_max: 35,
    preferred_genders: ["male", "female"]
  };

  it("rejects bio over 200 chars", async () => {
    const res = await handlePostSoulmateProfile(
      sqlMock as never,
      { ...baseValidBody, bio: "x".repeat(201) },
      authedRequest("POST", "https://api/soulmate-profile")
    );
    expect(res.status).toBe(400);
  });

  it("rejects more than 3 photos", async () => {
    const res = await handlePostSoulmateProfile(
      sqlMock as never,
      { ...baseValidBody, photos: [jpegBase64(), jpegBase64(), jpegBase64(), jpegBase64()] },
      authedRequest("POST", "https://api/soulmate-profile")
    );
    expect(res.status).toBe(400);
  });

  it("rejects non-JPEG bytes", async () => {
    const notJpeg = btoa("\x89PNG\r\n\x1a\nfoobar");
    const res = await handlePostSoulmateProfile(
      sqlMock as never,
      { ...baseValidBody, photos: [notJpeg] },
      authedRequest("POST", "https://api/soulmate-profile")
    );
    expect(res.status).toBe(400);
  });

  it("accepts valid bio + photos and persists them", async () => {
    vi.mocked(upsertSoulmateProfile).mockResolvedValue({
      user_id: "user-1",
      display_name: "Sam",
      age: 28,
      gender: "non_binary",
      latitude: 40,
      longitude: -73,
      preferred_age_min: 25,
      preferred_age_max: 35,
      preferred_genders: ["male", "female"],
      active: true,
      created_at: "2026-04-30T00:00:00Z",
      updated_at: "2026-04-30T00:00:00Z",
      bio: "loves dancing in the kitchen",
      photo_count: 0
    } as never);
    vi.mocked(upsertSoulmatePhotos).mockResolvedValue({ etags: ["aabbccddeeff", "001122334455"] });

    const res = await handlePostSoulmateProfile(
      sqlMock as never,
      {
        ...baseValidBody,
        bio: "loves dancing in the kitchen",
        photos: [jpegBase64(), jpegBase64(20)]
      },
      authedRequest("POST", "https://api/soulmate-profile")
    );

    expect(res.status).toBe(200);
    expect(upsertSoulmatePhotos).toHaveBeenCalledTimes(1);
    const body = res.body as { soulmate_profile: { photo_count: number; photo_etags: string[]; bio: string | null } };
    expect(body.soulmate_profile.photo_count).toBe(2);
    expect(body.soulmate_profile.photo_etags).toEqual(["aabbccddeeff", "001122334455"]);
    expect(body.soulmate_profile.bio).toBe("loves dancing in the kitchen");
  });

  it("does not touch photos when payload omits them", async () => {
    vi.mocked(upsertSoulmateProfile).mockResolvedValue({
      user_id: "user-1",
      display_name: "Sam",
      age: 28,
      gender: "non_binary",
      latitude: 40,
      longitude: -73,
      preferred_age_min: 25,
      preferred_age_max: 35,
      preferred_genders: ["male", "female"],
      active: true,
      created_at: "2026-04-30T00:00:00Z",
      updated_at: "2026-04-30T00:00:00Z",
      bio: null,
      photo_count: 1
    } as never);
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue(["existingaaa1"]);

    const res = await handlePostSoulmateProfile(
      sqlMock as never,
      baseValidBody,
      authedRequest("POST", "https://api/soulmate-profile")
    );

    expect(res.status).toBe(200);
    expect(upsertSoulmatePhotos).not.toHaveBeenCalled();
    const body = res.body as { soulmate_profile: { photo_count: number; photo_etags: string[] } };
    expect(body.soulmate_profile.photo_count).toBe(1);
    expect(body.soulmate_profile.photo_etags).toEqual(["existingaaa1"]);
  });
});

describe("GET /soulmate-photo", () => {
  const photoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

  it("returns 200 with bytes for the owner", async () => {
    vi.mocked(getSoulmatePhoto).mockResolvedValue({
      data: photoBytes,
      mime_type: "image/jpeg",
      etag: "aabbccddeeff"
    });

    const res = await handleGetSoulmatePhoto(
      sqlMock as never,
      authedRequest("GET", "https://api/soulmate-photo?user_id=user-1&idx=0")
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("ETag")).toBe('"aabbccddeeff"');
  });

  it("returns 304 when If-None-Match matches", async () => {
    vi.mocked(getSoulmatePhoto).mockResolvedValue({
      data: photoBytes,
      mime_type: "image/jpeg",
      etag: "aabbccddeeff"
    });

    const req = new Request("https://api/soulmate-photo?user_id=user-1&idx=0", {
      method: "GET",
      headers: {
        "x-thumos-session": "valid-token",
        "If-None-Match": '"aabbccddeeff"'
      }
    });

    const res = await handleGetSoulmatePhoto(sqlMock as never, req);
    expect(res.status).toBe(304);
  });

  it("returns 200 for a matched user", async () => {
    vi.mocked(getMatchedUserIds).mockResolvedValue(["user-2"]);
    vi.mocked(getSoulmatePhoto).mockResolvedValue({
      data: photoBytes,
      mime_type: "image/jpeg",
      etag: "aabbccddeeff"
    });

    const res = await handleGetSoulmatePhoto(
      sqlMock as never,
      authedRequest("GET", "https://api/soulmate-photo?user_id=user-2&idx=0")
    );
    expect(res.status).toBe(200);
  });

  it("returns 403 for an unmatched user", async () => {
    vi.mocked(getMatchedUserIds).mockResolvedValue([]);
    const res = await handleGetSoulmatePhoto(
      sqlMock as never,
      authedRequest("GET", "https://api/soulmate-photo?user_id=stranger&idx=0")
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when the photo is missing", async () => {
    vi.mocked(getSoulmatePhoto).mockResolvedValue(null);
    const res = await handleGetSoulmatePhoto(
      sqlMock as never,
      authedRequest("GET", "https://api/soulmate-photo?user_id=user-1&idx=2")
    );
    expect(res.status).toBe(404);
  });

  it("rejects invalid idx", async () => {
    const res = await handleGetSoulmatePhoto(
      sqlMock as never,
      authedRequest("GET", "https://api/soulmate-photo?user_id=user-1&idx=9")
    );
    expect(res.status).toBe(400);
  });
});
