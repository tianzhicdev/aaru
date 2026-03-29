import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { readBearerToken, hashSessionToken } from "../auth.ts";
import { getActiveSessionByTokenHash, touchDeviceSession } from "../db.ts";
import {
  getActiveSession,
  getLatestSession,
  createSoulSession,
  updateSoulSession,
  getRecentMessages,
  insertSoulMessage,
  getVisibleSoulFile,
  isSessionStale,
  autoCompleteStaleSession,
  runReflectionUpdate
} from "../soulApp.ts";
import { buildSoulSystemPrompt, buildSoulFallbackResponse, detectSoftSessionGap, shouldExtract } from "../../../src/domain/soul.ts";
import type { SoulConversationContext } from "../../../src/domain/soul.ts";
import type { ReflectionNote } from "../../../src/domain/schemas.ts";
import { SOFT_SESSION_GAP_MS } from "../../../src/domain/constants.ts";
import { streamClaude } from "../claude.ts";
import { jsonResp, sseHeaders } from "../edge.ts";
import { z } from "zod";

const soulConverseRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  session_id: z.string().uuid().optional()
});

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function handleSoulConverse(sql: NeonSQL, env: Env, request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: sseHeaders() });
  }

  // Auth
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

  // Parse body
  let body: z.infer<typeof soulConverseRequestSchema>;
  try {
    const raw = await request.json();
    body = soulConverseRequestSchema.parse(raw);
  } catch {
    return jsonResp(400, { code: 400, message: "Invalid request" });
  }

  // Get or create active session
  let activeSession = await getActiveSession(sql, userId);

  if (activeSession && isSessionStale(activeSession)) {
    await autoCompleteStaleSession(sql, activeSession);
    activeSession = null;
  }

  if (!activeSession) {
    const latestSession = await getLatestSession(sql, userId);
    const sessionNumber = (latestSession?.session_number ?? 0) + 1;
    activeSession = await createSoulSession(sql, userId, sessionNumber);
  }

  const isSessionStart = body.message === "[begin]";

  if (!isSessionStart) {
    await insertSoulMessage(sql, activeSession.id, userId, "user", body.message);
  }

  // EGRESS FIX: Use windowed messages instead of full history
  const messages = await getRecentMessages(sql, userId, activeSession.id);
  const claudeMessages = messages
    .filter((m) => m.content !== "[begin]")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content
    }));

  const exchangeCount = isSessionStart
    ? activeSession.exchange_count
    : activeSession.exchange_count + 1;

  // Detect soft session gap
  const rawMessagesWithTimestamps = messages.filter((m) => m.content !== "[begin]");
  const softSessionInfo = detectSoftSessionGap(
    rawMessagesWithTimestamps.map((m) => ({ role: m.role, content: m.content, created_at: m.created_at })),
    SOFT_SESSION_GAP_MS
  );

  if (softSessionInfo && shouldExtract(exchangeCount)) {
    await runReflectionUpdate(sql, env.ANTHROPIC_API_KEY, activeSession, userId);
  }

  const visibleSoulFile = await getVisibleSoulFile(sql, userId);

  const reflectionNotes = (activeSession.reflection_notes as ReflectionNote[] | null) ?? [];
  const latestReflection = reflectionNotes.length > 0 ? reflectionNotes[reflectionNotes.length - 1] : null;

  const context: SoulConversationContext = {
    sessionNumber: activeSession.session_number,
    exchangeCount,
    visibleSoulFile,
    reflectionNote: latestReflection,
    previousSummaries: [],
    messages: claudeMessages,
    returningAfterBreak: softSessionInfo
  };

  const systemPrompt = buildSoulSystemPrompt(context);

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";
      let streamSucceeded = false;

      try {
        const tokenStream = streamClaude(systemPrompt, claudeMessages, {
          apiKey: env.ANTHROPIC_API_KEY,
          model: "claude-opus-4-20250514",
          maxTokens: 512,
          temperature: 0.8
        });

        for await (const token of tokenStream) {
          fullResponse += token;
          controller.enqueue(
            new TextEncoder().encode(sseEvent("token", { text: token }))
          );
        }

        streamSucceeded = true;
      } catch (error) {
        console.error("Claude stream error:", error);

        try {
          fullResponse = "";
          const retryStream = streamClaude(systemPrompt, claudeMessages, {
            apiKey: env.ANTHROPIC_API_KEY,
            model: "claude-opus-4-20250514",
            maxTokens: 512,
            temperature: 0.8
          });

          for await (const token of retryStream) {
            fullResponse += token;
            controller.enqueue(
              new TextEncoder().encode(sseEvent("token", { text: token }))
            );
          }
          streamSucceeded = true;
        } catch (retryError) {
          console.error("Claude stream retry failed:", retryError);

          fullResponse = buildSoulFallbackResponse(context);
          controller.enqueue(
            new TextEncoder().encode(sseEvent("token", { text: fullResponse }))
          );
          streamSucceeded = true;
        }
      }

      if (streamSucceeded && fullResponse.length > 0) {
        const cleanedResponse = fullResponse.trim();
        try {
          await insertSoulMessage(sql, activeSession!.id, userId, "assistant", cleanedResponse);
          if (!isSessionStart) {
            await updateSoulSession(sql, activeSession!.id, {
              exchange_count: exchangeCount
            });
          }
        } catch (dbError) {
          console.error("DB write failed for soul message:", dbError);
          try {
            await insertSoulMessage(sql, activeSession!.id, userId, "assistant", cleanedResponse);
            if (!isSessionStart) {
              await updateSoulSession(sql, activeSession!.id, { exchange_count: exchangeCount });
            }
          } catch (retryDbError) {
            console.error("DB write retry failed:", retryDbError);
            controller.enqueue(
              new TextEncoder().encode(sseEvent("error", {
                type: "db_write_failure",
                message: "I lost my train of thought. Your message was saved but my response may not have been."
              }))
            );
          }
        }
      }

      controller.enqueue(
        new TextEncoder().encode(sseEvent("done", {}))
      );
      controller.close();
    }
  });

  return new Response(stream, { headers: sseHeaders() });
}
