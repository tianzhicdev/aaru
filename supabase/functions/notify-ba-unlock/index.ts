import { jsonResponse } from "../../../src/lib/http.ts";
import { z } from "zod";
import { installEdgeHandler } from "../_shared/edge.ts";

const notifyRequestSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
  conversationId: z.string().uuid()
});

export async function handleNotifyBaUnlock(payload: unknown) {
  const request = notifyRequestSchema.parse(payload);
  return jsonResponse(200, {
    sent: request.userIds.length,
    conversationId: request.conversationId
  });
}

installEdgeHandler(handleNotifyBaUnlock);
