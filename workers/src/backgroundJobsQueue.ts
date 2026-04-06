import type { NeonSQL } from "./db.ts";
import type { Env } from "./env.ts";
import { runMatchingPipeline } from "./matchingPipeline.ts";
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
} from "./soulApp.ts";

export interface SynthesisVisibleJob {
  kind: "synthesis_visible";
  jobId: string;
  userId: string;
  queuedAt: string;
}

export interface SynthesisHiddenJob {
  kind: "synthesis_hidden";
  jobId: string;
  userId: string;
  queuedAt: string;
}

export interface ReflectionSnapshotJob {
  kind: "reflection_snapshot";
  jobId: string;
  userId: string;
  queuedAt: string;
  throughMessageCount: number;
}

export interface MatchingRunJob {
  kind: "matching_run";
  jobId: string;
  queuedAt: string;
}

export type BackgroundJob =
  | SynthesisVisibleJob
  | SynthesisHiddenJob
  | ReflectionSnapshotJob
  | MatchingRunJob;

export interface BackgroundQueueBinding {
  send(message: BackgroundJob): Promise<void>;
}

export interface QueueMessage<T> {
  body: T;
}

export interface QueueBatch<T> {
  messages: Array<QueueMessage<T>>;
}

export async function enqueueSynthesisVisible(
  queue: BackgroundQueueBinding,
  userId: string
): Promise<SynthesisVisibleJob> {
  const job: SynthesisVisibleJob = {
    kind: "synthesis_visible",
    jobId: crypto.randomUUID(),
    userId,
    queuedAt: new Date().toISOString()
  };
  await queue.send(job);
  return job;
}

export async function enqueueSynthesisHidden(
  queue: BackgroundQueueBinding,
  userId: string
): Promise<SynthesisHiddenJob> {
  const job: SynthesisHiddenJob = {
    kind: "synthesis_hidden",
    jobId: crypto.randomUUID(),
    userId,
    queuedAt: new Date().toISOString()
  };
  await queue.send(job);
  return job;
}

export async function enqueueReflectionSnapshot(
  queue: BackgroundQueueBinding,
  userId: string,
  throughMessageCount: number
): Promise<ReflectionSnapshotJob> {
  const job: ReflectionSnapshotJob = {
    kind: "reflection_snapshot",
    jobId: crypto.randomUUID(),
    userId,
    queuedAt: new Date().toISOString(),
    throughMessageCount
  };
  await queue.send(job);
  return job;
}

export async function enqueueMatchingRun(
  queue: BackgroundQueueBinding
): Promise<MatchingRunJob> {
  const job: MatchingRunJob = {
    kind: "matching_run",
    jobId: crypto.randomUUID(),
    queuedAt: new Date().toISOString()
  };
  await queue.send(job);
  return job;
}

async function processMatchingRunJob(sql: NeonSQL, env: Env): Promise<void> {
  try {
    await runMatchingPipeline(sql, env);
  } catch (error) {
    console.error("Queued matching pipeline run failed:", error);
  }
}

async function processVisibleSynthesisJob(sql: NeonSQL, env: Env, userId: string): Promise<void> {
  const status = await getSynthesisStatus(sql, userId);
  if (status !== "pending") {
    const { needed } = await checkSynthesisNeeded(sql, userId);
    if (!needed) {
      return;
    }
  }

  try {
    await runVisibleSynthesis(sql, env, userId);
  } catch (error) {
    console.error("Queued visible synthesis failed:", error);
    await markSynthesisFailed(sql, userId).catch((markError) =>
      console.error("Failed to mark queued visible synthesis as failed:", markError)
    );
  }
}

async function processHiddenSynthesisJob(sql: NeonSQL, env: Env, userId: string): Promise<void> {
  const status = await getHiddenSynthesisStatus(sql, userId);
  if (status !== "pending") {
    const { needed } = await checkHiddenSynthesisNeeded(sql, userId);
    if (!needed) {
      return;
    }
  }

  try {
    await runHiddenSynthesis(sql, env, userId);
  } catch (error) {
    console.error("Queued hidden synthesis failed:", error);
    await markHiddenSynthesisFailed(sql, userId).catch((markError) =>
      console.error("Failed to mark queued hidden synthesis as failed:", markError)
    );
  }
}

async function processReflectionSnapshotJob(sql: NeonSQL, env: Env, userId: string): Promise<void> {
  const state = await getReflectionSnapshotState(sql, userId);
  if (state?.status !== "pending") {
    const { needed } = await checkReflectionSnapshotNeeded(sql, userId);
    if (!needed) {
      return;
    }
  }

  try {
    await runReflectionSnapshot(sql, env, userId);
  } catch (error) {
    console.error("Queued reflection snapshot failed:", error);
    await markReflectionSnapshotFailed(
      sql,
      userId,
      error instanceof Error ? error.message : "Unknown error"
    ).catch((markError) =>
      console.error("Failed to mark queued reflection snapshot as failed:", markError)
    );
  }
}

export async function processBackgroundJobsBatch(
  sql: NeonSQL,
  env: Env,
  batch: QueueBatch<BackgroundJob>
): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body;
    if (!body?.kind) {
      console.error("Skipping malformed background queue message");
      continue;
    }

    if (body.kind === "matching_run") {
      await processMatchingRunJob(sql, env);
      continue;
    }

    const userId = (body as { userId?: string }).userId;
    if (!userId) {
      console.error("Skipping malformed background queue message: missing userId");
      continue;
    }

    if (body.kind === "synthesis_visible") {
      await processVisibleSynthesisJob(sql, env, userId);
      continue;
    }

    if (body.kind === "synthesis_hidden") {
      await processHiddenSynthesisJob(sql, env, userId);
      continue;
    }

    if (body.kind === "reflection_snapshot") {
      await processReflectionSnapshotJob(sql, env, userId);
    }
  }
}
