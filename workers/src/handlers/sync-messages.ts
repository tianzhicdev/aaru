import { jsonResponse } from "../../../src/lib/http.ts";
import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import {
  checkReflectionSnapshotNeeded,
  getAllSoulMessages,
  getSoulMessagesAfter,
  getSoulMessagesSince,
  markReflectionSnapshotPending
} from "../soulApp.ts";
import { enqueueReflectionSnapshot } from "../backgroundJobsQueue.ts";
import { requireDeviceSession } from "../requestAuth.ts";

export async function handleSyncMessages(
  sql: NeonSQL,
  env: Env,
  payload: unknown,
  request: Request
) {
  const auth = await requireDeviceSession(sql, request);
  if (!auth.ok) {
    return auth.error;
  }

  const userId = auth.session.user_id;
  const body = payload as { after_id?: string; since?: string } | null;
  const since = body?.since;
  const afterId = body?.after_id;

  // Incremental poll: lightweight path, skip reflection check
  if (since && typeof since === "string") {
    const messages = await getSoulMessagesSince(sql, userId, since);
    return jsonResponse(200, {
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        created_at: message.created_at
      }))
    });
  }

  // Legacy: after_id based polling (old clients)
  if (afterId && typeof afterId === "string") {
    const messages = await getSoulMessagesAfter(sql, userId, afterId);
    return jsonResponse(200, {
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        created_at: message.created_at
      }))
    });
  }

  // Full sync: canonical transcript + reflection check
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
