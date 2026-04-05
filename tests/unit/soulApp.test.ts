import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../workers/src/llm.ts", () => ({
  callLlmJson: vi.fn(),
  callLlmText: vi.fn(),
  streamLlmText: vi.fn()
}));

const mockSQL = vi.fn();
vi.mock("../../workers/src/db.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../workers/src/db.ts")>();
  return {
    ...actual,
    createSQL: vi.fn(() => mockSQL),
    getUserModelProfileId: vi.fn().mockResolvedValue("frontier_v1")
  };
});

import {
  checkHiddenSynthesisNeeded,
  checkReflectionSnapshotNeeded,
  checkSynthesisNeeded,
  getHiddenSoulFile,
  getLatestReflectionSnapshot,
  getVisibleSoulFile,
  markReflectionSnapshotPending,
  markSynthesisPending,
  runHiddenSynthesis,
  runReflectionSnapshot,
  runVisibleSynthesis
} from "../../workers/src/soulApp.ts";
import { callLlmJson } from "../../workers/src/llm.ts";

describe("reflection snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSQL.mockReset();
  });

  it("returns null when no snapshot exists", async () => {
    mockSQL.mockResolvedValueOnce([]);
    const note = await getLatestReflectionSnapshot(mockSQL, "user-1");
    expect(note).toBeNull();
  });

  it("parses the latest ready snapshot with steering fields", async () => {
    mockSQL.mockResolvedValueOnce([{
      note: {
        updatedAt: "2026-03-31",
        domainCoverage: [
          { domain: "work_and_purpose", depth: "deep", evidence: "Repeated job discussion" }
        ],
        currentThreads: ["job drift"],
        avoidPastObservations: ["You use humor as armor"],
        avoidPastQuestions: ["What are you avoiding?"],
        steerToTopics: ["relationships — what intimacy costs you"],
        steeringPressure: "gentle",
        steeringReasoning: "The current thread is cooling.",
        summary: "An engineer wrestling with job satisfaction."
      }
    }]);

    const note = await getLatestReflectionSnapshot(mockSQL, "user-1");
    expect(note?.domainCoverage[0]?.domain).toBe("work_and_purpose");
    expect(note?.avoidPastQuestions).toContain("What are you avoiding?");
    expect(note?.steeringPressure).toBe("gentle");
    expect(note?.summary).toContain("engineer");
  });

  it("flags snapshot work when transcript crossed a new reflection cadence block", async () => {
    mockSQL.mockResolvedValueOnce([{ cnt: 23, last_created_at: "2026-03-29T20:00:00Z" }]);
    mockSQL.mockResolvedValueOnce([{ version: 2, status: "ready", through_message_count: 10, started_at: null }]);

    const result = await checkReflectionSnapshotNeeded(mockSQL, "user-1");
    expect(result.needed).toBe(true);
    expect(result.pending).toBe(false);
    expect(result.totalMessageCount).toBe(23);
  });

  it("marks reflection snapshot rows as pending by inserting a new version", async () => {
    mockSQL
      .mockResolvedValueOnce([{ version: 2, status: "ready", through_message_count: 10, started_at: null }])
      .mockResolvedValueOnce([{ user_id: "user-1" }]);

    const claimed = await markReflectionSnapshotPending(
      mockSQL,
      "user-1",
      20,
      "2026-03-29T20:00:00Z"
    );

    expect(claimed).toBe(true);
    expect(mockSQL).toHaveBeenCalledTimes(2);
  });

  it("runs a clean-slate reflection snapshot from all persisted messages", async () => {
    mockSQL
      .mockResolvedValueOnce([
        { id: "m1", user_id: "user-1", role: "assistant", content: "Hello", created_at: "2026-03-26T00:00:00Z" },
        { id: "m2", user_id: "user-1", role: "user", content: "I build walls.", created_at: "2026-03-26T00:01:00Z" },
        { id: "m3", user_id: "user-1", role: "assistant", content: "What are the walls protecting?", created_at: "2026-03-26T00:02:00Z" },
        { id: "m4", user_id: "user-1", role: "user", content: "My time.", created_at: "2026-03-26T00:03:00Z" },
        { id: "m5", user_id: "user-1", role: "assistant", content: "What does losing time mean for you?", created_at: "2026-03-26T00:04:00Z" },
        { id: "m6", user_id: "user-1", role: "user", content: "When I paint.", created_at: "2026-03-26T00:05:00Z" },
        { id: "m7", user_id: "user-1", role: "assistant", content: "What opens when you paint?", created_at: "2026-03-26T00:06:00Z" },
        { id: "m8", user_id: "user-1", role: "user", content: "My breath slows down.", created_at: "2026-03-26T00:07:00Z" },
        { id: "m9", user_id: "user-1", role: "assistant", content: "What are you not outrunning then?", created_at: "2026-03-26T00:08:00Z" },
        { id: "m10", user_id: "user-1", role: "user", content: "The need to prove I'm useful.", created_at: "2026-03-26T00:09:00Z" }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    vi.mocked(callLlmJson).mockResolvedValueOnce({
      updatedAt: "2026-03-26T00:10:00Z",
      domainCoverage: [
        { domain: "emotional_life", depth: "explored", evidence: "Painting as emotional regulation" },
        { domain: "work_and_purpose", depth: "mentioned", evidence: "Proving usefulness" }
      ],
      currentThreads: ["painting", "fear of being swallowed"],
      avoidPastObservations: ["You use walls as emotional architecture"],
      avoidPastQuestions: ["What does losing time mean for you?"],
      steerToTopics: ["origins — when time first started feeling scarce"],
      steeringPressure: "gentle",
      steeringReasoning: "The current thread is still alive but narrowing.",
      summary: "This person builds walls when overwhelmed. Painting slows their breath. They fear needing to prove they're useful."
    });

    const note = await runReflectionSnapshot(mockSQL, {
      ANTHROPIC_API_KEY: "test",
      DATABASE_URL: "test",
      THUMOS_SESSION_SECRET: "secret",
      BACKGROUND_QUEUE: { send: vi.fn() }
    } as never, "user-1");

    expect(note).not.toBeNull();
    expect(note?.currentThreads).toContain("painting");
    expect(note?.steerToTopics[0]).toContain("origins");
  });
});

describe("visible/hidden soul files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSQL.mockReset();
  });

  it("normalizes hidden soul file timestamps and honest insights", async () => {
    const timestamp = new Date("2026-03-29T20:00:00.000Z");
    mockSQL.mockResolvedValueOnce([{
      version: 1,
      last_updated: timestamp,
      confidence: "low",
      expert_reflections: {},
      core_drivers: [],
      core_values: [],
      voice: {},
      depth_map: {
        domainCoverage: [{ domain: "work_and_purpose", depth: "explored", evidence: "career tension" }]
      },
      analyst_notes: [],
      honest_insights: ["You still treat need as weakness."]
    }]);

    const file = await getHiddenSoulFile(mockSQL, "user-1");
    expect(file?.lastUpdated).toBe(timestamp.toISOString());
    expect(file?.depthMap.domainCoverage[0]?.domain).toBe("work_and_purpose");
    expect(file?.honestInsights[0]).toContain("weakness");
  });

  it("normalizes visible soul file timestamps and your tensions", async () => {
    const timestamp = new Date("2026-03-29T20:00:00.000Z");
    mockSQL.mockResolvedValueOnce([{
      version: 1,
      last_updated: timestamp,
      portrait: "Test",
      how_you_move: "",
      how_you_think: "",
      how_you_connect: "",
      what_you_carry: "",
      what_lights_you_up: "",
      your_contradictions: "You want closeness but brace against it.",
      your_voice: "",
      crystallized_moments: [],
      open_threads: [],
      compass_scores: {},
      personality_spectrum: {
        openness: { position: 72, label: "Curious", evidence: "Explores many frames" }
      },
      top_values: [{ value: "Self-Direction", description: "Needs freedom" }],
      relational_style: "Opens through shared perspective."
    }]);

    const file = await getVisibleSoulFile(mockSQL, "user-1");
    expect(file?.lastUpdated).toBe(timestamp.toISOString());
    expect(file?.sections.yourTensions).toContain("closeness");
    expect(file?.personalitySpectrum.openness?.position).toBe(72);
  });
});

describe("synthesis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSQL.mockReset();
  });

  it("flags visible and hidden synthesis separately", async () => {
    mockSQL
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cnt: 3 }])
      .mockResolvedValueOnce([]);

    const visible = await checkSynthesisNeeded(mockSQL, "user-1");
    expect(visible.needed).toBe(true);

    mockSQL
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ cnt: 3 }])
      .mockResolvedValueOnce([]);

    const hidden = await checkHiddenSynthesisNeeded(mockSQL, "user-1");
    expect(hidden.needed).toBe(true);
  });

  it("marks visible synthesis rows as pending by inserting a new version", async () => {
    mockSQL
      .mockResolvedValueOnce([{ version: 4, status: "ready", synthesis_started_at: null }])
      .mockResolvedValueOnce([{ user_id: "user-1" }]);

    const claimed = await markSynthesisPending(mockSQL, "user-1");
    expect(claimed).toBe(true);
  });

  it("runs visible synthesis from messages only (no reflection note)", async () => {
    mockSQL
      .mockResolvedValueOnce([
        { id: "m1", user_id: "user-1", role: "assistant", content: "Hello", created_at: "2026-03-26" },
        { id: "m2", user_id: "user-1", role: "user", content: "I build walls.", created_at: "2026-03-26" }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    vi.mocked(callLlmJson).mockResolvedValueOnce({
      version: 1,
      lastUpdated: "2026-03-27",
      portrait: "You build distance when the world feels too loud.",
      sections: {
        howYouMove: "Deliberately",
        howYouThink: "In systems",
        howYouConnect: "Cautiously",
        whatYouCarry: "Weight",
        whatLightsYouUp: "Flow",
        yourTensions: "You want closeness but expect a cost.",
        yourVoice: "Measured"
      },
      crystallizedMoments: [{ quote: "I build walls", reflection: "Protection" }],
      openThreads: ["Behind the walls"],
      compassScores: {},
      personalitySpectrum: {
        openness: { position: 76, label: "Curious beneath the guard", evidence: "Keeps reaching for larger frames" }
      },
      topValues: [{ value: "Self-Direction", description: "You need room to choose your own path." }],
      relationalStyle: "You open through shared perspective before deeper closeness."
    });

    const result = await runVisibleSynthesis(mockSQL, {
      ANTHROPIC_API_KEY: "test",
      DATABASE_URL: "test",
      THUMOS_SESSION_SECRET: "secret",
      BACKGROUND_QUEUE: { send: vi.fn() }
    } as never, "user-1");

    expect(result?.portrait).toContain("distance");
    expect(result?.sections.yourTensions).toContain("closeness");
    expect(result?.personalitySpectrum.openness?.position).toBe(76);
  });

  it("runs hidden synthesis from messages only (no reflection note)", async () => {
    mockSQL
      .mockResolvedValueOnce([
        { id: "m1", user_id: "user-1", role: "assistant", content: "Hello", created_at: "2026-03-26" },
        { id: "m2", user_id: "user-1", role: "user", content: "I build walls.", created_at: "2026-03-26" }
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    vi.mocked(callLlmJson).mockResolvedValueOnce({
      version: 1,
      lastUpdated: "2026-03-27",
      confidence: "medium",
      expertReflections: {
        psychologist: ["Avoidance is doing interpersonal work here."],
        sociologist: ["Performance reads as a masculinity survival strategy."],
        linguist: ["Uses joking cadence to soften admissions."],
        narrativeAnalyst: ["The wall is both shield and identity story."]
      },
      coreDrivers: [{ driver: "Autonomy", strength: 0.9, inferred: true, evidence: "Walls metaphor" }],
      coreValues: ["independence"],
      voice: {
        register: "casual",
        density: "moderate",
        humorStyle: "dry",
        conflictStyle: "avoidant",
        disclosureRate: "gradual",
        signaturePatterns: [],
        voiceExamples: []
      },
      depthMap: {
        domainCoverage: [{ domain: "work_and_purpose", depth: "explored", evidence: "Repeated job discussion" }]
      },
      analystNotes: ["Relationship avoidance is the sharper growth edge."],
      honestInsights: ["You still treat being needed like a threat to autonomy."]
    });

    const result = await runHiddenSynthesis(mockSQL, {
      ANTHROPIC_API_KEY: "test",
      DATABASE_URL: "test",
      THUMOS_SESSION_SECRET: "secret",
      BACKGROUND_QUEUE: { send: vi.fn() }
    } as never, "user-1");

    expect(result?.expertReflections.psychologist[0]).toContain("Avoidance");
    expect(result?.depthMap.domainCoverage[0]?.domain).toBe("work_and_purpose");
    expect(result?.honestInsights[0]).toContain("autonomy");
  });
});
