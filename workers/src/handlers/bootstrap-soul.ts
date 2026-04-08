import { jsonResponse } from "../../../src/lib/http.ts";
import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { issueSessionToken } from "../auth.ts";
import {
  ensureUser,
  createDeviceSession,
  getUserModelProfileId,
  getUserLanguage
} from "../db.ts";
import {
  checkReflectionSnapshotNeeded,
  getVisibleSoulFile,
  markReflectionSnapshotPending
} from "../soulApp.ts";
import { emptyVisibleSoulFile } from "../../../src/domain/soulFile.ts";
import { enqueueReflectionSnapshot } from "../backgroundJobsQueue.ts";
import { defaultModelProfileIdFromEnv } from "../modelProfiles.ts";
import { requireDeviceSession } from "../requestAuth.ts";
import { z } from "zod";

const bootstrapSoulRequestSchema = z.object({
  device_id: z.string().min(1)
});

export async function handleBootstrapSoul(sql: NeonSQL, env: Env, payload: unknown, request: Request) {
  const body = bootstrapSoulRequestSchema.parse(payload);

  // Try existing session first
  let userId: string | null = null;
  const auth = await requireDeviceSession(sql, request);

  if (auth.ok) {
    userId = auth.session.user_id;
  }

  // No valid session — create user + new session
  let token: string | undefined;
  if (!userId) {
    const user = await ensureUser(
      sql,
      body.device_id,
      defaultModelProfileIdFromEnv(env)
    );
    userId = user.id;

    // Keep existing device sessions valid. Concurrent bootstraps can otherwise
    // revoke a freshly minted token before the client uses it for SSE.
    const issued = await issueSessionToken(userId, body.device_id, env.THUMOS_SESSION_SECRET);
    await createDeviceSession(sql, userId, body.device_id, issued.tokenHash, issued.expiresAt);
    token = issued.token;
  }

  const [visibleSoulFile, reflectionState, modelProfileId, language] = await Promise.all([
    getVisibleSoulFile(sql, userId),
    checkReflectionSnapshotNeeded(sql, userId),
    getUserModelProfileId(sql, userId),
    getUserLanguage(sql, userId)
  ]);
  const hasMessages = reflectionState.totalMessageCount > 0 || visibleSoulFile !== null;

  if (reflectionState.needed && !reflectionState.pending) {
    const claimed = await markReflectionSnapshotPending(
      sql,
      userId,
      reflectionState.totalMessageCount,
      reflectionState.lastMessageCreatedAt
    );
    if (claimed) {
      void enqueueReflectionSnapshot(
        env.BACKGROUND_QUEUE,
        userId,
        reflectionState.totalMessageCount
      ).catch((error) => {
        console.error("Failed to enqueue reflection snapshot during bootstrap:", error);
      });
    }
  }

  return jsonResponse(200, {
    user_id: userId,
    ...(token ? { token } : {}),
    visible_soul_file: visibleSoulFile ?? emptyVisibleSoulFile(),
    has_messages: hasMessages,
    model_profile_id: modelProfileId,
    language
  });
}
