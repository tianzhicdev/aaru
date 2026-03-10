import { jsonResponse } from "../../../src/lib/http.ts";
import { saveAvatar } from "../_shared/app.ts";
import { saveAvatarRequestSchema } from "../_shared/contracts.ts";
import { installEdgeHandler } from "../_shared/edge.ts";

export async function handleSaveAvatar(payload: unknown) {
  const body = saveAvatarRequestSchema.parse(payload);
  const result = await saveAvatar(body.device_id, {
    ...body.avatar,
    accessory: body.avatar.accessory ?? null
  });
  return jsonResponse(200, result);
}

installEdgeHandler(handleSaveAvatar);
