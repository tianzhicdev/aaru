import { jsonResponse } from "../../../src/lib/http.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import { readBearerToken, hashSessionToken } from "../_shared/auth.ts";
import { getActiveSessionByTokenHash } from "../_shared/db.ts";
import { getVisibleSoulFile, getSoulFile } from "../_shared/soulApp.ts";
import { emptyVisibleSoulFile, emptySoulFile } from "../../../src/domain/soulFile.ts";

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
  const visibleSoulFile = await getVisibleSoulFile(userId);
  const legacySoulFile = await getSoulFile(userId);

  return jsonResponse(200, {
    visible_soul_file: visibleSoulFile ?? emptyVisibleSoulFile(),
    // Keep legacy soul_file for backward compatibility
    soul_file: legacySoulFile ?? emptySoulFile(),
    version: visibleSoulFile?.version ?? 0,
    last_updated: visibleSoulFile?.lastUpdated ?? null,
    session_count: legacySoulFile?.session_count ?? 0,
    cooldown_active: false,
    cooldown_remaining_ms: 0,
    next_available_at: null
  });
}

installEdgeHandler(handleGetSoulFile);
