import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../workers/src/matchApp.ts", () => ({
  insertMatchAttempt: vi.fn().mockResolvedValue("match-id-1"),
  getMatchedUserIds: vi.fn().mockResolvedValue([]),
  getSoulmateProfile: vi.fn().mockResolvedValue({ display_name: "Test" })
}));

vi.mock("../../workers/src/matchSimulation.ts", () => ({
  runSimulatedMatch: vi.fn().mockResolvedValue({
    outcome: "match",
    score: 0.85,
    observerResult: {
      dimensions: [],
      connectionZones: ["Deep Divers"],
      keyMoments: [],
      overallScore: 0.85,
      decision: "match"
    },
    transcripts: { first_date: [], vulnerability: [], friction: [] }
  })
}));

vi.mock("../../workers/src/backgroundJobsQueue.ts", () => ({
  enqueueMatchReasoning: vi.fn().mockResolvedValue({ jobId: "j1" })
}));

import { runMatchingPipeline } from "../../workers/src/matchingPipeline.ts";
import { insertMatchAttempt } from "../../workers/src/matchApp.ts";
import { enqueueMatchReasoning } from "../../workers/src/backgroundJobsQueue.ts";

type SqlMock = ReturnType<typeof vi.fn>;

describe("runMatchingPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("caps new matches at two per user across the whole run", async () => {
    const users = [
      makeUser("u1", "male"),
      makeUser("u2", "female"),
      makeUser("u3", "female"),
      makeUser("u4", "female"),
      makeUser("u5", "female")
    ];

    const candidatesByUser = new Map([
      ["u1", [makeCandidate("u2"), makeCandidate("u3"), makeCandidate("u4"), makeCandidate("u5")]],
      ["u2", [makeCandidate("u1")]],
      ["u3", [makeCandidate("u1")]],
      ["u4", [makeCandidate("u1")]],
      ["u5", [makeCandidate("u1")]]
    ]);

    const sql: SqlMock = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("?");

      if (query.includes("SELECT sp.user_id")) {
        return users;
      }

      if (query.includes("SELECT sp2.user_id")) {
        const userId = values.find((value): value is string =>
          typeof value === "string" && value.startsWith("u")
        );
        return candidatesByUser.get(userId ?? "") ?? [];
      }

      // getUserLanguage
      if (query.includes("SELECT language")) {
        return [{ language: "English" }];
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    const mockQueue = { send: vi.fn().mockResolvedValue(undefined) };

    await runMatchingPipeline(sql as never, {
      ENABLE_SOULMATE: "true",
      BACKGROUND_QUEUE: mockQueue
    } as never);

    const counts = new Map<string, number>();
    for (const call of vi.mocked(insertMatchAttempt).mock.calls) {
      const userAId = call[1] as string;
      const userBId = call[2] as string;
      counts.set(userAId, (counts.get(userAId) ?? 0) + 1);
      counts.set(userBId, (counts.get(userBId) ?? 0) + 1);
    }

    expect(counts.get("u1")).toBe(2);
    expect(counts.get("u2")).toBe(1);
    expect(counts.get("u3")).toBe(1);
    expect(counts.get("u4") ?? 0).toBe(0);
    expect(counts.get("u5") ?? 0).toBe(0);
  });

  it("enqueues per-user reasoning for each match", async () => {
    const users = [makeUser("u1", "male"), makeUser("u2", "female")];
    const candidatesByUser = new Map([
      ["u1", [makeCandidate("u2")]],
      ["u2", [makeCandidate("u1")]]
    ]);

    const sql: SqlMock = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("?");
      if (query.includes("SELECT sp.user_id")) return users;
      if (query.includes("SELECT sp2.user_id")) {
        const userId = values.find((v): v is string => typeof v === "string" && v.startsWith("u"));
        return candidatesByUser.get(userId ?? "") ?? [];
      }
      if (query.includes("SELECT language")) return [{ language: "English" }];
      throw new Error(`Unexpected query: ${query}`);
    });

    const mockQueue = { send: vi.fn().mockResolvedValue(undefined) };

    await runMatchingPipeline(sql as never, {
      ENABLE_SOULMATE: "true",
      BACKGROUND_QUEUE: mockQueue
    } as never);

    // Both u1→u2 and u2→u1 loops find each other as candidates, producing 2 match attempts
    // Each match attempt enqueues 2 reasoning jobs (one per user), so 4 total
    // In production, ON CONFLICT DO NOTHING prevents the duplicate; in tests mocks always succeed
    expect(vi.mocked(enqueueMatchReasoning)).toHaveBeenCalledTimes(4);
  });

  it("skips when ENABLE_SOULMATE is not true", async () => {
    const sql: SqlMock = vi.fn();
    await runMatchingPipeline(sql as never, {
      ENABLE_SOULMATE: "false"
    } as never);

    expect(sql).not.toHaveBeenCalled();
    expect(vi.mocked(insertMatchAttempt)).not.toHaveBeenCalled();
  });
});

function makeUser(userId: string, gender: string) {
  return {
    user_id: userId,
    display_name: userId,
    age: 30,
    gender,
    latitude: 40.7128,
    longitude: -74.0060,
    preferred_age_min: 18,
    preferred_age_max: 99,
    preferred_genders: gender === "male" ? ["female"] : ["male"],
    soul_version: 1
  };
}

function makeCandidate(userId: string) {
  return {
    user_id: userId,
    display_name: userId,
    soul_version: 1,
    distance_m: 100
  };
}
