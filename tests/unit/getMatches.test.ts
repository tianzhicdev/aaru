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
  getMatchesForUser: vi.fn(),
  getSoulmateProfile: vi.fn(),
  getSoulmatePhotoEtags: vi.fn()
}));

import { handleGetMatches } from "../../workers/src/handlers/get-matches.ts";
import { readSessionToken, hashSessionToken } from "../../workers/src/auth.ts";
import { getActiveSessionByTokenHash } from "../../workers/src/db.ts";
import {
  getMatchesForUser,
  getSoulmateProfile,
  getSoulmatePhotoEtags
} from "../../workers/src/matchApp.ts";
import type { MatchRow, SoulmateProfileRow } from "../../workers/src/matchApp.ts";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_A = "00000000-0000-4000-8000-00000000000a";
const OTHER_USER_B = "00000000-0000-4000-8000-00000000000b";

const sqlMock = vi.fn();

const mockSession = {
  id: "ds-1",
  user_id: USER_ID,
  device_id: "device-1",
  token_hash: "hash-1",
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  last_seen_at: new Date().toISOString(),
  revoked_at: null
};

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://api.test/soulmate-matches", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers }
  });
}

function makeMatchRow(overrides: Partial<MatchRow> = {}): MatchRow {
  return {
    id: "match-1",
    user_a_id: USER_ID,
    user_b_id: OTHER_USER_A,
    a_soul_version: 1,
    b_soul_version: 1,
    result: "match",
    score: 0.85,
    reasoning: "Legacy unified reasoning",
    connection_zones: ["humor", "values"],
    raw_evaluation: null,
    reasoning_a: null,
    reasoning_b: null,
    evaluated_at: "2026-04-15T12:00:00Z",
    ...overrides
  };
}

function makeProfileRow(overrides: Partial<SoulmateProfileRow> = {}): SoulmateProfileRow {
  return {
    user_id: OTHER_USER_A,
    display_name: "Luna",
    age: 28,
    gender: "female",
    latitude: 40.7,
    longitude: -73.9,
    preferred_age_min: 25,
    preferred_age_max: 35,
    preferred_genders: ["male"],
    active: true,
    selfie_url: "https://cdn.example.com/luna.jpg",
    bio: "Loves stargazing and deep talks",
    photo_count: 2,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-10T00:00:00Z",
    ...overrides
  };
}

function setupAuth() {
  vi.mocked(readSessionToken).mockReturnValue("valid-token");
  vi.mocked(hashSessionToken).mockResolvedValue("hash-1");
  vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(mockSession);
}

describe("handleGetMatches", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ── Auth ──────────────────────────────────────────────────────

  it("returns 401 when session token is missing", async () => {
    vi.mocked(readSessionToken).mockReturnValue(null);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest()
    );

    expect(res.status).toBe(401);
    expect(getMatchesForUser).not.toHaveBeenCalled();
  });

  it("returns 401 when session token is invalid", async () => {
    vi.mocked(readSessionToken).mockReturnValue("bad-token");
    vi.mocked(hashSessionToken).mockResolvedValue("bad-hash");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue(null);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "bad-token" })
    );

    expect(res.status).toBe(401);
    expect(getMatchesForUser).not.toHaveBeenCalled();
  });

  it("returns 401 when session is expired", async () => {
    vi.mocked(readSessionToken).mockReturnValue("expired-token");
    vi.mocked(hashSessionToken).mockResolvedValue("hash-expired");
    vi.mocked(getActiveSessionByTokenHash).mockResolvedValue({
      ...mockSession,
      expires_at: new Date(Date.now() - 1000).toISOString()
    });

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "expired-token" })
    );

    expect(res.status).toBe(401);
    expect(getMatchesForUser).not.toHaveBeenCalled();
  });

  // ── Happy path ────────────────────────────────────────────────

  it("returns matches with correct response shape", async () => {
    setupAuth();

    const match = makeMatchRow();
    const profile = makeProfileRow();

    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(profile);
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue(["etag1", "etag2"]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(200);
    const body = res.body as { matches: unknown[] };
    expect(body.matches).toHaveLength(1);

    const m = body.matches[0] as Record<string, unknown>;
    expect(m).toEqual({
      match_id: "match-1",
      matched_user_id: OTHER_USER_A,
      display_name: "Luna",
      selfie_url: "https://cdn.example.com/luna.jpg",
      bio: "Loves stargazing and deep talks",
      matched_at: "2026-04-15T12:00:00Z",
      reasoning: "Legacy unified reasoning",
      connection_zones: ["humor", "values"],
      score: 0.85,
      photo_count: 2,
      photo_etags: ["etag1", "etag2"]
    });
  });

  it("returns multiple matches", async () => {
    setupAuth();

    const match1 = makeMatchRow({ id: "match-1", user_b_id: OTHER_USER_A });
    const match2 = makeMatchRow({ id: "match-2", user_b_id: OTHER_USER_B });

    const profiles: Record<string, SoulmateProfileRow> = {
      [OTHER_USER_A]: makeProfileRow({ user_id: OTHER_USER_A, display_name: "Luna" }),
      [OTHER_USER_B]: makeProfileRow({ user_id: OTHER_USER_B, display_name: "Sol" })
    };

    vi.mocked(getMatchesForUser).mockResolvedValue([match1, match2]);
    vi.mocked(getSoulmateProfile).mockImplementation(
      async (_sql, userId) => profiles[userId as string] ?? null
    );
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(200);
    const body = res.body as { matches: Array<{ match_id: string; display_name: string }> };
    expect(body.matches).toHaveLength(2);
    expect(body.matches[0].display_name).toBe("Luna");
    expect(body.matches[1].display_name).toBe("Sol");
  });

  // ── Matched user ID resolution ────────────────────────────────

  it("resolves matched_user_id correctly when user is user_a", async () => {
    setupAuth();

    const match = makeMatchRow({
      user_a_id: USER_ID,
      user_b_id: OTHER_USER_A
    });

    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(makeProfileRow());
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    const body = res.body as { matches: Array<{ matched_user_id: string }> };
    expect(body.matches[0].matched_user_id).toBe(OTHER_USER_A);
    expect(getSoulmateProfile).toHaveBeenCalledWith(sqlMock, OTHER_USER_A);
  });

  it("resolves matched_user_id correctly when user is user_b", async () => {
    setupAuth();

    const match = makeMatchRow({
      user_a_id: OTHER_USER_A,
      user_b_id: USER_ID
    });

    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(
      makeProfileRow({ user_id: OTHER_USER_A })
    );
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    const body = res.body as { matches: Array<{ matched_user_id: string }> };
    expect(body.matches[0].matched_user_id).toBe(OTHER_USER_A);
    expect(getSoulmateProfile).toHaveBeenCalledWith(sqlMock, OTHER_USER_A);
  });

  // ── Per-user reasoning fallback logic ─────────────────────────

  it("uses reasoning_a when user is user_a and reasoning_a is set", async () => {
    setupAuth();

    const match = makeMatchRow({
      user_a_id: USER_ID,
      user_b_id: OTHER_USER_A,
      reasoning: "Legacy reasoning",
      reasoning_a: "Personalized reasoning for user A",
      reasoning_b: "Personalized reasoning for user B"
    });

    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(makeProfileRow());
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    const body = res.body as { matches: Array<{ reasoning: string }> };
    expect(body.matches[0].reasoning).toBe("Personalized reasoning for user A");
  });

  it("uses reasoning_b when user is user_b and reasoning_b is set", async () => {
    setupAuth();

    const match = makeMatchRow({
      user_a_id: OTHER_USER_A,
      user_b_id: USER_ID,
      reasoning: "Legacy reasoning",
      reasoning_a: "Personalized reasoning for user A",
      reasoning_b: "Personalized reasoning for user B"
    });

    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(
      makeProfileRow({ user_id: OTHER_USER_A })
    );
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    const body = res.body as { matches: Array<{ reasoning: string }> };
    expect(body.matches[0].reasoning).toBe("Personalized reasoning for user B");
  });

  it("falls back to legacy reasoning when reasoning_a is null (user is user_a)", async () => {
    setupAuth();

    const match = makeMatchRow({
      user_a_id: USER_ID,
      user_b_id: OTHER_USER_A,
      reasoning: "Legacy unified reasoning",
      reasoning_a: null,
      reasoning_b: "Personalized for B"
    });

    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(makeProfileRow());
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    const body = res.body as { matches: Array<{ reasoning: string }> };
    expect(body.matches[0].reasoning).toBe("Legacy unified reasoning");
  });

  it("falls back to legacy reasoning when reasoning_b is null (user is user_b)", async () => {
    setupAuth();

    const match = makeMatchRow({
      user_a_id: OTHER_USER_A,
      user_b_id: USER_ID,
      reasoning: "Legacy unified reasoning",
      reasoning_a: "Personalized for A",
      reasoning_b: null
    });

    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(
      makeProfileRow({ user_id: OTHER_USER_A })
    );
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    const body = res.body as { matches: Array<{ reasoning: string }> };
    expect(body.matches[0].reasoning).toBe("Legacy unified reasoning");
  });

  it("returns null reasoning when both per-user and legacy reasoning are null", async () => {
    setupAuth();

    const match = makeMatchRow({
      reasoning: null,
      reasoning_a: null,
      reasoning_b: null
    });

    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(makeProfileRow());
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    const body = res.body as { matches: Array<{ reasoning: string | null }> };
    expect(body.matches[0].reasoning).toBeNull();
  });

  // ── Filter out matches with no display_name ───────────────────

  it("filters out matches where the matched user has no display_name", async () => {
    setupAuth();

    const match = makeMatchRow();

    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(
      makeProfileRow({ display_name: null })
    );
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(200);
    const body = res.body as { matches: unknown[] };
    expect(body.matches).toHaveLength(0);
  });

  it("filters out matches where the matched user has no profile", async () => {
    setupAuth();

    const match = makeMatchRow();

    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(null);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(200);
    const body = res.body as { matches: unknown[] };
    expect(body.matches).toHaveLength(0);
    // photo etags should not be fetched for filtered matches
    expect(getSoulmatePhotoEtags).not.toHaveBeenCalled();
  });

  it("keeps matches with display_name while filtering out those without", async () => {
    setupAuth();

    const match1 = makeMatchRow({ id: "match-1", user_b_id: OTHER_USER_A });
    const match2 = makeMatchRow({ id: "match-2", user_b_id: OTHER_USER_B });

    const profiles: Record<string, SoulmateProfileRow | null> = {
      [OTHER_USER_A]: makeProfileRow({ user_id: OTHER_USER_A, display_name: "Luna" }),
      [OTHER_USER_B]: makeProfileRow({ user_id: OTHER_USER_B, display_name: null })
    };

    vi.mocked(getMatchesForUser).mockResolvedValue([match1, match2]);
    vi.mocked(getSoulmateProfile).mockImplementation(
      async (_sql, userId) => profiles[userId as string] ?? null
    );
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    const body = res.body as { matches: Array<{ display_name: string }> };
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0].display_name).toBe("Luna");
  });

  // ── photo_etags enrichment ────────────────────────────────────

  it("enriches matches with photo_etags from getSoulmatePhotoEtags", async () => {
    setupAuth();

    const match = makeMatchRow();
    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(makeProfileRow());
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue(["abc123", "def456", "ghi789"]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    const body = res.body as { matches: Array<{ photo_etags: string[] }> };
    expect(body.matches[0].photo_etags).toEqual(["abc123", "def456", "ghi789"]);
    expect(getSoulmatePhotoEtags).toHaveBeenCalledWith(sqlMock, OTHER_USER_A);
  });

  it("returns empty photo_etags array when user has no photos", async () => {
    setupAuth();

    const match = makeMatchRow();
    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(makeProfileRow({ photo_count: 0 }));
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    const body = res.body as { matches: Array<{ photo_etags: string[] }> };
    expect(body.matches[0].photo_etags).toEqual([]);
  });

  // ── Optional/nullable fields ──────────────────────────────────

  it("returns null for selfie_url and bio when profile has none", async () => {
    setupAuth();

    const match = makeMatchRow();
    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(
      makeProfileRow({ selfie_url: null, bio: null })
    );
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    const body = res.body as { matches: Array<{ selfie_url: string | null; bio: string | null }> };
    expect(body.matches[0].selfie_url).toBeNull();
    expect(body.matches[0].bio).toBeNull();
  });

  it("returns null for connection_zones and score when not present", async () => {
    setupAuth();

    const match = makeMatchRow({ connection_zones: null, score: null });
    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(makeProfileRow());
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    const body = res.body as {
      matches: Array<{ connection_zones: string[] | null; score: number | null }>
    };
    expect(body.matches[0].connection_zones).toBeNull();
    expect(body.matches[0].score).toBeNull();
  });

  it("defaults photo_count to 0 when profile has undefined photo_count", async () => {
    setupAuth();

    const match = makeMatchRow();
    const profile = makeProfileRow();
    // Simulate a profile where photo_count might be undefined from older data
    (profile as unknown as Record<string, unknown>).photo_count = undefined;

    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(profile);
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    const body = res.body as { matches: Array<{ photo_count: number }> };
    expect(body.matches[0].photo_count).toBe(0);
  });

  // ── Empty matches ─────────────────────────────────────────────

  it("returns empty matches array when user has no matches", async () => {
    setupAuth();

    vi.mocked(getMatchesForUser).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    expect(res.status).toBe(200);
    const body = res.body as { matches: unknown[] };
    expect(body.matches).toEqual([]);
    expect(getSoulmateProfile).not.toHaveBeenCalled();
    expect(getSoulmatePhotoEtags).not.toHaveBeenCalled();
  });

  // ── Error handling ────────────────────────────────────────────

  it("propagates photo_etags error (no graceful swallow)", async () => {
    setupAuth();

    const match = makeMatchRow();
    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(makeProfileRow());
    vi.mocked(getSoulmatePhotoEtags).mockRejectedValue(
      new Error("DB connection lost")
    );

    await expect(
      handleGetMatches(
        sqlMock as never,
        {},
        makeRequest({ "x-thumos-session": "valid-token" })
      )
    ).rejects.toThrow("DB connection lost");
  });

  // ── Auth does not touch session ───────────────────────────────

  it("does not touch the device session (touch: false)", async () => {
    setupAuth();

    vi.mocked(getMatchesForUser).mockResolvedValue([]);

    await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    // requireDeviceSession is called with { touch: false },
    // so touchDeviceSession from db.ts should not be called
    const { touchDeviceSession } = await import("../../workers/src/db.ts");
    expect(touchDeviceSession).not.toHaveBeenCalled();
  });

  // ── matched_at uses evaluated_at ──────────────────────────────

  it("maps evaluated_at to matched_at in the response", async () => {
    setupAuth();

    const match = makeMatchRow({ evaluated_at: "2026-04-20T18:30:00Z" });
    vi.mocked(getMatchesForUser).mockResolvedValue([match]);
    vi.mocked(getSoulmateProfile).mockResolvedValue(makeProfileRow());
    vi.mocked(getSoulmatePhotoEtags).mockResolvedValue([]);

    const res = await handleGetMatches(
      sqlMock as never,
      {},
      makeRequest({ "x-thumos-session": "valid-token" })
    );

    const body = res.body as { matches: Array<{ matched_at: string }> };
    expect(body.matches[0].matched_at).toBe("2026-04-20T18:30:00Z");
  });
});
