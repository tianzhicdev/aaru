import { jsonResponse } from "../../../src/lib/http.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import { readBearerToken, hashSessionToken } from "../_shared/auth.ts";
import { getActiveSessionByTokenHash } from "../_shared/db.ts";
import { getHiddenSoulFile, getActiveSession, getVisibleSoulFile } from "../_shared/soulApp.ts";

export async function handleGetDebugInfo(_payload: unknown, request: Request) {
  const bearerToken = readBearerToken(request);
  if (!bearerToken) {
    return jsonResponse(401, { code: 401, message: "Missing device session" });
  }

  const tokenHash = await hashSessionToken(bearerToken);
  const session = await getActiveSessionByTokenHash(tokenHash);
  if (!session || new Date(session.expires_at) <= new Date()) {
    return jsonResponse(401, { code: 401, message: "Invalid device session" });
  }

  const userId = session.user_id;

  const [hiddenSoulFile, activeSoulSession, visibleSoulFile] = await Promise.all([
    getHiddenSoulFile(userId),
    getActiveSession(userId),
    getVisibleSoulFile(userId)
  ]);

  return jsonResponse(200, {
    user_id: userId,
    device_id: session.device_id,
    hidden_soul_file: hiddenSoulFile,
    visible_soul_file: visibleSoulFile,
    active_session: activeSoulSession ? {
      id: activeSoulSession.id,
      session_number: activeSoulSession.session_number,
      status: activeSoulSession.status,
      exchange_count: activeSoulSession.exchange_count,
      started_at: activeSoulSession.started_at
    } : null
  });
}

installEdgeHandler(handleGetDebugInfo);
