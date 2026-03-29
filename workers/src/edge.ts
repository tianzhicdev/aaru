import type { JsonResponse } from "../../src/lib/http.ts";
import { jsonResponse } from "../../src/lib/http.ts";
import { ZodError } from "zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-thumos-session",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

export function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

export function toEdgeResponse<T>(response: JsonResponse<T>): Response {
  return jsonResp(response.status, response.body);
}

export function optionsResponse(): Response {
  return new Response("ok", { headers: corsHeaders });
}

export function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    ...corsHeaders
  };
}

export async function withErrorHandling(
  request: Request,
  handler: (payload: unknown, request: Request) => Promise<JsonResponse<unknown>> | JsonResponse<unknown>
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const payload = request.method === "GET" ? {} : await request.json().catch(() => ({}));
    const response = await handler(payload, request);
    return toEdgeResponse(response);
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonResp(400, {
        code: 400,
        message: "Invalid request or response payload",
        issues: error.issues
      });
    }

    const message = error instanceof Error ? error.message : "Internal Server Error";
    const status =
      message.includes("Missing device session") ||
      message.includes("Invalid device session") ||
      message.includes("Device session mismatch") ||
      message.includes("Expired device session")
        ? 401
        : 500;

    return jsonResp(status, { code: status, message });
  }
}
