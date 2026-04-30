import { jsonResponse } from "../../../src/lib/http.ts";
import type { NeonSQL } from "../db.ts";
import type { Env } from "../env.ts";
import { requireDeviceSession } from "../requestAuth.ts";
import { getSoulmateProfile } from "../matchApp.ts";
import { enqueueMatchingScanUser } from "../backgroundJobsQueue.ts";
import {
  ELIGIBILITY_MIN_USER_MESSAGES,
  ELIGIBILITY_MIN_COMPLETENESS
} from "../matchingPipeline.ts";

export async function handleRunMatchingScan(
  sql: NeonSQL,
  env: Env,
  _payload: unknown,
  request: Request
) {
  const auth = await requireDeviceSession(sql, request, { touch: false });
  if (!auth.ok) return auth.error;

  const userId = auth.session.user_id;

  // Check active soulmate profile
  const profile = await getSoulmateProfile(sql, userId);
  if (!profile?.active || !profile.display_name) {
    return jsonResponse(200, { status: "not_eligible", reason: "No active soulmate profile" });
  }

  // Check message count
  const msgCountRows = await sql`
    SELECT COUNT(*) as count FROM soul_messages
    WHERE user_id = ${userId} AND role = 'user'
  `;
  const userMessageCount = Number((msgCountRows[0] as unknown as { count: string }).count);
  if (userMessageCount < ELIGIBILITY_MIN_USER_MESSAGES) {
    return jsonResponse(200, {
      status: "not_eligible",
      reason: `Need at least ${ELIGIBILITY_MIN_USER_MESSAGES} messages (you have ${userMessageCount})`
    });
  }

  // Check soul file completeness
  const completenessRows = await sql`
    SELECT completeness FROM visible_soul_files
    WHERE user_id = ${userId} AND status = 'ready'
    ORDER BY version DESC LIMIT 1
  `;
  const completeness = (completenessRows[0] as unknown as { completeness: number })?.completeness ?? 0;
  if (completeness < ELIGIBILITY_MIN_COMPLETENESS) {
    return jsonResponse(200, {
      status: "not_eligible",
      reason: `Soul file completeness ${Math.round(completeness * 100)}% — need ${Math.round(ELIGIBILITY_MIN_COMPLETENESS * 100)}%`
    });
  }

  // Enqueue scan
  await enqueueMatchingScanUser(env.BACKGROUND_QUEUE, userId);
  return jsonResponse(200, { status: "scanning" });
}
