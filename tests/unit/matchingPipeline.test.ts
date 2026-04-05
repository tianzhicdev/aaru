import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../workers/src/matchApp.ts", () => ({
  insertMatchAttempt: vi.fn().mockResolvedValue(undefined),
  getMatchedUserIds: vi.fn().mockResolvedValue([])
}));

vi.mock("../../workers/src/soulApp.ts", () => ({
  getVisibleSoulFile: vi.fn().mockResolvedValue({
    version: 1,
    lastUpdated: "",
    portrait: "A person",
    sections: {
      howYouMove: "Move", howYouThink: "Think", howYouConnect: "Connect",
      whatYouCarry: "Carry", whatLightsYouUp: "Light", yourTensions: "Tensions", yourVoice: "Voice"
    },
    crystallizedMoments: [],
    openThreads: [],
    compassScores: {},
    personalitySpectrum: {
      openness: null, conscientiousness: null, extraversion: null,
      agreeableness: null, emotionalSensitivity: null
    },
    topValues: [],
    relationalStyle: null,
    completeness: 0.8
  })
}));

vi.mock("../../workers/src/llm.ts", () => ({
  callLlmJson: vi.fn().mockResolvedValue({
    decision: "match",
    score: 0.85,
    reasoning: "Great compatibility"
  })
}));

vi.mock("../../workers/src/modelProfiles.ts", async () => {
  const actual = await vi.importActual("../../workers/src/modelProfiles.ts");
  return actual;
});

import { runMatchingPipeline } from "../../workers/src/matchingPipeline.ts";
import { insertMatchAttempt } from "../../workers/src/matchApp.ts";

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

      throw new Error(`Unexpected query: ${query}`);
    });

    await runMatchingPipeline(sql as never, {
      ENABLE_SOULMATE: "true"
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
});

function makeUser(userId: string, gender: string) {
  return {
    user_id: userId,
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
    soul_version: 1,
    distance_m: 100
  };
}
