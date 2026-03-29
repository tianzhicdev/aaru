import { jsonResponse } from "../../../src/lib/http.ts";

export function handlePing() {
  return jsonResponse(200, {
    ok: true,
    service: "thumos-edge",
    timestamp: new Date().toISOString()
  });
}
