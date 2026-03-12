import { jsonResponse } from "../../../src/lib/http.ts";
import { handleTapCharacter } from "../_shared/app.ts";
import { tapCharacterRequestSchema } from "../_shared/contracts.ts";
import { installEdgeHandler } from "../_shared/edge.ts";

export async function handleTapCharacterEdge(payload: unknown) {
  const request = tapCharacterRequestSchema.parse(payload);
  const result = await handleTapCharacter(
    request.device_id,
    request.target_user_id
  );
  if ("error" in result) {
    return jsonResponse(result.status as number, { error: result.error });
  }
  return jsonResponse(200, result);
}

installEdgeHandler(handleTapCharacterEdge);
