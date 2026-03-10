import { jsonResponse } from "../../../src/lib/http.ts";
import { advanceDueConversations } from "../_shared/app.ts";
import { installEdgeHandler } from "../_shared/edge.ts";

export async function handleAdvanceConversations() {
  const result = await advanceDueConversations();
  return jsonResponse(200, result);
}

installEdgeHandler(handleAdvanceConversations);
