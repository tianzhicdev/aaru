import type { NeonSQL } from "../db.ts";
import type { Env } from "../env.ts";
import { issueSessionToken } from "../auth.ts";
import { createDeviceSession, getUserLanguage } from "../db.ts";
import { getVisibleSoulFile, withCompatSections } from "../soulApp.ts";
import { emptyVisibleSoulFile } from "../../../src/domain/soulFile.ts";
import { jsonResponse } from "../../../src/lib/http.ts";
import { z } from "zod";

const DEMO_EMAIL = "apptest@trymagpie.xyz";
const DEMO_PASSWORD = "apptest@trymagpie";

const demoSignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function handleDemoSignIn(
  sql: NeonSQL,
  env: Env,
  payload: unknown
) {
  const parsed = demoSignInSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonResponse(400, { code: 400, message: "Invalid request" });
  }

  const { email, password } = parsed.data;
  if (email !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
    return jsonResponse(401, { code: 401, message: "Invalid credentials" });
  }

  const rows = await sql`
    SELECT id, device_id, language FROM users
    WHERE is_test_user = true AND device_id = 'test-device-alex-0001'
  `;
  if (rows.length === 0) {
    return jsonResponse(404, { code: 404, message: "Demo account not found" });
  }

  const user = rows[0] as { id: string; device_id: string; language: string };
  const issued = await issueSessionToken(user.id, user.device_id, env.THUMOS_SESSION_SECRET);
  await createDeviceSession(sql, user.id, user.device_id, issued.tokenHash, issued.expiresAt);

  const visibleSoulFile = await getVisibleSoulFile(sql, user.id);
  const file = visibleSoulFile ?? emptyVisibleSoulFile();

  const msgRows = await sql`SELECT COUNT(*) as count FROM soul_messages WHERE user_id = ${user.id}`;
  const hasMessages = Number(msgRows[0]?.count ?? 0) > 0;
  const language = await getUserLanguage(sql, user.id);

  return jsonResponse(200, {
    user_id: user.id,
    device_id: user.device_id,
    token: issued.token,
    visible_soul_file: withCompatSections(file),
    has_messages: hasMessages,
    language
  });
}
