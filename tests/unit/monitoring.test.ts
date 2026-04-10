import { describe, it, expect, vi } from "vitest";
import { handleMonitoring, fetchStats } from "../../workers/src/handlers/monitoring.ts";
import type { Env } from "../../workers/src/env.ts";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DATABASE_URL: "postgres://test",
    ANTHROPIC_API_KEY: "sk-test",
    THUMOS_SESSION_SECRET: "secret",
    BACKGROUND_QUEUE: {} as Env["BACKGROUND_QUEUE"],
    DEBUG_API_TOKEN: "correct-token",
    ...overrides,
  };
}

function makeRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

function mockSQL() {
  const fn = vi.fn().mockResolvedValue([{ n: "0" }]) as any;
  // 7th call returns recent messages (empty by default)
  fn.mockResolvedValueOnce([{ n: "0" }])
    .mockResolvedValueOnce([{ n: "0" }])
    .mockResolvedValueOnce([{ n: "0" }])
    .mockResolvedValueOnce([{ n: "0" }])
    .mockResolvedValueOnce([{ n: "0" }])
    .mockResolvedValueOnce([{ n: "0" }])
    .mockResolvedValueOnce([]);
  return fn;
}

describe("handleMonitoring", () => {
  describe("auth", () => {
    it("returns 403 when DEBUG_API_TOKEN is not configured", async () => {
      const res = await handleMonitoring(
        mockSQL(),
        makeEnv({ DEBUG_API_TOKEN: undefined }),
        makeRequest("https://example.com/monitoring")
      );
      expect(res.status).toBe(403);
    });

    it("returns 403 when no token is provided", async () => {
      const res = await handleMonitoring(
        mockSQL(),
        makeEnv(),
        makeRequest("https://example.com/monitoring")
      );
      expect(res.status).toBe(403);
    });

    it("returns 403 when token is wrong", async () => {
      const res = await handleMonitoring(
        mockSQL(),
        makeEnv(),
        makeRequest("https://example.com/monitoring?token=wrong")
      );
      expect(res.status).toBe(403);
    });

    it("returns 200 with correct query param token", async () => {
      const res = await handleMonitoring(
        mockSQL(),
        makeEnv(),
        makeRequest("https://example.com/monitoring?token=correct-token")
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    });

    it("returns 200 with correct header token", async () => {
      const res = await handleMonitoring(
        mockSQL(),
        makeEnv(),
        makeRequest("https://example.com/monitoring", {
          "x-thumos-debug-token": "correct-token",
        })
      );
      expect(res.status).toBe(200);
    });
  });

  describe("stats rendering", () => {
    it("renders stats in HTML", async () => {
      const sql: any = vi.fn()
        .mockResolvedValueOnce([{ n: "5" }])   // active users
        .mockResolvedValueOnce([{ n: "42" }])  // messages 24h
        .mockResolvedValueOnce([{ n: "7" }])   // dms 24h
        .mockResolvedValueOnce([{ n: "100" }]) // total users
        .mockResolvedValueOnce([{ n: "999" }]) // total messages
        .mockResolvedValueOnce([{ n: "12" }])  // total matches
        .mockResolvedValueOnce([              // recent messages
          { role: "user", content: "hello world", created_at: "2026-04-10T00:00:00Z" },
          { role: "assistant", content: "hi there", created_at: "2026-04-10T00:00:01Z" },
        ]);

      const res = await handleMonitoring(
        sql,
        makeEnv(),
        makeRequest("https://example.com/monitoring?token=correct-token")
      );

      const html = await res.text();
      expect(html).toContain("5");
      expect(html).toContain("42");
      expect(html).toContain("7");
      expect(html).toContain("100");
      expect(html).toContain("999");
      expect(html).toContain("12");
      expect(html).toContain("Thumos Monitoring");
      expect(html).toContain("hello world");
      expect(html).toContain("hi there");
    });
  });
});

describe("fetchStats", () => {
  it("returns parsed stats from SQL results", async () => {
    const sql: any = vi.fn()
      .mockResolvedValueOnce([{ n: "3" }])
      .mockResolvedValueOnce([{ n: "20" }])
      .mockResolvedValueOnce([{ n: "4" }])
      .mockResolvedValueOnce([{ n: "50" }])
      .mockResolvedValueOnce([{ n: "500" }])
      .mockResolvedValueOnce([{ n: "8" }])
      .mockResolvedValueOnce([{ role: "user", content: "test", created_at: "2026-04-10T00:00:00Z" }]);

    const stats = await fetchStats(sql);
    expect(stats).toEqual({
      activeUsers24h: 3,
      messages24h: 20,
      dms24h: 4,
      totalUsers: 50,
      totalMessages: 500,
      totalMatches: 8,
      recentMessages: [{ role: "user", content: "test", createdAt: "2026-04-10T00:00:00Z" }],
    });
  });
});
