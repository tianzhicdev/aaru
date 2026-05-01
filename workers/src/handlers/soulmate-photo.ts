import type { NeonSQL } from "../db.ts";
import { requireDeviceSession } from "../requestAuth.ts";
import { getMatchedUserIds, getSoulmatePhoto } from "../matchApp.ts";
import { toEdgeResponse } from "../edge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-thumos-debug-token, x-thumos-session, if-none-match",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "etag"
};

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ code: status, message }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

export async function handleGetSoulmatePhoto(
  sql: NeonSQL,
  request: Request
): Promise<Response> {
  const auth = await requireDeviceSession(sql, request, { touch: false });
  if (!auth.ok) return toEdgeResponse(auth.error);

  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("user_id");
  const idxRaw = url.searchParams.get("idx");
  if (!targetUserId) return jsonError(400, "user_id is required");
  const idx = Number(idxRaw);
  if (!Number.isInteger(idx) || idx < 0 || idx > 2) {
    return jsonError(400, "idx must be 0, 1, or 2");
  }

  const callerId = auth.session.user_id;
  if (targetUserId !== callerId) {
    const matchedIds = await getMatchedUserIds(sql, callerId);
    if (!matchedIds.includes(targetUserId)) {
      return jsonError(403, "You are not matched with this user");
    }
  }

  const photo = await getSoulmatePhoto(sql, targetUserId, idx);
  if (!photo) return jsonError(404, "Photo not found");

  const ifNoneMatch = request.headers.get("if-none-match")?.trim();
  if (ifNoneMatch && stripQuotes(ifNoneMatch) === photo.etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: `"${photo.etag}"`,
        "Cache-Control": "private, max-age=300, must-revalidate",
        ...corsHeaders
      }
    });
  }

  // Copy into a fresh ArrayBuffer so the Workers runtime accepts it as a body.
  const bodyBytes = new Uint8Array(photo.data);
  return new Response(bodyBytes, {
    status: 200,
    headers: {
      "Content-Type": photo.mime_type,
      "Content-Length": String(bodyBytes.byteLength),
      ETag: `"${photo.etag}"`,
      "Cache-Control": "private, max-age=300, must-revalidate",
      ...corsHeaders
    }
  });
}

function stripQuotes(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}
