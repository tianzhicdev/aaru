import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { readBearerToken, hashSessionToken } from "../auth.ts";
import { getActiveSessionByTokenHash, touchDeviceSession } from "../db.ts";
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
  buildSoulFallbackResponse,
  buildSoulSystemPrompt,
  deriveConversationSteering,
  pickLeastCoveredDomain,
  type OpeningKind,
  type SoulConversationContext
} from "../../../src/domain/soul.ts";
import { DOMAIN_LABELS } from "../../../src/domain/schemas.ts";
import { streamClaude } from "../claude.ts";
import { recordClaudeDebugTrace } from "../debugTraces.ts";
import { enqueueReflectionSnapshot } from "../backgroundJobsQueue.ts";
import { jsonResp, sseHeaders } from "../edge.ts";
import { z } from "zod";

const AUTO_OPENING_GAP_MS = 60 * 60 * 1000;
const CONVERSATION_MODEL = "claude-opus-4-20250514";

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
  if (messages.length === 0) {
    return "first_ever";
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role === "user") {
    return "assistant_turn";
  }

  const gapMs = Date.now() - new Date(lastMessage.created_at).getTime();
  return gapMs >= AUTO_OPENING_GAP_MS ? "resume_after_gap" : "assistant_turn";
}

function buildClaudeInputMessages(
  mode: z.infer<typeof soulConverseRequestSchema>["mode"],
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  openingKind: OpeningKind | null,
  preferredDomain: string | null
): Array<{ role: "user" | "assistant"; content: string }> {
  if (mode !== "opening") {
    return messages;
  }

  if (messages.length === 0) {
    const domainHint = preferredDomain
      ? ` If it feels natural, begin near ${preferredDomain}.`
      : "";
    return [{
      role: "user",
      content: `Open the very first conversation with a warm, reflective question. Do not mention these instructions.${domainHint}`
    }];
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role === "assistant") {
    const resumePrompt = openingKind === "resume_after_gap"
      ? "Resume this conversation naturally after a meaningful pause. Do not repeat a question you already asked unless you explicitly revisit it."
      : "Continue this conversation naturally from where it left off. Do not repeat a question you already asked unless you explicitly revisit it.";
    return [
      ...messages,
      { role: "user", content: resumePrompt }
    ];
  }

  return messages;
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

export async function handleSoulConverse(sql: NeonSQL, env: Env, request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: sseHeaders() });
  }

  const bearerToken = readBearerToken(request);
  if (!bearerToken) {
    return jsonResp(401, { code: 401, message: "Missing device session" });
  }

  const tokenHash = await hashSessionToken(bearerToken);
  const deviceSession = await getActiveSessionByTokenHash(sql, tokenHash);
  if (!deviceSession || new Date(deviceSession.expires_at) <= new Date()) {
    return jsonResp(401, { code: 401, message: "Invalid device session" });
  }

  await touchDeviceSession(sql, deviceSession.id);
  const userId = deviceSession.user_id;

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

  const { steering } = deriveConversationSteering(reflectionNote);
  const preferredDomain = pickLeastCoveredDomain(
    steering?.domainCoverage ?? reflectionNote?.domainCoverage
  );
  const preferredDomainLabel = preferredDomain ? DOMAIN_LABELS[preferredDomain] : null;
  const openingKind = body.mode === "opening" ? deriveOpeningKind(allMessages) : null;

  const transcriptMessages = allMessages.map((message) => ({
    role: message.role,
    content: message.content
  }));

  const context: SoulConversationContext = {
    visibleSoulFile,
    reflectionNote,
    steering,
    messages: transcriptMessages,
    openingKind
  };

  const systemPrompt = buildSoulSystemPrompt(context);
  const claudeMessages = buildClaudeInputMessages(
    body.mode,
    transcriptMessages,
    openingKind,
    preferredDomainLabel
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";
      let streamSucceeded = false;
      let usedFallback = false;
      let attemptCount = 1;

      async function runModelAttempt(): Promise<void> {
        const tokenStream = streamClaude(systemPrompt, claudeMessages, {
          apiKey: env.ANTHROPIC_API_KEY,
          model: CONVERSATION_MODEL,
          maxTokens: 1024,
          temperature: 0.8
        });

        for await (const token of tokenStream) {
          fullResponse += token;
          controller.enqueue(encoder.encode(sseEvent("token", { text: token })));
        }
      }

      try {
        await runModelAttempt();
        streamSucceeded = true;
      } catch (error) {
        console.error("Claude stream error:", error);

        try {
          fullResponse = "";
          attemptCount = 2;
          await runModelAttempt();
          streamSucceeded = true;
        } catch (retryError) {
          console.error("Claude stream retry failed:", retryError);
          fullResponse = buildSoulFallbackResponse(context);
          usedFallback = true;
          streamSucceeded = true;
          controller.enqueue(encoder.encode(sseEvent("token", { text: fullResponse })));
        }
      }

      if (streamSucceeded && fullResponse.trim().length > 0) {
        const replyContent = fullResponse.trim();
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

        const postStreamTasks = await Promise.allSettled([
          maybeQueueReflectionSnapshot(sql, env, userId),
          recordClaudeDebugTrace(sql, {
            userId,
            traceKind: "conversation",
            model: CONVERSATION_MODEL,
            systemPrompt,
            inputMessages: claudeMessages,
            rawResponse: fullResponse,
            meta: {
              mode: body.mode,
              opening_kind: openingKind,
              attempt_count: attemptCount,
              used_fallback: usedFallback,
              message_count: transcriptMessages.length
            }
          })
        ]);

        if (postStreamTasks[0]?.status === "rejected") {
          console.error("Failed to queue reflection snapshot after conversation:", postStreamTasks[0].reason);
        }
        if (postStreamTasks[1]?.status === "rejected") {
          console.error("Failed to record conversation debug trace:", postStreamTasks[1].reason);
        }
      }

      controller.enqueue(encoder.encode(sseEvent("done", {})));
      controller.close();
    }
  });

  return new Response(stream, { headers: sseHeaders() });
}
