import { jsonResponse } from "../../../src/lib/http.ts";
import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { readBearerToken, hashSessionToken, issueSessionToken } from "../auth.ts";
import { getActiveSessionByTokenHash, touchDeviceSession, ensureUser, createDeviceSession, revokeSessionsForDevice } from "../db.ts";
import { bootstrapSoulState, getCurrentSessionMessages } from "../soulApp.ts";
import { emptyVisibleSoulFile } from "../../../src/domain/soulFile.ts";
import { z } from "zod";

const bootstrapSoulRequestSchema = z.object({
  device_id: z.string().min(1)
});

export async function handleBootstrapSoul(sql: NeonSQL, env: Env, payload: unknown, request: Request) {
  const body = bootstrapSoulRequestSchema.parse(payload);

  // Try existing session first
  const bearerToken = readBearerToken(request);
  let userId: string | null = null;

  if (bearerToken) {
    const tokenHash = await hashSessionToken(bearerToken);
    const session = await getActiveSessionByTokenHash(sql, tokenHash);
    if (session && new Date(session.expires_at) > new Date()) {
      await touchDeviceSession(sql, session.id);
      userId = session.user_id;
    }
  }

  // No valid session — create user + new session
  let token: string | undefined;
  if (!userId) {
    const user = await ensureUser(sql, body.device_id);
    userId = user.id;

    await revokeSessionsForDevice(sql, userId, body.device_id);
    const issued = await issueSessionToken(userId, body.device_id, env.THUMOS_SESSION_SECRET);
    await createDeviceSession(sql, userId, body.device_id, issued.tokenHash, issued.expiresAt);
    token = issued.token;
  }

  const state = await bootstrapSoulState(sql, userId);

  // EGRESS FIX: Only load current session messages instead of all history
  let messages: Array<{ role: string; content: string }> = [];
  if (state.activeSession) {
    const sessionMsgs = await getCurrentSessionMessages(sql, state.activeSession.id);
    messages = sessionMsgs
      .filter((m) => m.content !== "[begin]")
      .map((m) => ({ role: m.role, content: m.content }));
  }

  return jsonResponse(200, {
    user_id: userId,
    ...(token ? { token } : {}),
    visible_soul_file: state.visibleSoulFile ?? emptyVisibleSoulFile(),
    active_session: state.activeSession ? {
      id: state.activeSession.id,
      session_number: state.activeSession.session_number,
      exchange_count: state.activeSession.exchange_count,
      status: state.activeSession.status
    } : null,
    ...(messages.length > 0 ? { messages } : {}),
    can_start_session: state.canStartSession,
    cooldown_remaining_ms: state.cooldownRemainingMs,
    next_session_number: state.nextSessionNumber
  });
}
