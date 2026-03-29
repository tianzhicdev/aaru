import { jsonResponse } from "../../../src/lib/http.ts";
import type { NeonSQL } from "../db.ts";
import { readBearerToken, hashSessionToken } from "../auth.ts";
import { getActiveSessionByTokenHash } from "../db.ts";
import { getVisibleSoulFile } from "../soulApp.ts";
import { emptyVisibleSoulFile } from "../../../src/domain/soulFile.ts";

export async function handleGetSoulFile(sql: NeonSQL, _payload: unknown, request: Request) {
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
  const visibleSoulFile = await getVisibleSoulFile(sql, userId);

  return jsonResponse(200, {
    visible_soul_file: visibleSoulFile ?? emptyVisibleSoulFile(),
    version: visibleSoulFile?.version ?? 0,
    last_updated: visibleSoulFile?.lastUpdated ?? null
  });
}
