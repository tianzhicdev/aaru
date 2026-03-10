import { jsonResponse } from "../../../src/lib/http.ts";
import { requireDeviceSession, saveAvatar } from "../_shared/app.ts";
import { saveAvatarRequestSchema } from "../_shared/contracts.ts";
import { installEdgeHandler } from "../_shared/edge.ts";

export async function handleSaveAvatar(payload: unknown, request: Request) {
  const body = saveAvatarRequestSchema.parse(payload);
  await requireDeviceSession(request, body.device_id);
  const result = await saveAvatar(body.device_id, {
    ...body.avatar,
    accessory: body.avatar.accessory ?? null
  });
  return jsonResponse(200, result);
}

installEdgeHandler(handleSaveAvatar);
