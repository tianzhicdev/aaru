import { jsonResponse } from "../../../src/lib/http.ts";
import type { NeonSQL } from "../db.ts";
import { requireDeviceSession } from "../requestAuth.ts";
import { getMatchMessages, insertMatchMessage, getMatchedUserIds } from "../matchApp.ts";

export async function handleGetMatchMessages(
  sql: NeonSQL,
  _payload: unknown,
  request: Request
) {
  const auth = await requireDeviceSession(sql, request, { touch: false });
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const otherUserId = url.searchParams.get("other_user_id");
  if (!otherUserId) {
    return jsonResponse(400, { code: 400, message: "other_user_id is required" });
  }

  // Verify they are matched
  const matchedIds = await getMatchedUserIds(sql, auth.session.user_id);
  if (!matchedIds.includes(otherUserId)) {
    return jsonResponse(403, { code: 403, message: "Not matched with this user" });
  }

  const afterId = url.searchParams.get("after_id") ?? undefined;
  const messages = await getMatchMessages(sql, auth.session.user_id, otherUserId, afterId);

  return jsonResponse(200, { messages });
}

export async function handlePostMatchMessage(
  sql: NeonSQL,
  payload: unknown,
  request: Request
) {
  const auth = await requireDeviceSession(sql, request, { touch: false });
  if (!auth.ok) return auth.error;

  const body = payload as Record<string, unknown>;
  const receiverId = String(body.receiver_id ?? "");
  const content = String(body.content ?? "").trim();

  if (!receiverId) {
    return jsonResponse(400, { code: 400, message: "receiver_id is required" });
  }
  if (content.length === 0 || content.length > 2000) {
    return jsonResponse(400, { code: 400, message: "content must be 1-2000 characters" });
  }

  // Verify they are matched
  const matchedIds = await getMatchedUserIds(sql, auth.session.user_id);
  if (!matchedIds.includes(receiverId)) {
    return jsonResponse(403, { code: 403, message: "Not matched with this user" });
  }

  const message = await insertMatchMessage(sql, auth.session.user_id, receiverId, content);
  return jsonResponse(200, { message });
}
