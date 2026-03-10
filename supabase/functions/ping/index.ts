import { installEdgeHandler, pingResponse } from "../_shared/edge.ts";

export function handlePing() {
  return pingResponse();
}

installEdgeHandler(async () => handlePing());
