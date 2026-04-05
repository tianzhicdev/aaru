import type { NeonSQL } from "./db.ts";

export interface SoulmateProfileRow {
  user_id: string;
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
  evaluated_at: string;
}

export interface SoulmateProfileInput {
  age: number;
  gender: string;
  latitude: number;
  longitude: number;
  preferred_age_min: number;
  preferred_age_max: number;
  preferred_genders: string[];
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
      user_id, age, gender, latitude, longitude,
      preferred_age_min, preferred_age_max, preferred_genders
    ) VALUES (
      ${userId}, ${input.age}, ${input.gender},
      ${input.latitude}, ${input.longitude},
      ${input.preferred_age_min}, ${input.preferred_age_max},
      ${input.preferred_genders}
    )
    ON CONFLICT (user_id) DO UPDATE SET
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
  score: number | null
): Promise<void> {
  await sql`
    INSERT INTO matches (
      user_a_id, user_b_id, a_soul_version, b_soul_version, result, score
    ) VALUES (
      ${userAId}, ${userBId}, ${aSoulVersion}, ${bSoulVersion}, ${result}, ${score}
    )
    ON CONFLICT (user_a_id, user_b_id, a_soul_version, b_soul_version) DO NOTHING
  `;
}
