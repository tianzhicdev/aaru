import { jsonResponse } from "../../../src/lib/http.ts";
import { sendBaMessage } from "../_shared/app.ts";
import { conversationDetailSchema, sendBaMessageRequestSchema } from "../_shared/contracts.ts";
import { installEdgeHandler } from "../_shared/edge.ts";

export async function handleSendBaMessage(payload: unknown) {
  const body = sendBaMessageRequestSchema.parse(payload);
  const result = await sendBaMessage(body.device_id, body.conversation_id, body.content);
  return jsonResponse(200, conversationDetailSchema.parse(result));
}

installEdgeHandler(handleSendBaMessage);
