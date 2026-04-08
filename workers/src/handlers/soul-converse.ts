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
  buildSoulFallbackResponse,
  buildSoulSystemPrompt,
  type OpeningKind,
  type SoulConversationContext
} from "../../../src/domain/soul.ts";
import { LIFE_DOMAINS } from "../../../src/domain/schemas.ts";
import { getPrompts } from "../../../src/domain/i18n/index.ts";
import { recordClaudeDebugTrace } from "../debugTraces.ts";
import { enqueueReflectionSnapshot } from "../backgroundJobsQueue.ts";
import { streamLlmText } from "../llm.ts";
import { getTaskConfig } from "../modelProfiles.ts";
import { fetchInterestNews } from "../xai.ts";
import type { XaiNewsItem } from "../../../src/domain/soul.ts";
import { jsonResp, sseHeaders } from "../edge.ts";
import { requireDeviceSession } from "../requestAuth.ts";
import { stripThinkContent } from "../openaiCompatible.ts";
import { z } from "zod";

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

function buildClaudeInputMessages(
  mode: z.infer<typeof soulConverseRequestSchema>["mode"],
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  preferredDomain: string | null,
  xaiNews: XaiNewsItem[],
  language?: string | null
): Array<{ role: "user" | "assistant"; content: string }> {
  if (mode !== "opening") {
    return messages;
  }

  const handler = getPrompts(language).handler;

  if (messages.length === 0) {
    const domainHint = preferredDomain
      ? ` ${handler.steerToward.replace("{domain}", preferredDomain)}`
      : "";
    return [{
      role: "user",
      content: handler.firstEverInstruction.replace("{domainHint}", domainHint)
    }];
  }

  const parts: string[] = [handler.returningInstruction];
  if (preferredDomain) {
    parts.push(handler.steerToward.replace("{domain}", preferredDomain));
  }
  if (xaiNews.length > 0) {
    const headlines = xaiNews.map(n => `${n.topic}: "${n.headline}"`).join("; ");
    parts.push(handler.weaveIn.replace("{headlines}", headlines));
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

export async function handleSoulConverse(sql: NeonSQL, env: Env, request: Request): Promise<Response> {
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

  const domainLabels = getPrompts(language).domains.labels;
  let preferredDomainLabel: string | null = null;
  if (openingKind === "first_ever") {
    const randomDomain = LIFE_DOMAINS[Math.floor(Math.random() * LIFE_DOMAINS.length)];
    preferredDomainLabel = domainLabels[randomDomain];
  } else {
    preferredDomainLabel = reflectionNote?.steerToTopics[0] ?? null;
  }

  const transcriptMessages = allMessages.map((message) => ({
    role: message.role,
    content: message.content
  }));

  let xaiNews: XaiNewsItem[] = [];
  if (body.mode === "opening" && env.XAI_TOKEN) {
    const topics: string[] = [];
    if (visibleSoulFile?.openThreads) {
      topics.push(...visibleSoulFile.openThreads);
    }
    if (reflectionNote?.currentThreads) {
      topics.push(...reflectionNote.currentThreads);
    }
    if (topics.length > 0) {
      try {
        xaiNews = await fetchInterestNews(topics.slice(0, 5), env.XAI_TOKEN);
      } catch (err) {
        console.warn("xAI news fetch failed, proceeding without:", err);
      }
    }
  }

  const context: SoulConversationContext = {
    visibleSoulFile,
    reflectionNote,
    messages: transcriptMessages,
    openingKind,
    xaiNews,
    language
  };

  const systemPrompt = buildSoulSystemPrompt(context);
  const claudeMessages = buildClaudeInputMessages(
    body.mode,
    transcriptMessages,
    preferredDomainLabel,
    xaiNews,
    language
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";
      let streamSucceeded = false;
      let usedFallback = false;
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
          fullResponse = buildSoulFallbackResponse(context);
          usedFallback = true;
          streamSucceeded = true;
          controller.enqueue(encoder.encode(sseEvent("token", { text: fullResponse })));
        }
      }

      if (streamSucceeded && fullResponse.trim().length > 0) {
        // Safety net: strip any leaked think-tag content before persisting
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

        const postStreamTasks = await Promise.allSettled([
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
