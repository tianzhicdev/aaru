import { jsonResponse } from "../../../src/lib/http.ts";
import type { NeonSQL } from "../db.ts";
import { requireDeviceSession } from "../requestAuth.ts";
import { getMatchesForUser } from "../matchApp.ts";
import { getSoulmateProfile } from "../matchApp.ts";

export async function handleGetMatches(
  sql: NeonSQL,
  _payload: unknown,
  request: Request
) {
  const auth = await requireDeviceSession(sql, request, { touch: false });
  if (!auth.ok) return auth.error;

  const userId = auth.session.user_id;
  const rawMatches = await getMatchesForUser(sql, userId);

  const enriched = await Promise.all(
    rawMatches.map(async (m) => {
      const matchedUserId = m.user_a_id === userId ? m.user_b_id : m.user_a_id;
      const profile = await getSoulmateProfile(sql, matchedUserId);
      if (!profile?.display_name) return null;

      // Per-user reasoning: use reasoning_a/b based on which side the requesting user is
      const isUserA = m.user_a_id === userId;
      const perUserReasoning = isUserA ? m.reasoning_a : m.reasoning_b;
      // Fallback to old unified reasoning for pre-simulation matches
      const reasoning = perUserReasoning ?? m.reasoning ?? null;

      return {
        match_id: m.id,
        matched_user_id: matchedUserId,
        display_name: profile.display_name,
        selfie_url: profile.selfie_url ?? null,
        bio: profile.bio ?? null,
        matched_at: m.evaluated_at,
        reasoning,
        connection_zones: m.connection_zones ?? null,
        score: m.score ?? null
      };
    })
  );

  const matches = enriched.filter((m): m is NonNullable<typeof m> => m !== null);

  return jsonResponse(200, { matches });
}
