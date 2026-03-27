import { readBearerToken, hashSessionToken } from "../_shared/auth.ts";
import { getActiveSessionByTokenHash, touchDeviceSession } from "../_shared/db.ts";
import {
  getActiveSession,
  getLatestSession,
  createSoulSession,
  updateSoulSession,
  getAllSoulMessages,
  insertSoulMessage,
  getVisibleSoulFile,
  isSessionStale,
  autoCompleteStaleSession
} from "../_shared/soulApp.ts";
import { buildSoulSystemPrompt, buildSoulFallbackResponse } from "../../../src/domain/soul.ts";
import type { SoulConversationContext } from "../../../src/domain/soul.ts";
import type { ReflectionNote } from "../../../src/domain/schemas.ts";
import { streamClaude } from "../_shared/claude.ts";
import { z } from "zod";

declare const Deno: {
  serve(handler: (request: Request) => Response | Promise<Response>): void;
} | undefined;

const soulConverseRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  session_id: z.string().uuid().optional()
});

const sseHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-aaru-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function handleSoulConverse(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: sseHeaders });
  }

  // Auth
  const bearerToken = readBearerToken(request);
  if (!bearerToken) {
    return new Response(
      JSON.stringify({ code: 401, message: "Missing device session" }),
      { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }

  const tokenHash = await hashSessionToken(bearerToken);
  const deviceSession = await getActiveSessionByTokenHash(tokenHash);
  if (!deviceSession || new Date(deviceSession.expires_at) <= new Date()) {
    return new Response(
      JSON.stringify({ code: 401, message: "Invalid device session" }),
      { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }

  await touchDeviceSession(deviceSession.id);
  const userId = deviceSession.user_id;

  // Parse body
  let body: z.infer<typeof soulConverseRequestSchema>;
  try {
    const raw = await request.json();
    body = soulConverseRequestSchema.parse(raw);
  } catch {
    return new Response(
      JSON.stringify({ code: 400, message: "Invalid request" }),
      { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }

  // Get or create active session (no cooldown check — continuous conversation)
  let activeSession = await getActiveSession(userId);

  // Handle stale sessions
  if (activeSession && isSessionStale(activeSession)) {
    await autoCompleteStaleSession(activeSession);
    activeSession = null;
  }

  if (!activeSession) {
    const latestSession = await getLatestSession(userId);
    const sessionNumber = (latestSession?.session_number ?? 0) + 1;
    activeSession = await createSoulSession(userId, sessionNumber);
  }

  // Session start trigger — don't save the protocol marker as a user message
  const isSessionStart = body.message === "[begin]";

  if (!isSessionStart) {
    await insertSoulMessage(activeSession.id, userId, "user", body.message);
  }

  // Load full conversation history across all sessions
  const messages = await getAllSoulMessages(userId);
  const claudeMessages = messages
    .filter((m) => m.content !== "[begin]")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content
    }));

  const visibleSoulFile = await getVisibleSoulFile(userId);
  const exchangeCount = isSessionStart
    ? activeSession.exchange_count
    : activeSession.exchange_count + 1;

  // Get latest reflection note from session
  const reflectionNotes = (activeSession.reflection_notes as ReflectionNote[] | null) ?? [];
  const latestReflection = reflectionNotes.length > 0 ? reflectionNotes[reflectionNotes.length - 1] : null;

  const context: SoulConversationContext = {
    sessionNumber: activeSession.session_number,
    exchangeCount,
    visibleSoulFile,
    reflectionNote: latestReflection,
    previousSummaries: [],
    messages: claudeMessages
  };

  const systemPrompt = buildSoulSystemPrompt(context);

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";
      let streamSucceeded = false;

      try {
        // Stream from Claude
        const tokenStream = streamClaude(systemPrompt, claudeMessages, {
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

        // Retry once
        try {
          fullResponse = "";
          const retryStream = streamClaude(systemPrompt, claudeMessages, {
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

          // Use fallback response
          fullResponse = buildSoulFallbackResponse(context);
          controller.enqueue(
            new TextEncoder().encode(sseEvent("token", { text: fullResponse }))
          );
          streamSucceeded = true;
        }
      }

      if (streamSucceeded && fullResponse.length > 0) {
        // Save assistant message (cleaned of any markers)
        const cleanedResponse = fullResponse.trim();
        try {
          await insertSoulMessage(activeSession!.id, userId, "assistant", cleanedResponse);
          if (!isSessionStart) {
            await updateSoulSession(activeSession!.id, {
              exchange_count: exchangeCount
            });
          }
        } catch (dbError) {
          console.error("DB write failed for soul message:", dbError);
          // Retry once
          try {
            await insertSoulMessage(activeSession!.id, userId, "assistant", cleanedResponse);
            if (!isSessionStart) {
              await updateSoulSession(activeSession!.id, { exchange_count: exchangeCount });
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

  return new Response(stream, { headers: sseHeaders });
}

if (typeof Deno !== "undefined") {
  Deno.serve(handleSoulConverse);
}

export { handleSoulConverse };
