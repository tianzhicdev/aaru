import type { NeonSQL } from "./db.ts";
import type { Env } from "./env.ts";
import { runMatchingPipeline, runMatchingPipelineForUser } from "./matchingPipeline.ts";
import { getMatchById, updateMatchReasoning } from "./matchApp.ts";
import { buildUserReasoningPrompt, observerResultSchema, type ObserverResult } from "../../src/domain/matchSimulation.ts";
import { callLlmText } from "./llm.ts";
import { defaultModelProfileIdFromEnv, getTaskConfig } from "./modelProfiles.ts";
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

export interface MatchReasoningJob {
  kind: "match_reasoning";
  jobId: string;
  matchId: string;
  userId: string;
  otherDisplayName: string;
  side: "a" | "b";
  language: string;
  queuedAt: string;
}

export interface MatchingScanUserJob {
  kind: "matching_scan_user";
  jobId: string;
  userId: string;
  queuedAt: string;
}

export type BackgroundJob =
  | SynthesisVisibleJob
  | SynthesisHiddenJob
  | ReflectionSnapshotJob
  | MatchingRunJob
  | MatchReasoningJob
  | MatchingScanUserJob;

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

export async function enqueueMatchReasoning(
  queue: BackgroundQueueBinding,
  matchId: string,
  userId: string,
  otherDisplayName: string,
  side: "a" | "b",
  language: string
): Promise<MatchReasoningJob> {
  const job: MatchReasoningJob = {
    kind: "match_reasoning",
    jobId: crypto.randomUUID(),
    matchId,
    userId,
    otherDisplayName,
    side,
    language,
    queuedAt: new Date().toISOString()
  };
  await queue.send(job);
  return job;
}

export async function enqueueMatchingScanUser(
  queue: BackgroundQueueBinding,
  userId: string
): Promise<MatchingScanUserJob> {
  const job: MatchingScanUserJob = {
    kind: "matching_scan_user",
    jobId: crypto.randomUUID(),
    userId,
    queuedAt: new Date().toISOString()
  };
  await queue.send(job);
  return job;
}

const REASONING_OPENER = "In a world where your souls could meet, ";

/** Extract the body text from LLM output, stripping any chain-of-thought or accidental opener. */
function extractFinalReasoning(raw: string): string {
  let text = raw.trim();

  // Strip any chain-of-thought before the actual message
  const metaPatterns = [
    /\n\n(?:I like|Let me|This |That |Hmm|Check|---|\d+\.|✓|- )/,
    /\n\n(?:I need|I want|This feels|This captures|Looking at)/
  ];

  // Take the last meaningful paragraph if there are multiple
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length > 1) {
    // Find the last paragraph that isn't meta-commentary
    for (let i = paragraphs.length - 1; i >= 0; i--) {
      const isMetaComment = metaPatterns.some(p => p.test("\n\n" + paragraphs[i]));
      if (!isMetaComment) {
        text = paragraphs[i];
        break;
      }
    }
  }

  // Strip any accidental opener the LLM may have included despite instructions
  const openerVariants = [
    /^In a world where your souls could meet,?\s*/i,
    /^In a world where[^,]*,\s*/i,
    /^Imagine a world where[^,]*,\s*/i
  ];
  for (const pattern of openerVariants) {
    text = text.replace(pattern, "");
  }

  // Prepend the hardcoded opener
  return REASONING_OPENER + text;
}

async function processMatchReasoningJob(sql: NeonSQL, env: Env, job: MatchReasoningJob): Promise<void> {
  try {
    console.log(`Match reasoning: processing match=${job.matchId} side=${job.side} user=${job.userId}`);
    const match = await getMatchById(sql, job.matchId);
    if (!match?.raw_evaluation) {
      console.error(`Match reasoning: no raw_evaluation for match ${job.matchId}. match found: ${!!match}`);
      return;
    }

    const rawEval = typeof match.raw_evaluation === "string"
      ? JSON.parse(match.raw_evaluation)
      : match.raw_evaluation;
    const parsed = observerResultSchema.safeParse(rawEval);
    if (!parsed.success) {
      console.error(`Match reasoning: invalid raw_evaluation for match ${job.matchId}:`, parsed.error.message);
      return;
    }

    const profileId = defaultModelProfileIdFromEnv(env);
    const config = getTaskConfig(profileId, "match_reasoning");
    const context = { profileId, task: "match_reasoning" as const };
    const prompt = buildUserReasoningPrompt(parsed.data, job.otherDisplayName, job.language);

    const rawReasoning = await callLlmText(
      env,
      config,
      prompt,
      [{ role: "user", content: "Write the match reasoning message." }],
      context
    );

    // Strip chain-of-thought: extract the final "In a world where..." message
    const reasoning = extractFinalReasoning(rawReasoning);
    console.log(`Match reasoning: generated ${reasoning.length} chars for match=${job.matchId} side=${job.side}`);
    await updateMatchReasoning(sql, job.matchId, job.side, reasoning);
    console.log(`Match reasoning: saved for match=${job.matchId} side=${job.side}`);
  } catch (error) {
    console.error(`Match reasoning job failed for match ${job.matchId}:`, error);
  }
}

async function processMatchingScanUserJob(sql: NeonSQL, env: Env, userId: string): Promise<void> {
  try {
    await runMatchingPipelineForUser(sql, env, userId);
  } catch (error) {
    console.error(`Matching scan for user ${userId} failed:`, error);
  }
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
      continue;
    }

    if (body.kind === "match_reasoning") {
      await processMatchReasoningJob(sql, env, body as MatchReasoningJob);
      continue;
    }

    if (body.kind === "matching_scan_user") {
      await processMatchingScanUserJob(sql, env, userId);
      continue;
    }
  }
}
