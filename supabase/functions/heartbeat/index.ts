import { jsonResponse } from "../../../src/lib/http.ts";
import { handleHeartbeat } from "../_shared/app.ts";
import { heartbeatRequestSchema } from "../_shared/contracts.ts";
import { installEdgeHandler } from "../_shared/edge.ts";

export async function handleHeartbeatEdge(payload: unknown) {
  const request = heartbeatRequestSchema.parse(payload);
  const result = await handleHeartbeat(request.device_id);
  return jsonResponse(200, result);
}

installEdgeHandler(handleHeartbeatEdge);
