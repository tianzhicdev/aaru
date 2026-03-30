import type { NeonSQL } from "./db.ts";
import type { Env } from "./env.ts";
import {
  checkReflectionSnapshotNeeded,
  checkSynthesisNeeded,
  getReflectionSnapshotState,
  getSynthesisStatus,
  markReflectionSnapshotFailed,
  markSynthesisFailed,
  runReflectionSnapshot,
  runSoulSynthesis
} from "./soulApp.ts";

export interface SoulSynthesisJob {
  kind: "soul_synthesis";
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

export type BackgroundJob = SoulSynthesisJob | ReflectionSnapshotJob;

export interface BackgroundQueueBinding {
  send(message: BackgroundJob): Promise<void>;
}

export interface QueueMessage<T> {
  body: T;
}

export interface QueueBatch<T> {
  messages: Array<QueueMessage<T>>;
}

export async function enqueueSoulSynthesis(
  queue: BackgroundQueueBinding,
  userId: string
): Promise<SoulSynthesisJob> {
  const job: SoulSynthesisJob = {
    kind: "soul_synthesis",
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

async function processSoulSynthesisJob(sql: NeonSQL, env: Env, userId: string): Promise<void> {
  const status = await getSynthesisStatus(sql, userId);
  if (status !== "pending") {
    const { needed } = await checkSynthesisNeeded(sql, userId);
    if (!needed) {
      return;
    }
  }

  try {
    await runSoulSynthesis(sql, env.ANTHROPIC_API_KEY, userId);
  } catch (error) {
    console.error("Queued soul synthesis failed:", error);
    await markSynthesisFailed(sql, userId).catch((markError) =>
      console.error("Failed to mark queued synthesis as failed:", markError)
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
    await runReflectionSnapshot(sql, env.ANTHROPIC_API_KEY, userId);
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
    const userId = body?.userId;
    if (!userId || !body?.kind) {
      console.error("Skipping malformed background queue message");
      continue;
    }

    if (body.kind === "soul_synthesis") {
      await processSoulSynthesisJob(sql, env, userId);
      continue;
    }

    if (body.kind === "reflection_snapshot") {
      await processReflectionSnapshotJob(sql, env, userId);
    }
  }
}
