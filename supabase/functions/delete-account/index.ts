import { jsonResponse } from "../../../src/lib/http.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import { readBearerToken, hashSessionToken } from "../_shared/auth.ts";
import { getActiveSessionByTokenHash } from "../_shared/db.ts";
import { supabaseUrl, supabaseServiceRoleKey } from "../_shared/env.ts";

export async function handleDeleteAccount(_payload: unknown, request: Request) {
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

  // CASCADE handles device_sessions, soul_sessions, soul_messages,
  // visible_soul_files, hidden_soul_files
  const response = await fetch(
    `${supabaseUrl()}/rest/v1/users?id=eq.${userId}`,
    {
      method: "DELETE",
      headers: {
        apikey: supabaseServiceRoleKey(),
        Authorization: `Bearer ${supabaseServiceRoleKey()}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      }
    }
  );

  if (!response.ok) {
    const text = await response.text();
    return jsonResponse(500, { code: 500, message: `Delete failed: ${text}` });
  }

  return jsonResponse(200, { deleted: true });
}

installEdgeHandler(handleDeleteAccount);
