import { jsonResponse } from "../../../src/lib/http.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import { readBearerToken, hashSessionToken } from "../_shared/auth.ts";
import { getActiveSessionByTokenHash } from "../_shared/db.ts";
import { getSoulFile, getLatestSession, isCooldownActive, getCooldownRemaining } from "../_shared/soulApp.ts";
import { emptySoulFile } from "../../../src/domain/soulFile.ts";

export async function handleGetSoulFile(_payload: unknown, request: Request) {
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
  const soulFile = await getSoulFile(userId);
  const latestSession = await getLatestSession(userId);
  const cooldownActive = isCooldownActive(latestSession);
  const cooldownRemaining = getCooldownRemaining(latestSession);

  return jsonResponse(200, {
    soul_file: soulFile ?? emptySoulFile(),
    session_count: soulFile?.session_count ?? 0,
    cooldown_active: cooldownActive,
    cooldown_remaining_ms: cooldownRemaining,
    next_available_at: latestSession?.next_available_at ?? null
  });
}

installEdgeHandler(handleGetSoulFile);
