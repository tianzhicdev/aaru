import { jsonResponse } from "../../../src/lib/http.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import { readBearerToken, hashSessionToken } from "../_shared/auth.ts";
import { getActiveSessionByTokenHash, touchDeviceSession } from "../_shared/db.ts";
import {
  getActiveSession,
  getLatestSession,
  getVisibleSoulFile,
  getAllSoulMessages,
  runSoulSynthesis
} from "../_shared/soulApp.ts";
import { emptyVisibleSoulFile } from "../../../src/domain/soulFile.ts";
import { REFLECTION_INTERVAL } from "../../../src/domain/constants.ts";

export async function handleSynthesizeSoulFile(_payload: unknown, request: Request) {
  const bearerToken = readBearerToken(request);
  if (!bearerToken) {
    return jsonResponse(401, { code: 401, message: "Missing device session" });
  }

  const tokenHash = await hashSessionToken(bearerToken);
  const session = await getActiveSessionByTokenHash(tokenHash);
  if (!session || new Date(session.expires_at) <= new Date()) {
    return jsonResponse(401, { code: 401, message: "Invalid device session" });
  }

  await touchDeviceSession(session.id);
  const userId = session.user_id;

  // Find active session, or fall back to latest completed session
  const activeSession = await getActiveSession(userId);
  const targetSession = activeSession ?? await getLatestSession(userId);

  if (!targetSession) {
    return jsonResponse(404, { code: 404, message: "No soul session found" });
  }

  // Check if new messages exist since last soul file update
  const existing = await getVisibleSoulFile(userId);
  const allMessages = await getAllSoulMessages(userId);
  const lastSoulFileTime = existing?.lastUpdated ? new Date(existing.lastUpdated).getTime() : 0;
  const hasNewMessages = allMessages.some(m => new Date(m.created_at).getTime() > lastSoulFileTime);

  if (!hasNewMessages && existing) {
    return jsonResponse(200, {
      visible_soul_file: existing,
      synthesis_succeeded: true
    });
  }

  // Don't run synthesis until we have enough conversation data
  const userMessageCount = allMessages.filter(m => m.role === "user").length;
  if (userMessageCount < REFLECTION_INTERVAL) {
    return jsonResponse(200, {
      visible_soul_file: existing ?? emptyVisibleSoulFile(),
      synthesis_succeeded: true
    });
  }

  const { visible } = await runSoulSynthesis(targetSession, userId);

  return jsonResponse(200, {
    visible_soul_file: visible ?? emptyVisibleSoulFile(),
    synthesis_succeeded: visible !== null
  });
}

installEdgeHandler(handleSynthesizeSoulFile);
