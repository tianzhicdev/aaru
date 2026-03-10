import { jsonResponse } from "../../../src/lib/http.ts";
import { listConversationSummaries, requireDeviceSession } from "../_shared/app.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import { listConversationsRequestSchema, listConversationsResponseSchema } from "../_shared/contracts.ts";

export async function handleListConversations(payload: unknown, request: Request) {
  const body = listConversationsRequestSchema.parse(payload);
  await requireDeviceSession(request, body.device_id);
  const result = await listConversationSummaries(body.device_id);
  return jsonResponse(200, listConversationsResponseSchema.parse(result));
}

installEdgeHandler(handleListConversations);
