import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { getUserModelProfileId, getUserLanguage } from "../db.ts";
import {
  getAllSoulMessages,
  getLatestReflectionSnapshot,
  getVisibleSoulFile,
  insertSoulMessage,
  setProcessingRequestId,
  getProcessingRequestId
} from "../soulApp.ts";
import {
  buildSoulSystemPrompt,
  type SoulConversationContext
} from "../../../src/domain/soul.ts";
import { recordClaudeDebugTrace } from "../debugTraces.ts";
import { callLlmText } from "../llm.ts";
import { getTaskConfig } from "../modelProfiles.ts";
import { requireDeviceSession } from "../requestAuth.ts";
import { stripThinkContent } from "../openaiCompatible.ts";
import { jsonResponse } from "../../../src/lib/http.ts";
import {
  deriveOpeningKind,
  buildFirstEverMessage,
  buildClaudeInputMessages,
  maybeQueueReflectionSnapshot,
  runPostResponseTasks
} from "./soul-converse.ts";
import { z } from "zod";

/** Retry an async operation up to `times` attempts with linear backoff (1s, 2s, ...). */
async function withRetry<T>(times: number, label: string, fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < times; i++) {
    try {
      return await fn();
    } catch (err) {
      console.error(`${label} attempt ${i + 1}/${times} failed:`, err);
      if (i === times - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

/** Delay in ms proportional to character count, simulating human thought/typing time. */
export function responseDelay(charCount: number): number {
  const seconds = Math.max(4, Math.min(10, charCount * 0.04));
  return seconds * 1000;
}

const soulSendRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("opening")
  }),
  z.object({
    mode: z.literal("reply"),
    message: z.string().min(1).max(2000)
  })
]);

export async function handleSoulSend(
  sql: NeonSQL,
  env: Env,
  payload: unknown,
  request: Request,
  ctx?: WaitUntilContext
) {
  const auth = await requireDeviceSession(sql, request);
  if (!auth.ok) {
    return auth.error;
  }

  const userId = auth.session.user_id;

  let body: z.infer<typeof soulSendRequestSchema>;
  try {
    body = soulSendRequestSchema.parse(payload);
  } catch {
    return jsonResponse(400, { code: 400, message: "Invalid request" });
  }

  // Insert user message immediately for replies
  if (body.mode === "reply") {
    await insertSoulMessage(sql, userId, "user", body.message);
  }

  // Set processing_request_id for last-write-wins
  const requestId = crypto.randomUUID();
  await setProcessingRequestId(sql, userId, requestId);

  // Update last_active_at
  sql`UPDATE users SET last_active_at = NOW() WHERE id = ${userId}`.catch((err) =>
    console.error("Failed to update last_active_at:", err)
  );

  // Schedule background LLM processing
  const bgTask = processInBackground(sql, env, userId, body, requestId);
  if (ctx) {
    ctx.waitUntil(bgTask);
  } else {
    void bgTask;
  }

  return jsonResponse(200, { status: "accepted" });
}

async function processInBackground(
  sql: NeonSQL,
  env: Env,
  userId: string,
  body: z.infer<typeof soulSendRequestSchema>,
  requestId: string
): Promise<void> {
  try {
    const [profileId, language] = await Promise.all([
      getUserModelProfileId(sql, userId),
      getUserLanguage(sql, userId)
    ]);
    const conversationConfig = getTaskConfig(profileId, "conversation");

    const [reflectionNote, visibleSoulFile, allMessages] = await Promise.all([
      getLatestReflectionSnapshot(sql, userId),
      getVisibleSoulFile(sql, userId),
      getAllSoulMessages(sql, userId)
    ]);

    const openingKind = body.mode === "opening" ? deriveOpeningKind(allMessages) : null;

    // Notifications handle re-engagement now; skip spurious returning openings
    if (openingKind === "returning") {
      return;
    }

    // First-ever opening: hardcoded intro split into separate messages with delays
    // No request-ID check — these are hardcoded strings, not LLM calls
    if (openingKind === "first_ever") {
      const message = buildFirstEverMessage(language);
      const sentences = message.split("\n").filter((s) => s.trim().length > 0);
      for (const sentence of sentences) {
        await new Promise((resolve) => setTimeout(resolve, responseDelay(sentence.length)));
        await withRetry(3, "First-ever insert", () =>
          insertSoulMessage(sql, userId, "assistant", sentence)
        ).catch((err) => console.error("First-ever insert failed after 3 attempts:", err));
      }
      return;
    }

    const preferredDomainLabel: string | null = reflectionNote?.steerToTopics[0] ?? null;
    const transcriptMessages = allMessages.map((message) => ({
      role: message.role,
      content: message.content
    }));

    const context: SoulConversationContext = {
      visibleSoulFile,
      reflectionNote,
      messages: transcriptMessages,
      openingKind,
      language
    };

    const systemPrompt = buildSoulSystemPrompt(context);
    const claudeMessages = buildClaudeInputMessages(
      body.mode,
      transcriptMessages,
      preferredDomainLabel,
      language
    );

    const llmContext = { profileId, task: "conversation" as const, userId };
    let fullResponse = "";
    let attemptCount = 0;

    for (let i = 0; i < 5; i++) {
      attemptCount = i + 1;
      try {
        fullResponse = await callLlmText(env, conversationConfig, systemPrompt, claudeMessages, llmContext);
        break;
      } catch (error) {
        console.error(`Soul-send LLM attempt ${i + 1}/5 failed:`, error);
        if (i < 4) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        } else {
          return; // all 5 attempts failed
        }
      }
    }

    const replyContent = stripThinkContent(fullResponse.trim());
    if (!replyContent) return;

    // Last-write-wins: check if still the latest request before inserting
    const currentRequestId = await getProcessingRequestId(sql, userId);
    if (currentRequestId !== requestId) {
      console.info(`Soul-send skipped insert: request ${requestId} superseded by ${currentRequestId}`);
      return;
    }

    // Simulate human thought/typing time before message appears
    await new Promise((resolve) => setTimeout(resolve, responseDelay(replyContent.length)));

    try {
      await withRetry(3, "Soul-send DB insert", () =>
        insertSoulMessage(sql, userId, "assistant", replyContent)
      );
    } catch {
      return; // all 3 DB insert attempts failed
    }

    // Post-response tasks (reflection snapshot, debug trace)
    await runPostResponseTasks(
      sql,
      env,
      userId,
      body,
      context,
      systemPrompt,
      claudeMessages,
      conversationConfig,
      profileId,
      openingKind,
      transcriptMessages,
      fullResponse,
      attemptCount
    ).catch((err) => {
      console.error("Soul-send post-response tasks failed:", err);
    });
  } catch (error) {
    console.error("Soul-send background processing failed:", error);
  }
}
