import { jsonResponse } from "../../../src/lib/http.ts";
import { handleRegisterPushToken } from "../_shared/app.ts";
import { registerPushTokenRequestSchema } from "../_shared/contracts.ts";
import { installEdgeHandler } from "../_shared/edge.ts";

export async function handleRegisterPushTokenEdge(payload: unknown) {
  const request = registerPushTokenRequestSchema.parse(payload);
  const result = await handleRegisterPushToken(
    request.device_id,
    request.device_token,
    request.platform
  );
  return jsonResponse(200, result);
}

installEdgeHandler(handleRegisterPushTokenEdge);
