import { jsonResponse } from "../../../src/lib/http.ts";
import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { readBearerToken, hashSessionToken } from "../auth.ts";
import { getActiveSessionByTokenHash, touchDeviceSession } from "../db.ts";
import {
  checkReflectionSnapshotNeeded,
  getAllSoulMessages,
  markReflectionSnapshotPending
} from "../soulApp.ts";
import { enqueueReflectionSnapshot } from "../backgroundJobsQueue.ts";

export async function handleSyncMessages(
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

  await touchDeviceSession(sql, session.id);
  const userId = session.user_id;
  const messages = await getAllSoulMessages(sql, userId);
  const reflectionState = await checkReflectionSnapshotNeeded(sql, userId);

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
        console.error("Failed to enqueue reflection snapshot during sync:", error);
      });
    }
  }

  return jsonResponse(200, {
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      created_at: message.created_at
    }))
  });
}
