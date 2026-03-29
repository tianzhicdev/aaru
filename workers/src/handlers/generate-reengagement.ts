import { jsonResponse } from "../../../src/lib/http.ts";
import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { readBearerToken, hashSessionToken } from "../auth.ts";
import { getActiveSessionByTokenHash, touchDeviceSession } from "../db.ts";
import {
  getVisibleSoulFile,
  getHiddenSoulFile,
  getLastNMessages
} from "../soulApp.ts";
import { callClaude } from "../claude.ts";
import {
  buildReengagementPrompt,
  parseReengagementQuestion,
  getReengagementFallback
} from "../../../src/domain/reengagement.ts";

export async function handleGenerateReengagement(sql: NeonSQL, env: Env, _payload: unknown, request: Request) {
  const bearerToken = readBearerToken(request);
  if (!bearerToken) {
    return jsonResponse(401, { message: "Missing device session" });
  }

  const tokenHash = await hashSessionToken(bearerToken);
  const session = await getActiveSessionByTokenHash(sql, tokenHash);
  if (!session || new Date(session.expires_at) <= new Date()) {
    return jsonResponse(401, { message: "Invalid device session" });
  }

  await touchDeviceSession(sql, session.id);
  const userId = session.user_id;

  // Load user context for personalization
  const hiddenSoulFile = await getHiddenSoulFile(sql, userId);
  const visibleSoulFile = await getVisibleSoulFile(sql, userId);

  const lastMessages = await getLastNMessages(sql, userId, 5);
  const recentMessages = lastMessages
    .filter((m: { content: string }) => m.content !== "[begin]")
    .map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }));

  // Generate personalized question via Haiku
  let question = getReengagementFallback(userId);

  if (hiddenSoulFile || visibleSoulFile) {
    try {
      const prompt = buildReengagementPrompt(hiddenSoulFile, visibleSoulFile, recentMessages);
      const raw = await callClaude(
        "You are a soul-exploration companion. Output valid JSON only.",
        [{ role: "user", content: prompt }],
        { apiKey: env.ANTHROPIC_API_KEY, model: "claude-haiku-4-5-20251001", maxTokens: 512, temperature: 0.7 }
      );
      const parsed = parseReengagementQuestion(raw);
      if (parsed) {
        question = parsed;
      }
    } catch (error) {
      console.error(`Reengagement generation failed for ${userId}, using fallback:`, error);
    }
  }

  return jsonResponse(200, { question: question.fullQuestion });
}
