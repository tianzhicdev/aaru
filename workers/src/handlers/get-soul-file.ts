import { jsonResponse } from "../../../src/lib/http.ts";
import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { readBearerToken, hashSessionToken } from "../auth.ts";
import { getActiveSessionByTokenHash } from "../db.ts";
import {
  getVisibleSoulFile,
  checkSynthesisNeeded,
  markSynthesisPending,
  markSynthesisFailed
} from "../soulApp.ts";
import { emptyVisibleSoulFile } from "../../../src/domain/soulFile.ts";
import { enqueueSoulSynthesis } from "../backgroundJobsQueue.ts";

export async function handleGetSoulFile(
  sql: NeonSQL,
  env: Env,
  _payload: unknown,
  request: Request
) {
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
  const { needed, pending } = await checkSynthesisNeeded(sql, userId);

  let synthesisPending = pending;
  if (needed && !pending) {
    const claimed = await markSynthesisPending(sql, userId);
    if (!claimed) {
      synthesisPending = true;
    } else {
      try {
        await enqueueSoulSynthesis(env.BACKGROUND_QUEUE, userId);
        synthesisPending = true;
      } catch (error) {
        console.error("Failed to enqueue soul synthesis:", error);
        try {
          await markSynthesisFailed(sql, userId);
        } catch (markError) {
          console.error("Failed to mark synthesis as failed:", markError);
        }
        throw error;
      }
    }
  }

  return jsonResponse(200, {
    visible_soul_file: visibleSoulFile ?? emptyVisibleSoulFile(),
    version: visibleSoulFile?.version ?? 0,
    last_updated: visibleSoulFile?.lastUpdated ?? null,
    synthesis_pending: synthesisPending
  });
}
