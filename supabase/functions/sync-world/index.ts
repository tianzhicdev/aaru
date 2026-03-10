import { jsonResponse } from "../../../src/lib/http.ts";
import { syncWorld } from "../_shared/app.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import { syncWorldRequestSchema, syncWorldResponseSchema } from "../_shared/contracts.ts";

export async function handleSyncWorld(payload: unknown) {
  const body = syncWorldRequestSchema.parse(payload);
  const result = await syncWorld(body.device_id);
  return jsonResponse(200, syncWorldResponseSchema.parse(result));
}

installEdgeHandler(handleSyncWorld);
