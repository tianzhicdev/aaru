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

vi.mock("../../workers/src/notifications.ts", () => ({
  notifyNewMatch: vi.fn().mockResolvedValue(undefined),
  notifyAdminMessage: vi.fn(),
  upsertPushToken: vi.fn()
}));

import { runMatchingPipeline } from "../../workers/src/matchingPipeline.ts";
import { insertMatchAttempt } from "../../workers/src/matchApp.ts";
import { enqueueMatchReasoning } from "../../workers/src/backgroundJobsQueue.ts";
import { notifyNewMatch } from "../../workers/src/notifications.ts";

type SqlMock = ReturnType<typeof vi.fn>;

describe("runMatchingPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insertMatchAttempt).mockResolvedValue("match-id-1");
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

  it("excludes users whose reflection note has fewer than 7 explored domains", async () => {
    const users = [
      makeUser("u1", "male", fullCoverageNote()),
      makeUser("u2", "female", partialCoverageNote(6)),  // gated out — only 6/7
      makeUser("u3", "female", fullCoverageNote())
    ];

    const candidatesByUser = new Map([
      ["u1", [makeCandidate("u3")]],
      ["u3", [makeCandidate("u1")]]
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

    const involvedUsers = new Set<string>();
    for (const call of vi.mocked(insertMatchAttempt).mock.calls) {
      involvedUsers.add(call[1] as string);
      involvedUsers.add(call[2] as string);
    }
    expect(involvedUsers.has("u2")).toBe(false);
    expect(involvedUsers.has("u1")).toBe(true);
    expect(involvedUsers.has("u3")).toBe(true);
  });

  it("excludes users with no reflection note", async () => {
    const users = [
      makeUser("u1", "male", fullCoverageNote()),
      makeUser("u2", "female", null)  // no note → locked
    ];

    const sql: SqlMock = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("SELECT sp.user_id")) return users;
      if (query.includes("SELECT sp2.user_id")) return [];
      if (query.includes("SELECT language")) return [{ language: "English" }];
      throw new Error(`Unexpected query: ${query}`);
    });

    const mockQueue = { send: vi.fn().mockResolvedValue(undefined) };

    await runMatchingPipeline(sql as never, {
      ENABLE_SOULMATE: "true",
      BACKGROUND_QUEUE: mockQueue
    } as never);

    const involvedUsers = new Set<string>();
    for (const call of vi.mocked(insertMatchAttempt).mock.calls) {
      involvedUsers.add(call[1] as string);
      involvedUsers.add(call[2] as string);
    }
    expect(involvedUsers.has("u2")).toBe(false);
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

    // Both u1→u2 and u2→u1 loops find each other as candidates, producing 2 match attempts.
    // Each match attempt enqueues 2 reasoning jobs (one per user), so 4 total.
    // In production, ON CONFLICT DO NOTHING prevents the duplicate; in tests mocks always succeed.
    expect(vi.mocked(enqueueMatchReasoning)).toHaveBeenCalledTimes(4);
  });

  it("fires notifyNewMatch for both sides on a successful match insert", async () => {
    vi.mocked(insertMatchAttempt).mockResolvedValue("match-id-1");

    const users = [
      makeUser("u1", "male", fullCoverageNote(), "Alex"),
      makeUser("u2", "female", fullCoverageNote(), "Jordan")
    ];
    const candidatesByUser = new Map([
      ["u1", [makeCandidate("u2", fullCoverageNote(), "Jordan")]],
      ["u2", [makeCandidate("u1", fullCoverageNote(), "Alex")]]
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

    expect(notifyNewMatch).toHaveBeenCalledWith(sql, expect.any(Object), "u1", "Jordan");
    expect(notifyNewMatch).toHaveBeenCalledWith(sql, expect.any(Object), "u2", "Alex");
  });

  it("does not fire notifyNewMatch on duplicate (no row inserted) match", async () => {
    vi.mocked(insertMatchAttempt).mockResolvedValue(null);

    const users = [
      makeUser("u1", "male", fullCoverageNote(), "Alex"),
      makeUser("u2", "female", fullCoverageNote(), "Jordan")
    ];
    const sql: SqlMock = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("SELECT sp.user_id")) return users;
      if (query.includes("SELECT sp2.user_id")) return [makeCandidate("u2", fullCoverageNote(), "Jordan")];
      if (query.includes("SELECT language")) return [{ language: "English" }];
      throw new Error(`Unexpected query: ${query}`);
    });

    const mockQueue = { send: vi.fn().mockResolvedValue(undefined) };

    await runMatchingPipeline(sql as never, {
      ENABLE_SOULMATE: "true",
      BACKGROUND_QUEUE: mockQueue
    } as never);

    expect(notifyNewMatch).not.toHaveBeenCalled();
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

const ALL_DOMAINS = [
  "daily_rhythm", "play_and_joy", "values_and_worldview", "love_language",
  "conflict_and_repair", "vulnerability_and_trust", "partnership_vision"
] as const;

function fullCoverageNote() {
  return {
    domainCoverage: ALL_DOMAINS.map((domain) => ({
      domain,
      depth: "explored",
      evidence: ""
    }))
  };
}

function partialCoverageNote(coveredDomains: number) {
  return {
    domainCoverage: ALL_DOMAINS.map((domain, i) => ({
      domain,
      depth: i < coveredDomains ? "explored" : "untouched",
      evidence: ""
    }))
  };
}

function makeUser(
  userId: string,
  gender: string,
  reflectionNote: unknown = fullCoverageNote(),
  displayName: string | null = null
) {
  return {
    user_id: userId,
    display_name: displayName ?? userId,
    age: 30,
    gender,
    latitude: 40.7128,
    longitude: -74.0060,
    preferred_age_min: 18,
    preferred_age_max: 99,
    preferred_genders: gender === "male" ? ["female"] : ["male"],
    soul_version: 1,
    language: "English",
    reflection_note: reflectionNote
  };
}

function makeCandidate(
  userId: string,
  reflectionNote: unknown = fullCoverageNote(),
  displayName: string | null = null
) {
  return {
    user_id: userId,
    display_name: displayName ?? userId,
    soul_version: 1,
    distance_m: 100,
    reflection_note: reflectionNote
  };
}
