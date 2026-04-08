import { jsonResponse } from "../../../src/lib/http.ts";
import type { NeonSQL } from "../db.ts";
import { updateUserLanguage } from "../db.ts";
import { isValidLanguage } from "../../../src/domain/i18n/index.ts";
import { requireDeviceSession } from "../requestAuth.ts";
import { z } from "zod";

const updateLanguageRequestSchema = z.object({
  language: z.string().min(1).max(10)
});

export async function handleUpdateLanguage(
  sql: NeonSQL,
  payload: unknown,
  request: Request
) {
  const auth = await requireDeviceSession(sql, request);
  if (!auth.ok) {
    return auth.error;
  }

  const body = updateLanguageRequestSchema.parse(payload);
  if (!isValidLanguage(body.language)) {
    return jsonResponse(400, {
      code: 400,
      message: `Unsupported language: ${body.language}`
    });
  }

  const language = await updateUserLanguage(
    sql,
    auth.session.user_id,
    body.language
  );

  return jsonResponse(200, {
    user_id: auth.session.user_id,
    language
  });
}
