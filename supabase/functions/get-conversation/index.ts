import { jsonResponse } from "../../../src/lib/http.ts";
import { getConversationDetail, requireDeviceSession } from "../_shared/app.ts";
import { getConversationRequestSchema, conversationDetailSchema } from "../_shared/contracts.ts";
import { installEdgeHandler } from "../_shared/edge.ts";

export async function handleGetConversation(payload: unknown, request: Request) {
  const body = getConversationRequestSchema.parse(payload);
  await requireDeviceSession(request, body.device_id);
  const result = await getConversationDetail(body.device_id, body.conversation_id);
  return jsonResponse(200, conversationDetailSchema.parse(result));
}

installEdgeHandler(handleGetConversation);
