import { jsonResponse } from "../../../src/lib/http.ts";
import type { NeonSQL } from "../db.ts";
import { readBearerToken, hashSessionToken } from "../auth.ts";
import { getActiveSessionByTokenHash, deleteUser } from "../db.ts";

export async function handleDeleteAccount(sql: NeonSQL, _payload: unknown, request: Request) {
  const bearerToken = readBearerToken(request);
  if (!bearerToken) {
    return jsonResponse(401, { code: 401, message: "Missing device session" });
  }

  const tokenHash = await hashSessionToken(bearerToken);
  const session = await getActiveSessionByTokenHash(sql, tokenHash);
  if (!session || new Date(session.expires_at) <= new Date()) {
    return jsonResponse(401, { code: 401, message: "Invalid device session" });
  }

  const userId = session.user_id;

  // CASCADE handles device_sessions, soul_messages, visible_soul_files, hidden_soul_files.
  await deleteUser(sql, userId);

  return jsonResponse(200, { deleted: true });
}
