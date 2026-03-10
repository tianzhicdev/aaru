import { jsonResponse } from "../../../src/lib/http.ts";
import { requireDeviceSession, saveSoulProfile } from "../_shared/app.ts";
import { saveSoulProfileRequestSchema } from "../_shared/contracts.ts";
import { installEdgeHandler } from "../_shared/edge.ts";

export async function handleSaveSoulProfile(payload: unknown, request: Request) {
  const body = saveSoulProfileRequestSchema.parse(payload);
  await requireDeviceSession(request, body.device_id);
  const result = await saveSoulProfile(body.device_id, body.profile);
  return jsonResponse(200, result);
}

installEdgeHandler(handleSaveSoulProfile);
