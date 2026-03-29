import { jsonResponse } from "../../../src/lib/http.ts";
import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { readBearerToken, hashSessionToken } from "../auth.ts";
import { getActiveSessionByTokenHash, touchDeviceSession } from "../db.ts";
import { getVisibleSoulFile } from "../soulApp.ts";
import { emptyVisibleSoulFile } from "../../../src/domain/soulFile.ts";

/**
 * Deprecated: end-soul-session is now a no-op.
 * Sessions are thin containers — no lifecycle management.
 * Kept for backward compatibility with older app versions.
 */
export async function handleEndSoulSession(sql: NeonSQL, _env: Env, _payload: unknown, request: Request) {
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

  return jsonResponse(200, {
    visible_soul_file: existing ?? emptyVisibleSoulFile(),
    session_completed: true,
    synthesis_succeeded: true
  });
}
