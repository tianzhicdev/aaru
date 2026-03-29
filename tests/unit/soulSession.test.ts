import { describe, it, expect, vi, afterEach } from "vitest";
import { isSessionStale } from "../../workers/src/soulApp.ts";
import { readBearerToken } from "../../workers/src/auth.ts";
import { STALE_SESSION_HOURS } from "../../src/domain/constants.ts";

// Minimal session row for isSessionStale tests
function makeSession(startedAt: string) {
  return {
    id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    session_number: 1,
    status: "in_session",
    exchange_count: 0,
    reflection_notes: null,
    started_at: startedAt,
    completed_at: null,
    next_available_at: null,
    extraction_error: null,
    created_at: startedAt
  };
}

describe("isSessionStale", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false for a session started just now", () => {
    const session = makeSession(new Date().toISOString());
    expect(isSessionStale(session)).toBe(false);
  });

  it("returns false for a session started 1 hour ago", () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    expect(isSessionStale(makeSession(oneHourAgo))).toBe(false);
  });

  it("returns false just under the stale threshold", () => {
    const justUnder = new Date(
      Date.now() - (STALE_SESSION_HOURS * 60 * 60 * 1000 - 1000)
    ).toISOString();
    expect(isSessionStale(makeSession(justUnder))).toBe(false);
  });

  it("returns true just over the stale threshold", () => {
    const justOver = new Date(
      Date.now() - (STALE_SESSION_HOURS * 60 * 60 * 1000 + 1000)
    ).toISOString();
    expect(isSessionStale(makeSession(justOver))).toBe(true);
  });

  it("returns true for a session started 1 week ago", () => {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isSessionStale(makeSession(oneWeekAgo))).toBe(true);
  });

  it("uses 72 hours as the stale threshold", () => {
    expect(STALE_SESSION_HOURS).toBe(72);
  });
});

describe("readBearerToken", () => {
  it("reads token from x-thumos-session header", () => {
    const request = new Request("https://example.com", {
      headers: { "x-thumos-session": "my-token-123" }
    });
    expect(readBearerToken(request)).toBe("my-token-123");
  });

  it("reads token from Authorization Bearer header", () => {
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer abc-def-456" }
    });
    expect(readBearerToken(request)).toBe("abc-def-456");
  });

  it("prefers x-thumos-session over Authorization", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-thumos-session": "preferred-token",
        Authorization: "Bearer fallback-token"
      }
    });
    expect(readBearerToken(request)).toBe("preferred-token");
  });

  it("returns null when no auth headers present", () => {
    const request = new Request("https://example.com");
    expect(readBearerToken(request)).toBeNull();
  });

  it("returns null for non-Bearer authorization scheme", () => {
    const request = new Request("https://example.com", {
      headers: { Authorization: "Basic dXNlcjpwYXNz" }
    });
    expect(readBearerToken(request)).toBeNull();
  });

  it("trims whitespace from token", () => {
    const request = new Request("https://example.com", {
      headers: { "x-thumos-session": "  spaced-token  " }
    });
    expect(readBearerToken(request)).toBe("spaced-token");
  });

  it("returns null for empty x-thumos-session header", () => {
    const request = new Request("https://example.com", {
      headers: { "x-thumos-session": "   " }
    });
    expect(readBearerToken(request)).toBeNull();
  });
});
