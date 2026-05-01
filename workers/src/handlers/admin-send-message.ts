import { jsonResponse } from "../../../src/lib/http.ts";
import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { insertSoulMessage } from "../soulApp.ts";
import { notifyAdminMessage } from "../notifications.ts";
import { z } from "zod";

interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

const adminSendSchema = z.object({
  user_id: z.string().uuid(),
  content: z.string().min(1).max(2000)
});

function authorize(request: Request, env: Env): { ok: true } | { ok: false; status: number; message: string } {
  if (!env.ADMIN_TOKEN) {
    return { ok: false, status: 503, message: "Admin endpoint not configured" };
  }
  const header = request.headers.get("x-thumos-admin-token")?.trim();
  if (!header || header !== env.ADMIN_TOKEN) {
    return { ok: false, status: 403, message: "Invalid admin token" };
  }
  return { ok: true };
}

export async function handleAdminSendMessage(
  sql: NeonSQL,
  env: Env,
  payload: unknown,
  request: Request,
  ctx?: WaitUntilContext
) {
  const auth = authorize(request, env);
  if (!auth.ok) {
    return jsonResponse(auth.status, { code: auth.status, message: auth.message });
  }

  const parsed = adminSendSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonResponse(400, { code: 400, message: "Invalid request" });
  }

  const userRows = await sql`SELECT id FROM users WHERE id = ${parsed.data.user_id} LIMIT 1`;
  if (userRows.length === 0) {
    return jsonResponse(404, { code: 404, message: "User not found" });
  }

  await insertSoulMessage(
    sql,
    parsed.data.user_id,
    "assistant",
    parsed.data.content,
    "admin_message"
  );

  const pushTask = notifyAdminMessage(sql, env, parsed.data.user_id, parsed.data.content)
    .catch((err) => console.error("Admin push fan-out failed:", err));
  if (ctx) {
    ctx.waitUntil(pushTask);
  } else {
    void pushTask;
  }

  return jsonResponse(200, { ok: true });
}
