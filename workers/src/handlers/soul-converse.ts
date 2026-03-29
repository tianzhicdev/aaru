import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { readBearerToken, hashSessionToken } from "../auth.ts";
import { getActiveSessionByTokenHash, touchDeviceSession } from "../db.ts";
import {
  getLastNMessages,
  getReflectionNote,
  getVisibleSoulFile,
  getHiddenSoulFile,
  insertSoulMessage,
  upsertReflectionNote,
  parseReflectionNote
} from "../soulApp.ts";
import { buildSoulSystemPrompt, buildSoulFallbackResponse } from "../../../src/domain/soul.ts";
import type { SoulConversationContext, SteeringContext } from "../../../src/domain/soul.ts";
import { streamClaude } from "../claude.ts";
import { jsonResp, sseHeaders } from "../edge.ts";
import { z } from "zod";

const soulConverseRequestSchema = z.object({
  message: z.string().min(1).max(2000)
});

const MEMORY_MARKER = "<<<MEMORY>>>";

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

  // Update last_active_at for re-engagement eligibility tracking
  sql`UPDATE users SET last_active_at = NOW() WHERE id = ${userId}`.catch((err) =>
    console.error("Failed to update last_active_at:", err)
  );

  // Parse body
  let body: z.infer<typeof soulConverseRequestSchema>;
  try {
    const raw = await request.json();
    body = soulConverseRequestSchema.parse(raw);
  } catch {
    return jsonResp(400, { code: 400, message: "Invalid request" });
  }

  // Skip [begin] messages — no longer needed, but handle gracefully
  const isBeginMessage = body.message === "[begin]";
  if (!isBeginMessage) {
    await insertSoulMessage(sql, userId, "user", body.message);
  }

  // Fetch context
  const reflectionNote = await getReflectionNote(sql, userId);
  const recentMessages = await getLastNMessages(sql, userId, 10);
  const visibleSoulFile = await getVisibleSoulFile(sql, userId);
  const hiddenSoulFile = await getHiddenSoulFile(sql, userId);

  const isFirstEver = recentMessages.filter(m => m.role === "user" && m.content !== "[begin]").length === 0
    && !isBeginMessage;

  // Build steering from hidden soul file
  const steering: SteeringContext | null = hiddenSoulFile ? {
    domainCoverage: hiddenSoulFile.depthMap.domainCoverage ?? [],
    safeEntryPoints: hiddenSoulFile.depthMap.safeEntryPoints,
    unlockTopics: hiddenSoulFile.depthMap.unlockTopics,
    avoidEarly: hiddenSoulFile.depthMap.avoidEarly,
    currentlyLiveTopics: hiddenSoulFile.depthMap.currentlyLiveTopics
  } : null;

  const claudeMessages = recentMessages
    .filter(m => m.content !== "[begin]")
    .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

  const context: SoulConversationContext = {
    visibleSoulFile,
    reflectionNote,
    steering,
    messages: claudeMessages,
    isFirstEverMessage: isFirstEver || isBeginMessage
  };

  const systemPrompt = buildSoulSystemPrompt(context);

  // Create SSE stream with <<<MEMORY>>> parsing
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";
      let lastSentIndex = 0;
      let markerFound = false;
      let streamSucceeded = false;

      try {
        const tokenStream = streamClaude(systemPrompt, claudeMessages, {
          apiKey: env.ANTHROPIC_API_KEY,
          model: "claude-opus-4-20250514",
          maxTokens: 1024,
          temperature: 0.8
        });

        for await (const token of tokenStream) {
          fullResponse += token;

          if (markerFound) continue; // Still reading memory section, don't send

          const markerIndex = fullResponse.indexOf(MEMORY_MARKER);
          if (markerIndex !== -1) {
            markerFound = true;
            // Send any unsent reply text before the marker
            const unsent = fullResponse.substring(lastSentIndex, markerIndex).trimEnd();
            if (unsent) {
              controller.enqueue(encoder.encode(sseEvent("token", { text: unsent })));
            }
            continue;
          }

          // Buffer: hold back last 15 chars in case marker is split across tokens
          const safeEnd = fullResponse.length - MEMORY_MARKER.length;
          if (safeEnd > lastSentIndex) {
            const chunk = fullResponse.substring(lastSentIndex, safeEnd);
            controller.enqueue(encoder.encode(sseEvent("token", { text: chunk })));
            lastSentIndex = safeEnd;
          }
        }

        // Flush remaining if no marker found
        if (!markerFound && lastSentIndex < fullResponse.length) {
          controller.enqueue(encoder.encode(sseEvent("token", {
            text: fullResponse.substring(lastSentIndex)
          })));
        }

        streamSucceeded = true;
      } catch (error) {
        console.error("Claude stream error:", error);

        // Retry once
        try {
          fullResponse = "";
          lastSentIndex = 0;
          markerFound = false;

          const retryStream = streamClaude(systemPrompt, claudeMessages, {
            apiKey: env.ANTHROPIC_API_KEY,
            model: "claude-opus-4-20250514",
            maxTokens: 1024,
            temperature: 0.8
          });

          for await (const token of retryStream) {
            fullResponse += token;

            if (markerFound) continue;

            const markerIndex = fullResponse.indexOf(MEMORY_MARKER);
            if (markerIndex !== -1) {
              markerFound = true;
              const unsent = fullResponse.substring(lastSentIndex, markerIndex).trimEnd();
              if (unsent) {
                controller.enqueue(encoder.encode(sseEvent("token", { text: unsent })));
              }
              continue;
            }

            const safeEnd = fullResponse.length - MEMORY_MARKER.length;
            if (safeEnd > lastSentIndex) {
              const chunk = fullResponse.substring(lastSentIndex, safeEnd);
              controller.enqueue(encoder.encode(sseEvent("token", { text: chunk })));
              lastSentIndex = safeEnd;
            }
          }

          if (!markerFound && lastSentIndex < fullResponse.length) {
            controller.enqueue(encoder.encode(sseEvent("token", {
              text: fullResponse.substring(lastSentIndex)
            })));
          }

          streamSucceeded = true;
        } catch (retryError) {
          console.error("Claude stream retry failed:", retryError);

          fullResponse = buildSoulFallbackResponse(context);
          markerFound = false;
          controller.enqueue(encoder.encode(sseEvent("token", { text: fullResponse })));
          streamSucceeded = true;
        }
      }

      // Save message and reflection note
      if (streamSucceeded && fullResponse.length > 0) {
        // Extract reply content (before marker) and memory content (after marker)
        const replyContent = markerFound
          ? fullResponse.substring(0, fullResponse.indexOf(MEMORY_MARKER)).trim()
          : fullResponse.trim();

        const memoryContent = markerFound
          ? fullResponse.substring(fullResponse.indexOf(MEMORY_MARKER) + MEMORY_MARKER.length).trim()
          : null;

        // Save assistant reply (without memory section)
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

        // Parse and save updated reflection note
        if (memoryContent) {
          try {
            const parsed = parseReflectionNote(memoryContent);
            if (parsed) {
              await upsertReflectionNote(sql, userId, parsed);
            }
          } catch (noteError) {
            console.error("Failed to save reflection note:", noteError);
          }
        }
      }

      controller.enqueue(encoder.encode(sseEvent("done", {})));
      controller.close();
    }
  });

  return new Response(stream, { headers: sseHeaders() });
}
