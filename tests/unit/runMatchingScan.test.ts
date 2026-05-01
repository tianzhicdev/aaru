import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../workers/src/requestAuth.ts", () => ({
  requireDeviceSession: vi.fn()
}));

vi.mock("../../workers/src/matchApp.ts", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../workers/src/matchApp.ts");
  return {
    ...actual,
    getSoulmateProfile: vi.fn()
  };
});

vi.mock("../../workers/src/backgroundJobsQueue.ts", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../workers/src/backgroundJobsQueue.ts");
  return {
    ...actual,
    enqueueMatchingScanUser: vi.fn().mockResolvedValue({ kind: "matching_scan_user", jobId: "job-1" })
  };
});

import { handleRunMatchingScan } from "../../workers/src/handlers/run-matching-scan.ts";
import { requireDeviceSession } from "../../workers/src/requestAuth.ts";
import { getSoulmateProfile } from "../../workers/src/matchApp.ts";
import { enqueueMatchingScanUser } from "../../workers/src/backgroundJobsQueue.ts";
import {
  ELIGIBILITY_MIN_USER_MESSAGES,
  ELIGIBILITY_MIN_COMPLETENESS
} from "../../workers/src/matchingPipeline.ts";
import type { Env } from "../../workers/src/env.ts";

const USER_ID = "00000000-0000-4000-8000-000000000001";

const validSession = {
  id: "ds-1",
  user_id: USER_ID,
  device_id: "device-1",
  token_hash: "hash-1",
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  last_seen_at: new Date().toISOString(),
  revoked_at: null
};

function makeRequest(): Request {
  return new Request("https://api.test/run-matching-scan", {
    method: "POST",
    headers: { "content-type": "application/json" }
  });
}

const mockQueue = { send: vi.fn().mockResolvedValue(undefined) };

function makeEnv(): Env {
  return { BACKGROUND_QUEUE: mockQueue } as unknown as Env;
}

function activeProfile(overrides: Record<string, unknown> = {}) {
  return {
    user_id: USER_ID,
    display_name: "Alice",
    age: 28,
    gender: "female",
    latitude: 40.7,
    longitude: -74.0,
    preferred_age_min: 25,
    preferred_age_max: 35,
    preferred_genders: ["male"],
    active: true,
    selfie_url: null,
    bio: null,
    photo_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Build a mock sql tagged-template function that returns specific results
 * based on the query pattern. The handler runs two inline SQL queries:
 *   1. SELECT COUNT(*) ... FROM soul_messages (message count)
 *   2. SELECT completeness FROM visible_soul_files (completeness)
 */
function makeSql(opts: { messageCount?: number; completeness?: number | null } = {}) {
  const { messageCount = ELIGIBILITY_MIN_USER_MESSAGES, completeness = ELIGIBILITY_MIN_COMPLETENESS } = opts;

  return vi.fn(async (strings: TemplateStringsArray) => {
    const query = strings.join("?").trim();

    if (query.includes("COUNT(*)") && query.includes("soul_messages")) {
      return [{ count: String(messageCount) }];
    }

    if (query.includes("completeness") && query.includes("visible_soul_files")) {
      if (completeness === null) return [];
      return [{ completeness }];
    }

    throw new Error(`Unexpected SQL query: ${query}`);
  });
}

describe("handleRunMatchingScan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated session
    vi.mocked(requireDeviceSession).mockResolvedValue({ ok: true, session: validSession } as never);
    // Default: active soulmate profile
    vi.mocked(getSoulmateProfile).mockResolvedValue(activeProfile());
  });

  // ── Threshold constants ────────────────────────────────────────
  it("requires at least 30 user messages", () => {
    expect(ELIGIBILITY_MIN_USER_MESSAGES).toBe(30);
  });

  it("requires at least 80% completeness", () => {
    expect(ELIGIBILITY_MIN_COMPLETENESS).toBe(0.80);
  });

  // ── Auth ───────────────────────────────────────────────────────
  it("returns 401 without a valid session", async () => {
    vi.mocked(requireDeviceSession).mockResolvedValue({
      ok: false,
      error: { status: 401, body: { code: 401, message: "Missing device session" } }
    } as never);

    const res = await handleRunMatchingScan(
      vi.fn() as never, makeEnv(), {}, makeRequest()
    );
    expect(res.status).toBe(401);
    expect(getSoulmateProfile).not.toHaveBeenCalled();
    expect(enqueueMatchingScanUser).not.toHaveBeenCalled();
  });

  // ── No active soulmate profile ─────────────────────────────────
  it("returns not_eligible when no soulmate profile exists", async () => {
    vi.mocked(getSoulmateProfile).mockResolvedValue(null);

    const res = await handleRunMatchingScan(
      vi.fn() as never, makeEnv(), {}, makeRequest()
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "not_eligible",
      reason: "No active soulmate profile"
    });
    expect(enqueueMatchingScanUser).not.toHaveBeenCalled();
  });

  it("returns not_eligible when profile exists but is inactive", async () => {
    vi.mocked(getSoulmateProfile).mockResolvedValue(activeProfile({ active: false }));

    const res = await handleRunMatchingScan(
      vi.fn() as never, makeEnv(), {}, makeRequest()
    );
    expect(res.status).toBe(200);
    const body = res.body as { status: string; reason?: string };
    expect(body.status).toBe("not_eligible");
    expect(body.reason).toContain("No active soulmate profile");
  });

  it("returns not_eligible when profile has no display_name", async () => {
    vi.mocked(getSoulmateProfile).mockResolvedValue(activeProfile({ display_name: null }));

    const res = await handleRunMatchingScan(
      vi.fn() as never, makeEnv(), {}, makeRequest()
    );
    expect(res.status).toBe(200);
    const body = res.body as { status: string; reason?: string };
    expect(body.status).toBe("not_eligible");
    expect(body.reason).toContain("No active soulmate profile");
  });

  // ── Insufficient message count ─────────────────────────────────
  it("returns not_eligible when user has fewer than ELIGIBILITY_MIN_USER_MESSAGES", async () => {
    const sql = makeSql({ messageCount: ELIGIBILITY_MIN_USER_MESSAGES - 1 });

    const res = await handleRunMatchingScan(
      sql as never, makeEnv(), {}, makeRequest()
    );
    expect(res.status).toBe(200);
    const body = res.body as { status: string; reason?: string };
    expect(body.status).toBe("not_eligible");
    expect(body.reason).toContain(`Need at least ${ELIGIBILITY_MIN_USER_MESSAGES} messages`);
    expect(body.reason).toContain(`you have ${ELIGIBILITY_MIN_USER_MESSAGES - 1}`);
    expect(enqueueMatchingScanUser).not.toHaveBeenCalled();
  });

  it("returns not_eligible when user has zero messages", async () => {
    const sql = makeSql({ messageCount: 0 });

    const res = await handleRunMatchingScan(
      sql as never, makeEnv(), {}, makeRequest()
    );
    expect(res.status).toBe(200);
    const body = res.body as { status: string; reason?: string };
    expect(body.status).toBe("not_eligible");
    expect(body.reason).toContain("you have 0");
  });

  // ── Insufficient completeness ──────────────────────────────────
  it("returns not_eligible when completeness is below threshold", async () => {
    const sql = makeSql({ completeness: 0.50 });

    const res = await handleRunMatchingScan(
      sql as never, makeEnv(), {}, makeRequest()
    );
    expect(res.status).toBe(200);
    const body = res.body as { status: string; reason?: string };
    expect(body.status).toBe("not_eligible");
    expect(body.reason).toContain("50%");
    expect(body.reason).toContain(`${Math.round(ELIGIBILITY_MIN_COMPLETENESS * 100)}%`);
    expect(enqueueMatchingScanUser).not.toHaveBeenCalled();
  });

  it("returns not_eligible when no visible soul file exists", async () => {
    const sql = makeSql({ completeness: null });

    const res = await handleRunMatchingScan(
      sql as never, makeEnv(), {}, makeRequest()
    );
    expect(res.status).toBe(200);
    const body = res.body as { status: string; reason?: string };
    expect(body.status).toBe("not_eligible");
    // completeness defaults to 0 when no rows, so reason should mention 0%
    expect(body.reason).toContain("0%");
  });

  // ── Happy path ─────────────────────────────────────────────────
  it("enqueues scan and returns 'scanning' when all criteria met", async () => {
    const env = makeEnv();
    const sql = makeSql({
      messageCount: ELIGIBILITY_MIN_USER_MESSAGES,
      completeness: ELIGIBILITY_MIN_COMPLETENESS
    });

    const res = await handleRunMatchingScan(
      sql as never, env, {}, makeRequest()
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "scanning" });
    expect(enqueueMatchingScanUser).toHaveBeenCalledWith(env.BACKGROUND_QUEUE, USER_ID);
  });

  it("enqueues scan when criteria exceed minimums", async () => {
    const env = makeEnv();
    const sql = makeSql({
      messageCount: ELIGIBILITY_MIN_USER_MESSAGES + 50,
      completeness: 1.0
    });

    const res = await handleRunMatchingScan(
      sql as never, env, {}, makeRequest()
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "scanning" });
    expect(enqueueMatchingScanUser).toHaveBeenCalledOnce();
  });

  it("passes the correct userId from the auth session to all downstream calls", async () => {
    const env = makeEnv();
    const sql = makeSql();

    await handleRunMatchingScan(sql as never, env, {}, makeRequest());

    expect(getSoulmateProfile).toHaveBeenCalledWith(expect.anything(), USER_ID);
    expect(enqueueMatchingScanUser).toHaveBeenCalledWith(env.BACKGROUND_QUEUE, USER_ID);
  });
});
