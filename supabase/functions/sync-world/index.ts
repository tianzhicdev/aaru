import { jsonResponse } from "../../../src/lib/http.ts";
import { requireDeviceSession, syncWorld } from "../_shared/app.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import { syncWorldRequestSchema, syncWorldResponseSchema } from "../_shared/contracts.ts";

export async function handleSyncWorld(payload: unknown, request: Request) {
  const body = syncWorldRequestSchema.parse(payload);
  await requireDeviceSession(request, body.device_id);
  const result = await syncWorld(body.device_id);
  return jsonResponse(200, syncWorldResponseSchema.parse(result));
}

installEdgeHandler(handleSyncWorld);
