import { jsonResponse, type JsonResponse } from "../../src/lib/http.ts";
import type { NeonSQL, DeviceSessionRow } from "./db.ts";
import { getActiveSessionByTokenHash, touchDeviceSession } from "./db.ts";
import { hashSessionToken, readSessionToken } from "./auth.ts";

interface AuthSuccess {
  ok: true;
  session: DeviceSessionRow;
}

interface AuthFailure {
  ok: false;
  error: JsonResponse<{ code: number; message: string }>;
}

export type DeviceSessionAuthResult = AuthSuccess | AuthFailure;

export interface DeviceSessionAuthOptions {
  touch?: boolean;
}

export async function requireDeviceSession(
  sql: NeonSQL,
  request: Request,
  options: DeviceSessionAuthOptions = {}
): Promise<DeviceSessionAuthResult> {
  const token = readSessionToken(request);
  if (!token) {
    return {
      ok: false,
      error: jsonResponse(401, { code: 401, message: "Missing device session" })
    };
  }

  const tokenHash = await hashSessionToken(token);
  const session = await getActiveSessionByTokenHash(sql, tokenHash);
  if (!session || new Date(session.expires_at) <= new Date()) {
    return {
      ok: false,
      error: jsonResponse(401, { code: 401, message: "Invalid device session" })
    };
  }

  if (options.touch !== false) {
    await touchDeviceSession(sql, session.id);
  }

  return { ok: true, session };
}

export function requireDebugApiToken(
  request: Request,
  env: { DEBUG_API_TOKEN?: string }
): AuthFailure | null {
  if (!env.DEBUG_API_TOKEN) {
    return {
      ok: false,
      error: jsonResponse(403, { code: 403, message: "Debug access is not configured" })
    };
  }

  const token = request.headers.get("x-thumos-debug-token")?.trim();
  if (!token || token !== env.DEBUG_API_TOKEN) {
    return {
      ok: false,
      error: jsonResponse(403, { code: 403, message: "Invalid debug token" })
    };
  }

  return null;
}
