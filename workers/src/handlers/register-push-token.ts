import { jsonResponse } from "../../../src/lib/http.ts";
import type { NeonSQL } from "../db.ts";
import { requireDeviceSession } from "../requestAuth.ts";
import { upsertPushToken } from "../notifications.ts";
import { z } from "zod";

const registerSchema = z.object({
  token: z.string().min(8).max(256),
  platform: z.literal("ios").optional()
});

export async function handleRegisterPushToken(
  sql: NeonSQL,
  payload: unknown,
  request: Request
) {
  const auth = await requireDeviceSession(sql, request, { touch: false });
  if (!auth.ok) return auth.error;

  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonResponse(400, { code: 400, message: "Invalid token payload" });
  }

  await upsertPushToken(
    sql,
    auth.session.user_id,
    parsed.data.token,
    parsed.data.platform ?? "ios"
  );

  return jsonResponse(200, { ok: true });
}
