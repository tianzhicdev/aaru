import { tickWorld } from "../../../src/domain/world.ts";
import { jsonResponse } from "../../../src/lib/http.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import {
  worldTickRequestSchema,
  worldTickResponseSchema
} from "../_shared/contracts.ts";

export async function handleWorldTick(payload: unknown) {
  const request = worldTickRequestSchema.parse(payload);
  const result = tickWorld(
    request.positions,
    request.now ? new Date(request.now) : new Date()
  );

  return jsonResponse(200, worldTickResponseSchema.parse(result));
}

installEdgeHandler(handleWorldTick);
