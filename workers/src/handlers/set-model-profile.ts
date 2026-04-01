import { jsonResponse } from "../../../src/lib/http.ts";
import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { updateUserModelProfileId } from "../db.ts";
import { isModelProfileId } from "../modelProfiles.ts";
import { requireDebugApiToken, requireDeviceSession } from "../requestAuth.ts";
import { z } from "zod";

const setModelProfileRequestSchema = z.object({
  model_profile_id: z.string().min(1)
});

export async function handleSetModelProfile(
  sql: NeonSQL,
  env: Env,
  payload: unknown,
  request: Request
) {
  const debugAccess = requireDebugApiToken(request, env);
  if (debugAccess) {
    return debugAccess.error;
  }

  const auth = await requireDeviceSession(sql, request);
  if (!auth.ok) {
    return auth.error;
  }

  const body = setModelProfileRequestSchema.parse(payload);
  if (!isModelProfileId(body.model_profile_id)) {
    return jsonResponse(400, {
      code: 400,
      message: `Unknown model profile id: ${body.model_profile_id}`
    });
  }

  const modelProfileId = await updateUserModelProfileId(
    sql,
    auth.session.user_id,
    body.model_profile_id
  );

  return jsonResponse(200, {
    user_id: auth.session.user_id,
    model_profile_id: modelProfileId
  });
}
