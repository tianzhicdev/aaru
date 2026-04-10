import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { getUserModelProfileId, getUserLanguage } from "../db.ts";
import {
  checkReflectionSnapshotNeeded,
  getAllSoulMessages,
  getLatestReflectionSnapshot,
  getVisibleSoulFile,
  insertSoulMessage,
  markReflectionSnapshotPending,
  type SoulMessageRow
} from "../soulApp.ts";
import {
  buildSoulSystemPrompt,
  type OpeningKind,
  type SoulConversationContext
} from "../../../src/domain/soul.ts";
import { PHASE_CONFIGS } from "../../../src/domain/schemas.ts";
import { getPrompts } from "../../../src/domain/i18n/index.ts";
import { recordClaudeDebugTrace } from "../debugTraces.ts";
import { enqueueReflectionSnapshot } from "../backgroundJobsQueue.ts";
import { callLlmText, streamLlmText } from "../llm.ts";
import { getTaskConfig, type ModelProfileId } from "../modelProfiles.ts";
import { jsonResp, sseHeaders } from "../edge.ts";
import { requireDeviceSession } from "../requestAuth.ts";
import { stripThinkContent } from "../openaiCompatible.ts";
import { z } from "zod";

interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

const soulConverseRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("opening")
  }),
  z.object({
    mode: z.literal("reply"),
    message: z.string().min(1).max(2000)
  })
]);

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function deriveOpeningKind(messages: SoulMessageRow[]): OpeningKind {
  return messages.length === 0 ? "first_ever" : "returning";
}

function buildFirstEverMessage(language?: string | null): string {
  const prompts = getPrompts(language);
  const sparkDomains = PHASE_CONFIGS.spark.allowedDomains;
  const randomDomain = sparkDomains[Math.floor(Math.random() * sparkDomains.length)];
  const pool = prompts.domains.openingPool[randomDomain];
  const question = pool[Math.floor(Math.random() * pool.length)];
  return `${prompts.handler.firstEverIntro}\n\n${question}`;
}

function buildClaudeInputMessages(
  mode: z.infer<typeof soulConverseRequestSchema>["mode"],
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  preferredDomain: string | null,
  language?: string | null
): Array<{ role: "user" | "assistant"; content: string }> {
  if (mode !== "opening") {
    return messages;
  }

  const handler = getPrompts(language).handler;

  const parts: string[] = [handler.returningInstruction];
  if (preferredDomain) {
    parts.push(handler.steerToward.replace("{domain}", preferredDomain));
  }
  parts.push(handler.doNotRepeat);

  return [
    ...messages,
    { role: "user", content: parts.join(" ") }
  ];
}

async function maybeQueueReflectionSnapshot(sql: NeonSQL, env: Env, userId: string): Promise<void> {
  const state = await checkReflectionSnapshotNeeded(sql, userId);
  if (!state.needed || state.pending) {
    return;
  }

  const claimed = await markReflectionSnapshotPending(
    sql,
    userId,
    state.totalMessageCount,
    state.lastMessageCreatedAt
  );
  if (!claimed) {
    return;
  }

  await enqueueReflectionSnapshot(env.BACKGROUND_QUEUE, userId, state.totalMessageCount);
}

export async function handleSoulConverse(
  sql: NeonSQL,
  env: Env,
  request: Request,
  ctx?: WaitUntilContext
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: sseHeaders() });
  }

  const auth = await requireDeviceSession(sql, request);
  if (!auth.ok) {
    return jsonResp(auth.error.status, auth.error.body);
  }

  const userId = auth.session.user_id;
  const [profileId, language] = await Promise.all([
    getUserModelProfileId(sql, userId),
    getUserLanguage(sql, userId)
  ]);
  const conversationConfig = getTaskConfig(profileId, "conversation");

  sql`UPDATE users SET last_active_at = NOW() WHERE id = ${userId}`.catch((err) =>
    console.error("Failed to update last_active_at:", err)
  );

  let body: z.infer<typeof soulConverseRequestSchema>;
  try {
    body = soulConverseRequestSchema.parse(await request.json());
  } catch {
    return jsonResp(400, { code: 400, message: "Invalid request" });
  }

  if (body.mode === "reply") {
    await insertSoulMessage(sql, userId, "user", body.message);
  }

  const [reflectionNote, visibleSoulFile, allMessages] = await Promise.all([
    getLatestReflectionSnapshot(sql, userId),
    getVisibleSoulFile(sql, userId),
    getAllSoulMessages(sql, userId)
  ]);

  const openingKind = body.mode === "opening" ? deriveOpeningKind(allMessages) : null;

  // First-ever opening: hardcoded intro + random question, no LLM call
  if (openingKind === "first_ever") {
    const message = buildFirstEverMessage(language);
    await insertSoulMessage(sql, userId, "assistant", message);
    return jsonResp(200, { role: "assistant", content: message });
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

  const acceptHeader = request.headers.get("Accept") || "";
  const wantsJson = acceptHeader.includes("application/json");

  if (wantsJson) {
    return handleJsonMode(sql, env, userId, body, context, systemPrompt, claudeMessages, conversationConfig, profileId, openingKind, transcriptMessages, ctx);
  }

  return handleSseMode(sql, env, userId, body, context, systemPrompt, claudeMessages, conversationConfig, profileId, openingKind, transcriptMessages, ctx);
}

async function handleJsonMode(
  sql: NeonSQL,
  env: Env,
  userId: string,
  body: z.infer<typeof soulConverseRequestSchema>,
  context: SoulConversationContext,
  systemPrompt: string,
  claudeMessages: Array<{ role: "user" | "assistant"; content: string }>,
  conversationConfig: ReturnType<typeof getTaskConfig>,
  profileId: ModelProfileId,
  openingKind: OpeningKind | null,
  transcriptMessages: Array<{ role: "user" | "assistant"; content: string }>,
  ctx?: WaitUntilContext
): Promise<Response> {
  const llmContext = { profileId, task: "conversation" as const, userId };
  let fullResponse = "";
  let attemptCount = 1;

  try {
    fullResponse = await callLlmText(env, conversationConfig, systemPrompt, claudeMessages, llmContext);
  } catch (error) {
    console.error("Conversation call error:", error);
    try {
      attemptCount = 2;
      fullResponse = await callLlmText(env, conversationConfig, systemPrompt, claudeMessages, llmContext);
    } catch (retryError) {
      console.error("Conversation call retry failed:", retryError);
      return jsonResp(503, { code: 503, message: "Service temporarily unavailable" });
    }
  }

  const replyContent = stripThinkContent(fullResponse.trim());
  if (!replyContent) {
    return jsonResp(503, { code: 503, message: "Service temporarily unavailable" });
  }

  try {
    await insertSoulMessage(sql, userId, "assistant", replyContent);
  } catch (dbError) {
    console.error("DB write failed for soul message:", dbError);
    try {
      await insertSoulMessage(sql, userId, "assistant", replyContent);
    } catch (retryDbError) {
      console.error("DB write retry failed:", retryDbError);
    }
  }

  schedulePostResponseTasks(
    ctx,
    runPostResponseTasks(
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
    )
  );

  return jsonResp(200, { role: "assistant", content: replyContent });
}

async function handleSseMode(
  sql: NeonSQL,
  env: Env,
  userId: string,
  body: z.infer<typeof soulConverseRequestSchema>,
  context: SoulConversationContext,
  systemPrompt: string,
  claudeMessages: Array<{ role: "user" | "assistant"; content: string }>,
  conversationConfig: ReturnType<typeof getTaskConfig>,
  profileId: ModelProfileId,
  openingKind: OpeningKind | null,
  transcriptMessages: Array<{ role: "user" | "assistant"; content: string }>,
  ctx?: WaitUntilContext
): Promise<Response> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";
      let streamSucceeded = false;
      let attemptCount = 1;

      async function runModelAttempt(): Promise<void> {
        const tokenStream = streamLlmText(
          env,
          conversationConfig,
          systemPrompt,
          claudeMessages,
          {
            profileId,
            task: "conversation",
            userId
          }
        );

        for await (const token of tokenStream) {
          fullResponse += token;
          controller.enqueue(encoder.encode(sseEvent("token", { text: token })));
        }
      }

      try {
        await runModelAttempt();
        streamSucceeded = true;
      } catch (error) {
        console.error("Conversation stream error:", error);

        try {
          fullResponse = "";
          attemptCount = 2;
          await runModelAttempt();
          streamSucceeded = true;
        } catch (retryError) {
          console.error("Conversation stream retry failed:", retryError);
          controller.enqueue(encoder.encode(sseEvent("error", {
            type: "llm_failure",
            message: "Service temporarily unavailable"
          })));
        }
      }

      if (streamSucceeded && fullResponse.trim().length > 0) {
        const replyContent = stripThinkContent(fullResponse.trim());
        try {
          await insertSoulMessage(sql, userId, "assistant", replyContent);
        } catch (dbError) {
          console.error("DB write failed for soul message:", dbError);
          try {
            await insertSoulMessage(sql, userId, "assistant", replyContent);
          } catch (retryDbError) {
            console.error("DB write retry failed:", retryDbError);
            controller.enqueue(encoder.encode(sseEvent("error", {
              type: "db_write_failure",
              message: "I lost my train of thought. Your message was saved but my response may not have been."
            })));
          }
        }

        schedulePostResponseTasks(
          ctx,
          runPostResponseTasks(
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
          )
        );
      }

      controller.enqueue(encoder.encode(sseEvent("done", {})));
      controller.close();
    }
  });

  return new Response(stream, { headers: sseHeaders() });
}

function schedulePostResponseTasks(
  ctx: WaitUntilContext | undefined,
  task: Promise<void>
): void {
  if (ctx) {
    ctx.waitUntil(task);
    return;
  }

  void task;
}

async function runPostResponseTasks(
  sql: NeonSQL,
  env: Env,
  userId: string,
  body: z.infer<typeof soulConverseRequestSchema>,
  _context: SoulConversationContext,
  systemPrompt: string,
  claudeMessages: Array<{ role: "user" | "assistant"; content: string }>,
  conversationConfig: ReturnType<typeof getTaskConfig>,
  profileId: ModelProfileId,
  openingKind: OpeningKind | null,
  transcriptMessages: Array<{ role: "user" | "assistant"; content: string }>,
  fullResponse: string,
  attemptCount: number
): Promise<void> {
  const results = await Promise.allSettled([
    maybeQueueReflectionSnapshot(sql, env, userId),
    recordClaudeDebugTrace(sql, env, {
      userId,
      traceKind: "conversation",
      model: conversationConfig.model,
      systemPrompt,
      inputMessages: claudeMessages,
      rawResponse: fullResponse,
      meta: {
        provider: conversationConfig.provider,
        model_profile_id: profileId,
        mode: body.mode,
        opening_kind: openingKind,
        attempt_count: attemptCount,
        message_count: transcriptMessages.length
      }
    })
  ]);

  if (results[0]?.status === "rejected") {
    console.error("Failed to queue reflection snapshot after conversation:", results[0].reason);
  }
  if (results[1]?.status === "rejected") {
    console.error("Failed to record conversation debug trace:", results[1].reason);
  }
}
