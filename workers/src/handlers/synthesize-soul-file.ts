import { jsonResponse } from "../../../src/lib/http.ts";
import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { readBearerToken, hashSessionToken } from "../auth.ts";
import { getActiveSessionByTokenHash, touchDeviceSession } from "../db.ts";
import {
  getVisibleSoulFile,
  getAllSoulMessages,
  runSoulSynthesis
} from "../soulApp.ts";
import { emptyVisibleSoulFile } from "../../../src/domain/soulFile.ts";

export async function handleSynthesizeSoulFile(sql: NeonSQL, env: Env, _payload: unknown, request: Request) {
  const bearerToken = readBearerToken(request);
  if (!bearerToken) {
    return jsonResponse(401, { code: 401, message: "Missing device session" });
  }

  const tokenHash = await hashSessionToken(bearerToken);
  const session = await getActiveSessionByTokenHash(sql, tokenHash);
  if (!session || new Date(session.expires_at) <= new Date()) {
    return jsonResponse(401, { code: 401, message: "Invalid device session" });
  }

  await touchDeviceSession(sql, session.id);
  const userId = session.user_id;

  const existing = await getVisibleSoulFile(sql, userId);
  const allMessages = await getAllSoulMessages(sql, userId);

  // Need at least some user messages to synthesize
  const userMessageCount = allMessages.filter(m => m.role === "user" && m.content !== "[begin]").length;
  if (userMessageCount < 3) {
    return jsonResponse(200, {
      visible_soul_file: existing ?? emptyVisibleSoulFile(),
      synthesis_succeeded: true
    });
  }

  // Check if there are new messages since last synthesis
  const lastSoulFileTime = existing?.lastUpdated ? new Date(existing.lastUpdated).getTime() : 0;
  const hasNewMessages = allMessages.some(m => new Date(m.created_at).getTime() > lastSoulFileTime);

  if (!hasNewMessages && existing) {
    return jsonResponse(200, {
      visible_soul_file: existing,
      synthesis_succeeded: true
    });
  }

  const { visible } = await runSoulSynthesis(sql, env.ANTHROPIC_API_KEY, userId);

  return jsonResponse(200, {
    visible_soul_file: visible ?? emptyVisibleSoulFile(),
    synthesis_succeeded: visible !== null
  });
}
