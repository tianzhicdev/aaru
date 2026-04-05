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
  const rows = await sql`
    INSERT INTO soulmate_profiles (
      user_id, display_name, age, gender, latitude, longitude,
      preferred_age_min, preferred_age_max, preferred_genders
    ) VALUES (
      ${userId}, ${input.display_name}, ${input.age}, ${input.gender},
      ${input.latitude}, ${input.longitude},
      ${input.preferred_age_min}, ${input.preferred_age_max},
      ${input.preferred_genders}
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

export async function insertMatchAttempt(
  sql: NeonSQL,
  userAId: string,
  userBId: string,
  aSoulVersion: number,
  bSoulVersion: number,
  result: "match" | "no_match" | "error",
  score: number | null,
  reasoning: string | null = null
): Promise<void> {
  await sql`
    INSERT INTO matches (
      user_a_id, user_b_id, a_soul_version, b_soul_version, result, score, reasoning
    ) VALUES (
      ${userAId}, ${userBId}, ${aSoulVersion}, ${bSoulVersion}, ${result}, ${score}, ${reasoning}
    )
    ON CONFLICT (user_a_id, user_b_id, a_soul_version, b_soul_version) DO NOTHING
  `;
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
