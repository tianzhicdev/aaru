import { jsonResponse } from "../../../src/lib/http.ts";
import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import {
  checkHiddenSynthesisNeeded,
  getLatestReflectionSnapshot,
  getVisibleSoulFile,
  checkSynthesisNeeded,
  markHiddenSynthesisFailed,
  markHiddenSynthesisPending,
  markSynthesisPending,
  markSynthesisFailed,
  withCompatSections
} from "../soulApp.ts";
import { emptyVisibleSoulFile } from "../../../src/domain/soulFile.ts";
import {
  enqueueSynthesisHidden,
  enqueueSynthesisVisible
} from "../backgroundJobsQueue.ts";
import { requireDeviceSession } from "../requestAuth.ts";

export async function handleGetSoulFile(
  sql: NeonSQL,
  env: Env,
  _payload: unknown,
  request: Request
) {
  const auth = await requireDeviceSession(sql, request, { touch: false });
  if (!auth.ok) {
    return auth.error;
  }

  const userId = auth.session.user_id;
  const visibleSoulFile = await getVisibleSoulFile(sql, userId);
  const [{ needed, pending }, hiddenState, reflectionNote] = await Promise.all([
    checkSynthesisNeeded(sql, userId),
    checkHiddenSynthesisNeeded(sql, userId),
    getLatestReflectionSnapshot(sql, userId)
  ]);

  let synthesisPending = pending;
  if (needed && !pending) {
    const claimed = await markSynthesisPending(sql, userId);
    if (!claimed) {
      synthesisPending = true;
    } else {
      try {
        await enqueueSynthesisVisible(env.BACKGROUND_QUEUE, userId);
        synthesisPending = true;
      } catch (error) {
        console.error("Failed to enqueue visible synthesis:", error);
        try {
          await markSynthesisFailed(sql, userId);
        } catch (markError) {
          console.error("Failed to mark visible synthesis as failed:", markError);
        }
        throw error;
      }
    }
  }

  if (hiddenState.needed && !hiddenState.pending) {
    const hiddenClaimed = await markHiddenSynthesisPending(sql, userId);
    if (hiddenClaimed) {
      try {
        await enqueueSynthesisHidden(env.BACKGROUND_QUEUE, userId);
      } catch (error) {
        console.error("Failed to enqueue hidden synthesis:", error);
        try {
          await markHiddenSynthesisFailed(sql, userId);
        } catch (markError) {
          console.error("Failed to mark hidden synthesis as failed:", markError);
        }
      }
    }
  }

  const file = visibleSoulFile ?? emptyVisibleSoulFile();
  return jsonResponse(200, {
    visible_soul_file: withCompatSections(file), // COMPAT: remove after MIN_SUPPORTED_VERSION bump
    version: file.version ?? 0,
    last_updated: file.lastUpdated ?? null,
    synthesis_pending: synthesisPending,
    domain_coverage: reflectionNote?.domainCoverage ?? []
  });
}
