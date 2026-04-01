import { jsonResponse } from "../../../src/lib/http.ts";
import type { NeonSQL } from "../db.ts";
import { deleteUser } from "../db.ts";
import { requireDeviceSession } from "../requestAuth.ts";

export async function handleDeleteAccount(sql: NeonSQL, _payload: unknown, request: Request) {
  const auth = await requireDeviceSession(sql, request, { touch: false });
  if (!auth.ok) {
    return auth.error;
  }

  const userId = auth.session.user_id;

  // CASCADE handles device_sessions, soul_messages, visible_soul_files, hidden_soul_files.
  await deleteUser(sql, userId);

  return jsonResponse(200, { deleted: true });
}
