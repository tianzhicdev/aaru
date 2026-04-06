import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../workers/src/matchingPipeline.ts", () => ({
  runMatchingPipeline: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../../workers/src/soulApp.ts", () => ({
  checkHiddenSynthesisNeeded: vi.fn(),
  checkReflectionSnapshotNeeded: vi.fn(),
  checkSynthesisNeeded: vi.fn(),
  getHiddenSynthesisStatus: vi.fn(),
  getReflectionSnapshotState: vi.fn(),
  getSynthesisStatus: vi.fn(),
  markHiddenSynthesisFailed: vi.fn(),
  markReflectionSnapshotFailed: vi.fn(),
  markSynthesisFailed: vi.fn(),
  runHiddenSynthesis: vi.fn(),
  runReflectionSnapshot: vi.fn(),
  runVisibleSynthesis: vi.fn()
}));

import {
  enqueueMatchingRun,
  enqueueReflectionSnapshot,
  enqueueSynthesisHidden,
  enqueueSynthesisVisible,
  processBackgroundJobsBatch,
  type BackgroundQueueBinding
} from "../../workers/src/backgroundJobsQueue.ts";
import { runMatchingPipeline } from "../../workers/src/matchingPipeline.ts";
import {
  checkHiddenSynthesisNeeded,
  checkReflectionSnapshotNeeded,
  checkSynthesisNeeded,
  getHiddenSynthesisStatus,
  getReflectionSnapshotState,
  getSynthesisStatus,
  markHiddenSynthesisFailed,
  markReflectionSnapshotFailed,
  markSynthesisFailed,
  runHiddenSynthesis,
  runReflectionSnapshot,
  runVisibleSynthesis
} from "../../workers/src/soulApp.ts";

const mockSQL = vi.fn();
const mockEnv = {
  DATABASE_URL: "mock",
  ANTHROPIC_API_KEY: "test-key",
  THUMOS_SESSION_SECRET: "secret",
  BACKGROUND_QUEUE: { send: vi.fn() }
};

describe("queue publishers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes separate visible and hidden synthesis jobs", async () => {
    const queue: BackgroundQueueBinding = { send: vi.fn().mockResolvedValue(undefined) };

    const visibleJob = await enqueueSynthesisVisible(queue, "user-1");
    const hiddenJob = await enqueueSynthesisHidden(queue, "user-1");

    expect(queue.send).toHaveBeenNthCalledWith(1, {
      kind: "synthesis_visible",
      jobId: expect.any(String),
      userId: "user-1",
      queuedAt: expect.any(String)
    });
    expect(queue.send).toHaveBeenNthCalledWith(2, {
      kind: "synthesis_hidden",
      jobId: expect.any(String),
      userId: "user-1",
      queuedAt: expect.any(String)
    });
    expect(visibleJob.kind).toBe("synthesis_visible");
    expect(hiddenJob.kind).toBe("synthesis_hidden");
  });

  it("publishes a matching run job", async () => {
    const queue: BackgroundQueueBinding = { send: vi.fn().mockResolvedValue(undefined) };
    const job = await enqueueMatchingRun(queue);
    expect(queue.send).toHaveBeenCalledWith({
      kind: "matching_run",
      jobId: expect.any(String),
      queuedAt: expect.any(String)
    });
    expect(job.kind).toBe("matching_run");
  });

  it("publishes a reflection snapshot job", async () => {
    const queue: BackgroundQueueBinding = { send: vi.fn().mockResolvedValue(undefined) };
    const job = await enqueueReflectionSnapshot(queue, "user-1", 20);
    expect(queue.send).toHaveBeenCalledWith({
      kind: "reflection_snapshot",
      jobId: expect.any(String),
      userId: "user-1",
      queuedAt: expect.any(String),
      throughMessageCount: 20
    });
    expect(job.kind).toBe("reflection_snapshot");
  });
});

describe("processBackgroundJobsBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs visible synthesis jobs when the user is pending", async () => {
    vi.mocked(getSynthesisStatus).mockResolvedValue("pending");
    vi.mocked(runVisibleSynthesis).mockResolvedValue(null);

    await processBackgroundJobsBatch(mockSQL, mockEnv, {
      messages: [{ body: { kind: "synthesis_visible", jobId: "job-1", userId: "user-1", queuedAt: "2026-03-29T20:00:00.000Z" } }]
    });

    expect(runVisibleSynthesis).toHaveBeenCalledWith(mockSQL, mockEnv, "user-1");
    expect(checkSynthesisNeeded).not.toHaveBeenCalled();
  });

  it("runs hidden synthesis jobs when the user is pending", async () => {
    vi.mocked(getHiddenSynthesisStatus).mockResolvedValue("pending");
    vi.mocked(runHiddenSynthesis).mockResolvedValue(null);

    await processBackgroundJobsBatch(mockSQL, mockEnv, {
      messages: [{ body: { kind: "synthesis_hidden", jobId: "job-1", userId: "user-1", queuedAt: "2026-03-29T20:00:00.000Z" } }]
    });

    expect(runHiddenSynthesis).toHaveBeenCalledWith(mockSQL, mockEnv, "user-1");
    expect(checkHiddenSynthesisNeeded).not.toHaveBeenCalled();
  });

  it("runs reflection snapshot jobs when a snapshot is pending", async () => {
    vi.mocked(getReflectionSnapshotState).mockResolvedValue({
      version: 3,
      status: "pending",
      throughMessageCount: 20,
      startedAt: "2026-03-29T20:00:00.000Z"
    });
    vi.mocked(runReflectionSnapshot).mockResolvedValue(null);

    await processBackgroundJobsBatch(mockSQL, mockEnv, {
      messages: [{ body: { kind: "reflection_snapshot", jobId: "job-2", userId: "user-1", queuedAt: "2026-03-29T20:00:00.000Z", throughMessageCount: 20 } }]
    });

    expect(runReflectionSnapshot).toHaveBeenCalledWith(mockSQL, mockEnv, "user-1");
    expect(checkReflectionSnapshotNeeded).not.toHaveBeenCalled();
  });

  it("marks visible synthesis as failed when the consumer errors", async () => {
    vi.mocked(getSynthesisStatus).mockResolvedValue("pending");
    vi.mocked(runVisibleSynthesis).mockRejectedValue(new Error("boom"));
    vi.mocked(markSynthesisFailed).mockResolvedValue(undefined);

    await processBackgroundJobsBatch(mockSQL, mockEnv, {
      messages: [{ body: { kind: "synthesis_visible", jobId: "job-1", userId: "user-1", queuedAt: "2026-03-29T20:00:00.000Z" } }]
    });

    expect(markSynthesisFailed).toHaveBeenCalledWith(mockSQL, "user-1");
  });

  it("marks hidden synthesis as failed when the consumer errors", async () => {
    vi.mocked(getHiddenSynthesisStatus).mockResolvedValue("pending");
    vi.mocked(runHiddenSynthesis).mockRejectedValue(new Error("boom"));
    vi.mocked(markHiddenSynthesisFailed).mockResolvedValue(undefined);

    await processBackgroundJobsBatch(mockSQL, mockEnv, {
      messages: [{ body: { kind: "synthesis_hidden", jobId: "job-1", userId: "user-1", queuedAt: "2026-03-29T20:00:00.000Z" } }]
    });

    expect(markHiddenSynthesisFailed).toHaveBeenCalledWith(mockSQL, "user-1");
  });

  it("runs matching pipeline for matching_run jobs", async () => {
    vi.mocked(runMatchingPipeline).mockResolvedValue(undefined);

    await processBackgroundJobsBatch(mockSQL, mockEnv, {
      messages: [{ body: { kind: "matching_run", jobId: "job-m1", queuedAt: "2026-04-05T06:00:00.000Z" } }]
    });

    expect(runMatchingPipeline).toHaveBeenCalledWith(mockSQL, mockEnv);
  });

  it("logs error but does not throw when matching pipeline fails", async () => {
    vi.mocked(runMatchingPipeline).mockRejectedValue(new Error("pipeline boom"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await processBackgroundJobsBatch(mockSQL, mockEnv, {
      messages: [{ body: { kind: "matching_run", jobId: "job-m2", queuedAt: "2026-04-05T06:00:00.000Z" } }]
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "Queued matching pipeline run failed:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it("marks reflection snapshots as failed when the consumer errors", async () => {
    vi.mocked(getReflectionSnapshotState).mockResolvedValue({
      version: 4,
      status: "pending",
      throughMessageCount: 20,
      startedAt: "2026-03-29T20:00:00.000Z"
    });
    vi.mocked(runReflectionSnapshot).mockRejectedValue(new Error("boom"));
    vi.mocked(markReflectionSnapshotFailed).mockResolvedValue(undefined);

    await processBackgroundJobsBatch(mockSQL, mockEnv, {
      messages: [{ body: { kind: "reflection_snapshot", jobId: "job-2", userId: "user-1", queuedAt: "2026-03-29T20:00:00.000Z", throughMessageCount: 20 } }]
    });

    expect(markReflectionSnapshotFailed).toHaveBeenCalledWith(mockSQL, "user-1", "boom");
  });
});
