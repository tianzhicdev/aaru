import { jsonResponse } from "../../../src/lib/http.ts";
import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { readBearerToken, hashSessionToken } from "../auth.ts";
import { getActiveSessionByTokenHash, touchDeviceSession } from "../db.ts";
import {
  getActiveSession,
  getAllSoulMessages,
  getVisibleSoulFile,
  updateSoulSession,
  runSoulSynthesis
} from "../soulApp.ts";
import { emptyVisibleSoulFile } from "../../../src/domain/soulFile.ts";
import { REFLECTION_INTERVAL } from "../../../src/domain/constants.ts";

export async function handleEndSoulSession(sql: NeonSQL, env: Env, _payload: unknown, request: Request) {
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

  const activeSession = await getActiveSession(sql, userId);
  if (!activeSession) {
    return jsonResponse(404, { code: 404, message: "No active soul session" });
  }

  const allMessages = await getAllSoulMessages(sql, userId);
  const userMessageCount = allMessages.filter(m => m.role === "user").length;
  const existing = await getVisibleSoulFile(sql, userId);

  if (userMessageCount < REFLECTION_INTERVAL) {
    await updateSoulSession(sql, activeSession.id, {
      status: "complete",
      completed_at: new Date().toISOString()
    });
    return jsonResponse(200, {
      visible_soul_file: existing ?? emptyVisibleSoulFile(),
      session_completed: true,
      synthesis_succeeded: false
    });
  }

  const { visible, hidden } = await runSoulSynthesis(sql, env.ANTHROPIC_API_KEY, activeSession, userId);

  return jsonResponse(200, {
    visible_soul_file: visible ?? emptyVisibleSoulFile(),
    session_completed: true,
    synthesis_succeeded: visible !== null && hidden !== null
  });
}
