import { jsonResponse } from "../../../src/lib/http.ts";
import { handleTapCell } from "../_shared/app.ts";
import { tapCellRequestSchema } from "../_shared/contracts.ts";
import { installEdgeHandler } from "../_shared/edge.ts";

export async function handleTapCellEdge(payload: unknown) {
  const request = tapCellRequestSchema.parse(payload);
  const result = await handleTapCell(
    request.device_id,
    request.target_cell_x,
    request.target_cell_y
  );
  if ("error" in result) {
    return jsonResponse(result.status as number, { error: result.error });
  }
  return jsonResponse(200, result);
}

installEdgeHandler(handleTapCellEdge);
