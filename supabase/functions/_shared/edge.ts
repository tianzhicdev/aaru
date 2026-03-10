import { jsonResponse, type JsonResponse } from "../../../src/lib/http.ts";
import { ZodError } from "zod";

declare const Deno: {
  serve(handler: (request: Request) => Response | Promise<Response>): void;
} | undefined;

const defaultHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-aaru-session",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

export function toEdgeResponse<T>(response: JsonResponse<T>): Response {
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: defaultHeaders
  });
}

export function installEdgeHandler(handler: (payload: unknown, request: Request) => Promise<JsonResponse<unknown>> | JsonResponse<unknown>) {
  if (typeof Deno === "undefined") {
    return;
  }

  Deno.serve(async (request: Request) => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: defaultHeaders });
    }

    try {
      const payload = request.method === "GET" ? {} : await request.json().catch(() => ({}));
      const response = await handler(payload, request);
      return toEdgeResponse(response);
    } catch (error) {
      if (error instanceof ZodError) {
        return toEdgeResponse(
          jsonResponse(400, {
            code: 400,
            message: "Invalid request or response payload",
            issues: error.issues
          })
        );
      }

      const message = error instanceof Error ? error.message : "Internal Server Error";
      const status =
        message.includes("Missing device session") ||
        message.includes("Invalid device session") ||
        message.includes("Device session mismatch") ||
        message.includes("Expired device session")
          ? 401
          : 500;

      return toEdgeResponse(jsonResponse(status, { code: status, message }));
    }
  });
}

export function pingResponse() {
  return jsonResponse(200, {
    ok: true,
    service: "aaru-edge",
    timestamp: new Date().toISOString()
  });
}
