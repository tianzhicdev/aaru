import { jsonResponse } from "../../../src/lib/http.ts";
import { requireDeviceSession, sendHumanMessage } from "../_shared/app.ts";
import { conversationDetailSchema, sendHumanMessageRequestSchema } from "../_shared/contracts.ts";
import { installEdgeHandler } from "../_shared/edge.ts";

export async function handleSendHumanMessage(payload: unknown, request: Request) {
  const body = sendHumanMessageRequestSchema.parse(payload);
  await requireDeviceSession(request, body.device_id);
  const result = await sendHumanMessage(body.device_id, body.conversation_id, body.content);
  return jsonResponse(200, conversationDetailSchema.parse(result));
}

installEdgeHandler(handleSendHumanMessage);
