import { jsonResponse } from "../../../src/lib/http.ts";
import { bootstrapUser } from "../_shared/app.ts";
import { bootstrapUserRequestSchema, bootstrapUserResponseSchema } from "../_shared/contracts.ts";
import { installEdgeHandler } from "../_shared/edge.ts";

export async function handleBootstrapUser(payload: unknown) {
  const request = bootstrapUserRequestSchema.parse(payload);
  const result = await bootstrapUser(request.device_id);
  return jsonResponse(200, bootstrapUserResponseSchema.parse(result));
}

installEdgeHandler(handleBootstrapUser);
