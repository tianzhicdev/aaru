import type { NeonSQL } from "../db.ts";
import type { Env } from "../env.ts";
import { issueSessionToken } from "../auth.ts";
import { createDeviceSession, getUserLanguage } from "../db.ts";
import { getVisibleSoulFile, withCompatSections } from "../soulApp.ts";
import { emptyVisibleSoulFile } from "../../../src/domain/soulFile.ts";
import { jsonResponse } from "../../../src/lib/http.ts";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

const CLERK_JWKS_URL = "https://dynamic-perch-58.clerk.accounts.dev/.well-known/jwks.json";
const JWKS = createRemoteJWKSet(new URL(CLERK_JWKS_URL));

const clerkAuthSchema = z.object({
  token: z.string().min(1)
});

export async function handleClerkAuth(
  sql: NeonSQL,
  env: Env,
  payload: unknown
) {
  const parsed = clerkAuthSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonResponse(400, { code: 400, message: "Invalid request" });
  }

  let clerkUserId: string;
  try {
    const { payload: claims } = await jwtVerify(parsed.data.token, JWKS);
    if (!claims.sub) throw new Error("Missing sub claim");
    clerkUserId = claims.sub;
  } catch (error) {
    console.error("Clerk JWT verification failed:", error);
    return jsonResponse(401, { code: 401, message: "Invalid Clerk token" });
  }

  const rows = await sql`
    SELECT id, device_id, language FROM users WHERE clerk_user_id = ${clerkUserId}
  `;
  if (rows.length === 0) {
    return jsonResponse(404, { code: 404, message: "No account linked to this Clerk user" });
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
