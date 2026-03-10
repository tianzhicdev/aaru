import { buildKaReply } from "../../../src/domain/ka.ts";
import { jsonResponse } from "../../../src/lib/http.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import {
  kaConverseRequestSchema,
  kaConverseResponseSchema
} from "../_shared/contracts.ts";

export async function handleKaConverse(payload: unknown) {
  const request = kaConverseRequestSchema.parse(payload);
  const reply = buildKaReply(request);

  return jsonResponse(200, kaConverseResponseSchema.parse(reply));
}

installEdgeHandler(handleKaConverse);
