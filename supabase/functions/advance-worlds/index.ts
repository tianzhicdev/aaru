import { jsonResponse } from "../../../src/lib/http.ts";
import { advanceOnlineWorlds } from "../_shared/app.ts";
import { installEdgeHandler } from "../_shared/edge.ts";

export async function handleAdvanceWorlds() {
  const result = await advanceOnlineWorlds();
  return jsonResponse(200, result);
}

installEdgeHandler(handleAdvanceWorlds);
