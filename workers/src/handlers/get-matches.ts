import { jsonResponse } from "../../../src/lib/http.ts";
import type { NeonSQL } from "../db.ts";
import { requireDeviceSession } from "../requestAuth.ts";
import { getMatchesForUser } from "../matchApp.ts";
import { getVisibleSoulFile } from "../soulApp.ts";

export async function handleGetMatches(
  sql: NeonSQL,
  _payload: unknown,
  request: Request
) {
  const auth = await requireDeviceSession(sql, request, { touch: false });
  if (!auth.ok) return auth.error;

  const userId = auth.session.user_id;
  const rawMatches = await getMatchesForUser(sql, userId);

  const matches = await Promise.all(
    rawMatches.map(async (m) => {
      const matchedUserId = m.user_a_id === userId ? m.user_b_id : m.user_a_id;
      const soulFile = await getVisibleSoulFile(sql, matchedUserId);
      return {
        match_id: m.id,
        matched_user_id: matchedUserId,
        display_name: soulFile?.portrait?.slice(0, 80) ?? "A kindred soul",
        portrait: soulFile?.portrait ?? null,
        matched_at: m.evaluated_at
      };
    })
  );

  return jsonResponse(200, { matches });
}
