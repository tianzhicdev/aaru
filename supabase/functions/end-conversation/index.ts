import { endConversation } from "../../../src/domain/world.ts";
import { jsonResponse } from "../../../src/lib/http.ts";
import { agentPositionSchema } from "../../../src/domain/schemas.ts";
import { installEdgeHandler } from "../_shared/edge.ts";

export async function handleEndConversation(payload: unknown) {
  const position = agentPositionSchema.parse(payload);
  return jsonResponse(200, agentPositionSchema.parse(endConversation(position)));
}

installEdgeHandler(handleEndConversation);
