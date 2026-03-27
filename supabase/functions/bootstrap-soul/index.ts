import { jsonResponse } from "../../../src/lib/http.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import { readBearerToken, hashSessionToken } from "../_shared/auth.ts";
import { getActiveSessionByTokenHash, touchDeviceSession, ensureUser } from "../_shared/db.ts";
import { issueSessionToken } from "../_shared/auth.ts";
import { createDeviceSession, revokeSessionsForDevice } from "../_shared/db.ts";
import {
  bootstrapSoulState,
  createSoulSession
} from "../_shared/soulApp.ts";
import { emptyVisibleSoulFile } from "../../../src/domain/soulFile.ts";
import { z } from "zod";

const bootstrapSoulRequestSchema = z.object({
  device_id: z.string().min(1)
});

export async function handleBootstrapSoul(payload: unknown, request: Request) {
  const body = bootstrapSoulRequestSchema.parse(payload);

  // Try existing session first
  const bearerToken = readBearerToken(request);
  let userId: string | null = null;

  if (bearerToken) {
    const tokenHash = await hashSessionToken(bearerToken);
    const session = await getActiveSessionByTokenHash(tokenHash);
    if (session && new Date(session.expires_at) > new Date()) {
      await touchDeviceSession(session.id);
      userId = session.user_id;
    }
  }

  // No valid session — create user + new session
  let token: string | undefined;
  if (!userId) {
    const user = await ensureUser(body.device_id);
    userId = user.id;

    await revokeSessionsForDevice(userId, body.device_id);
    const issued = await issueSessionToken(userId, body.device_id);
    await createDeviceSession(userId, body.device_id, issued.tokenHash, issued.expiresAt);
    token = issued.token;
  }

  const state = await bootstrapSoulState(userId);

  return jsonResponse(200, {
    user_id: userId,
    ...(token ? { token } : {}),
    soul_file: state.soulFile,
    visible_soul_file: state.visibleSoulFile ?? emptyVisibleSoulFile(),
    active_session: state.activeSession ? {
      id: state.activeSession.id,
      session_number: state.activeSession.session_number,
      exchange_count: state.activeSession.exchange_count,
      status: state.activeSession.status
    } : null,
    can_start_session: state.canStartSession,
    cooldown_remaining_ms: state.cooldownRemainingMs,
    next_session_number: state.nextSessionNumber
  });
}

installEdgeHandler(handleBootstrapSoul);
