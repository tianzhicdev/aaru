import type { NeonSQL } from "./db.ts";

export interface SoulmateProfileRow {
  user_id: string;
  display_name: string | null;
  age: number;
  gender: string;
  latitude: number;
  longitude: number;
  preferred_age_min: number;
  preferred_age_max: number;
  preferred_genders: string[];
  active: boolean;
  selfie_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatchRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  a_soul_version: number;
  b_soul_version: number;
  result: "match" | "no_match" | "error";
  score: number | null;
  reasoning: string | null;
  connection_zones: string[] | null;
  raw_evaluation: Record<string, unknown> | null;
  reasoning_a: string | null;
  reasoning_b: string | null;
  evaluated_at: string;
}

export interface SoulmateProfileInput {
  display_name: string;
  age: number;
  gender: string;
  latitude: number;
  longitude: number;
  preferred_age_min: number;
  preferred_age_max: number;
  preferred_genders: string[];
  selfie_url?: string;
  bio?: string;
}

export interface MatchMessageRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

export async function getSoulmateProfile(
  sql: NeonSQL,
  userId: string
): Promise<SoulmateProfileRow | null> {
  const rows = await sql`
    SELECT *
    FROM soulmate_profiles
    WHERE user_id = ${userId}
  `;
  return (rows[0] as unknown as SoulmateProfileRow) ?? null;
}

export async function upsertSoulmateProfile(
  sql: NeonSQL,
  userId: string,
  input: SoulmateProfileInput
): Promise<SoulmateProfileRow> {
  const selfieUrl = input.selfie_url ?? null;
  const bio = input.bio ?? null;
  const rows = await sql`
    INSERT INTO soulmate_profiles (
      user_id, display_name, age, gender, latitude, longitude,
      preferred_age_min, preferred_age_max, preferred_genders,
      selfie_url, bio
    ) VALUES (
      ${userId}, ${input.display_name}, ${input.age}, ${input.gender},
      ${input.latitude}, ${input.longitude},
      ${input.preferred_age_min}, ${input.preferred_age_max},
      ${input.preferred_genders},
      ${selfieUrl}, ${bio}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      age = EXCLUDED.age,
      gender = EXCLUDED.gender,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      preferred_age_min = EXCLUDED.preferred_age_min,
      preferred_age_max = EXCLUDED.preferred_age_max,
      preferred_genders = EXCLUDED.preferred_genders,
      selfie_url = EXCLUDED.selfie_url,
      bio = EXCLUDED.bio,
      updated_at = now()
    RETURNING *
  `;
  return rows[0] as unknown as SoulmateProfileRow;
}

export async function getMatchesForUser(
  sql: NeonSQL,
  userId: string
): Promise<MatchRow[]> {
  const rows = await sql`
    SELECT *
    FROM matches
    WHERE (user_a_id = ${userId} OR user_b_id = ${userId})
      AND result = 'match'
    ORDER BY evaluated_at DESC
  `;
  return rows as unknown as MatchRow[];
}

export async function getMatchedUserIds(
  sql: NeonSQL,
  userId: string
): Promise<string[]> {
  const matches = await getMatchesForUser(sql, userId);
  return matches.map(m =>
    m.user_a_id === userId ? m.user_b_id : m.user_a_id
  );
}

export interface InsertMatchOptions {
  connectionZones?: string[] | null;
  rawEvaluation?: Record<string, unknown> | null;
  reasoningA?: string | null;
  reasoningB?: string | null;
}

export async function insertMatchAttempt(
  sql: NeonSQL,
  userAId: string,
  userBId: string,
  aSoulVersion: number,
  bSoulVersion: number,
  result: "match" | "no_match" | "error",
  score: number | null,
  reasoning: string | null = null,
  options: InsertMatchOptions = {}
): Promise<string | null> {
  const connectionZones = options.connectionZones ? JSON.stringify(options.connectionZones) : null;
  const rawEvaluation = options.rawEvaluation ? JSON.stringify(options.rawEvaluation) : null;
  const reasoningA = options.reasoningA ?? null;
  const reasoningB = options.reasoningB ?? null;
  const rows = await sql`
    INSERT INTO matches (
      user_a_id, user_b_id, a_soul_version, b_soul_version, result, score, reasoning,
      connection_zones, raw_evaluation, reasoning_a, reasoning_b
    ) VALUES (
      ${userAId}, ${userBId}, ${aSoulVersion}, ${bSoulVersion}, ${result}, ${score}, ${reasoning},
      ${connectionZones}::jsonb, ${rawEvaluation}::jsonb, ${reasoningA}, ${reasoningB}
    )
    ON CONFLICT (user_a_id, user_b_id, a_soul_version, b_soul_version) DO NOTHING
    RETURNING id
  `;
  return (rows[0] as unknown as { id: string })?.id ?? null;
}

export async function updateMatchReasoning(
  sql: NeonSQL,
  matchId: string,
  side: "a" | "b",
  reasoning: string
): Promise<void> {
  if (side === "a") {
    await sql`UPDATE matches SET reasoning_a = ${reasoning} WHERE id = ${matchId}`;
  } else {
    await sql`UPDATE matches SET reasoning_b = ${reasoning} WHERE id = ${matchId}`;
  }
}

export async function getMatchById(
  sql: NeonSQL,
  matchId: string
): Promise<MatchRow | null> {
  const rows = await sql`SELECT * FROM matches WHERE id = ${matchId}`;
  return (rows[0] as unknown as MatchRow) ?? null;
}

// ── Match Messages ───────────────────────────────────────────

export async function getMatchMessages(
  sql: NeonSQL,
  userId: string,
  otherUserId: string,
  afterId?: string
): Promise<MatchMessageRow[]> {
  if (afterId) {
    const rows = await sql`
      SELECT * FROM match_messages
      WHERE (
        (sender_id = ${userId} AND receiver_id = ${otherUserId})
        OR (sender_id = ${otherUserId} AND receiver_id = ${userId})
      )
      AND created_at > (
        SELECT created_at FROM match_messages WHERE id = ${afterId}
      )
      ORDER BY created_at ASC
    `;
    return rows as unknown as MatchMessageRow[];
  }

  const rows = await sql`
    SELECT * FROM match_messages
    WHERE (
      (sender_id = ${userId} AND receiver_id = ${otherUserId})
      OR (sender_id = ${otherUserId} AND receiver_id = ${userId})
    )
    ORDER BY created_at ASC
  `;
  return rows as unknown as MatchMessageRow[];
}

export async function insertMatchMessage(
  sql: NeonSQL,
  senderId: string,
  receiverId: string,
  content: string
): Promise<MatchMessageRow> {
  const rows = await sql`
    INSERT INTO match_messages (sender_id, receiver_id, content)
    VALUES (${senderId}, ${receiverId}, ${content})
    RETURNING *
  `;
  return rows[0] as unknown as MatchMessageRow;
}
