import { jsonResponse } from "../../../src/lib/http.ts";
import { saveSoulProfile } from "../_shared/app.ts";
import { saveSoulProfileRequestSchema } from "../_shared/contracts.ts";
import { installEdgeHandler } from "../_shared/edge.ts";

export async function handleSaveSoulProfile(payload: unknown) {
  const body = saveSoulProfileRequestSchema.parse(payload);
  const result = await saveSoulProfile(body.device_id, body.profile, body.display_name);
  return jsonResponse(200, result);
}

installEdgeHandler(handleSaveSoulProfile);
