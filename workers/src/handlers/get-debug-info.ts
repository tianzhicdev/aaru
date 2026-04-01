import { jsonResponse } from "../../../src/lib/http.ts";
import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { getUserModelProfileId } from "../db.ts";
import { listModelProfiles } from "../modelProfiles.ts";
import { getHiddenSoulFile, getVisibleSoulFile, getLatestReflectionSnapshot } from "../soulApp.ts";
import { requireDebugApiToken, requireDeviceSession } from "../requestAuth.ts";
import { deriveConversationSteering } from "../../../src/domain/soul.ts";

export async function handleGetDebugInfo(
  sql: NeonSQL,
  env: Env,
  _payload: unknown,
  request: Request
) {
  const debugAccess = requireDebugApiToken(request, env);
  if (debugAccess) {
    return debugAccess.error;
  }

  const auth = await requireDeviceSession(sql, request, { touch: false });
  if (!auth.ok) {
    return auth.error;
  }

  const userId = auth.session.user_id;
  const modelProfileId = await getUserModelProfileId(sql, userId);

  const [hiddenSoulFile, visibleSoulFile, reflectionNote] = await Promise.all([
    getHiddenSoulFile(sql, userId),
    getVisibleSoulFile(sql, userId),
    getLatestReflectionSnapshot(sql, userId)
  ]);
  const { steering, source } = deriveConversationSteering(reflectionNote);

  return jsonResponse(200, {
    user_id: userId,
    device_id: auth.session.device_id,
    model_profile_id: modelProfileId,
    available_model_profiles: listModelProfiles(),
    hidden_soul_file: hiddenSoulFile,
    visible_soul_file: visibleSoulFile,
    reflection_note: reflectionNote,
    steering_preview: steering,
    steering_source: source
  });
}
