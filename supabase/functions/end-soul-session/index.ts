import { jsonResponse } from "../../../src/lib/http.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import { readBearerToken, hashSessionToken } from "../_shared/auth.ts";
import { getActiveSessionByTokenHash, touchDeviceSession } from "../_shared/db.ts";
import {
  getActiveSession,
  getAllSoulMessages,
  getVisibleSoulFile,
  updateSoulSession,
  runSoulSynthesis
} from "../_shared/soulApp.ts";
import { emptyVisibleSoulFile } from "../../../src/domain/soulFile.ts";
import { REFLECTION_INTERVAL } from "../../../src/domain/constants.ts";

export async function handleEndSoulSession(_payload: unknown, request: Request) {
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

  const activeSession = await getActiveSession(userId);
  if (!activeSession) {
    return jsonResponse(404, { code: 404, message: "No active soul session" });
  }

  // Only run synthesis if enough conversation data exists
  const allMessages = await getAllSoulMessages(userId);
  const userMessageCount = allMessages.filter(m => m.role === "user").length;
  const existing = await getVisibleSoulFile(userId);

  if (userMessageCount < REFLECTION_INTERVAL) {
    // Not enough data — just mark session complete without synthesis
    await updateSoulSession(activeSession.id, {
      status: "complete",
      completed_at: new Date().toISOString()
    });
    return jsonResponse(200, {
      visible_soul_file: existing ?? emptyVisibleSoulFile(),
      session_completed: true,
      synthesis_succeeded: false
    });
  }

  // Run full synthesis
  const { visible, hidden } = await runSoulSynthesis(activeSession, userId);

  return jsonResponse(200, {
    visible_soul_file: visible ?? emptyVisibleSoulFile(),
    session_completed: true,
    synthesis_succeeded: visible !== null && hidden !== null
  });
}

installEdgeHandler(handleEndSoulSession);
