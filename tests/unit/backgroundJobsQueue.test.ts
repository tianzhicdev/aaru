import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../workers/src/soulApp.ts", () => ({
  checkReflectionSnapshotNeeded: vi.fn(),
  checkSynthesisNeeded: vi.fn(),
  getReflectionSnapshotState: vi.fn(),
  getSynthesisStatus: vi.fn(),
  markReflectionSnapshotFailed: vi.fn(),
  markSynthesisFailed: vi.fn(),
  runReflectionSnapshot: vi.fn(),
  runSoulSynthesis: vi.fn()
}));

import {
  enqueueReflectionSnapshot,
  enqueueSoulSynthesis,
  processBackgroundJobsBatch,
  type BackgroundQueueBinding
} from "../../workers/src/backgroundJobsQueue.ts";
import {
  checkReflectionSnapshotNeeded,
  checkSynthesisNeeded,
  getReflectionSnapshotState,
  getSynthesisStatus,
  markReflectionSnapshotFailed,
  markSynthesisFailed,
  runReflectionSnapshot,
  runSoulSynthesis
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

  it("publishes a synthesis job", async () => {
    const queue: BackgroundQueueBinding = { send: vi.fn().mockResolvedValue(undefined) };
    const job = await enqueueSoulSynthesis(queue, "user-1");
    expect(queue.send).toHaveBeenCalledWith({
      kind: "soul_synthesis",
      jobId: expect.any(String),
      userId: "user-1",
      queuedAt: expect.any(String)
    });
    expect(job.kind).toBe("soul_synthesis");
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

  it("runs synthesis jobs when the user is pending", async () => {
    vi.mocked(getSynthesisStatus).mockResolvedValue("pending");
    vi.mocked(runSoulSynthesis).mockResolvedValue({ visible: null, hidden: null });

    await processBackgroundJobsBatch(mockSQL, mockEnv, {
      messages: [{ body: { kind: "soul_synthesis", jobId: "job-1", userId: "user-1", queuedAt: "2026-03-29T20:00:00.000Z" } }]
    });

    expect(runSoulSynthesis).toHaveBeenCalledWith(mockSQL, mockEnv, "user-1");
    expect(checkSynthesisNeeded).not.toHaveBeenCalled();
  });

  it("runs reflection snapshot jobs when a snapshot is pending", async () => {
    vi.mocked(getReflectionSnapshotState).mockResolvedValue({
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

  it("marks synthesis as failed when the consumer errors", async () => {
    vi.mocked(getSynthesisStatus).mockResolvedValue("pending");
    vi.mocked(runSoulSynthesis).mockRejectedValue(new Error("boom"));
    vi.mocked(markSynthesisFailed).mockResolvedValue(undefined);

    await processBackgroundJobsBatch(mockSQL, mockEnv, {
      messages: [{ body: { kind: "soul_synthesis", jobId: "job-1", userId: "user-1", queuedAt: "2026-03-29T20:00:00.000Z" } }]
    });

    expect(markSynthesisFailed).toHaveBeenCalledWith(mockSQL, "user-1");
  });

  it("marks reflection snapshots as failed when the consumer errors", async () => {
    vi.mocked(getReflectionSnapshotState).mockResolvedValue({
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
