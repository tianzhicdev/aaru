import type { NeonSQL } from "./db.ts";
import type { Env } from "./env.ts";
import { COMPLETENESS_THRESHOLD } from "../../src/domain/matching.ts";
import { insertMatchAttempt } from "./matchApp.ts";

const MAX_MATCHES_PER_RUN = 2;
const CANDIDATE_BATCH = 20;

interface ActiveSoulmateUser {
  user_id: string;
  age: number;
  gender: string;
  latitude: number;
  longitude: number;
  preferred_age_min: number;
  preferred_age_max: number;
  preferred_genders: string[];
  soul_version: number;
}

interface Candidate {
  user_id: string;
  soul_version: number;
  distance_m: number;
}

export async function runMatchingPipeline(
  sql: NeonSQL,
  env: Env
): Promise<void> {
  if (env.ENABLE_SOULMATE !== "true") return;

  const users = await getActiveSoulmateUsers(sql);
  const matchCounts = new Map<string, number>();

  for (const user of users) {
    matchCounts.set(user.user_id, 0);
  }

  for (const user of users) {
    if ((matchCounts.get(user.user_id) ?? 0) >= MAX_MATCHES_PER_RUN) {
      continue;
    }

    const candidates = await getCandidates(sql, user, CANDIDATE_BATCH);

    for (const candidate of candidates) {
      if ((matchCounts.get(user.user_id) ?? 0) >= MAX_MATCHES_PER_RUN) break;
      if ((matchCounts.get(candidate.user_id) ?? 0) >= MAX_MATCHES_PER_RUN) continue;

      const userAId = user.user_id < candidate.user_id ? user.user_id : candidate.user_id;
      const userBId = user.user_id < candidate.user_id ? candidate.user_id : user.user_id;
      const aSoulVersion = userAId === user.user_id ? user.soul_version : candidate.soul_version;
      const bSoulVersion = userBId === user.user_id ? user.soul_version : candidate.soul_version;

      const result = await evaluateMatch(sql, env, userAId, userBId);

      await insertMatchAttempt(
        sql,
        userAId,
        userBId,
        aSoulVersion,
        bSoulVersion,
        result.outcome,
        result.score
      );

      if (result.outcome === "match") {
        matchCounts.set(user.user_id, (matchCounts.get(user.user_id) ?? 0) + 1);
        matchCounts.set(candidate.user_id, (matchCounts.get(candidate.user_id) ?? 0) + 1);
      }
    }
  }
}

/**
 * Dummy match function — always returns 'match'.
 * Replace with real soul compatibility scoring later.
 */
export async function evaluateMatch(
  _sql: NeonSQL,
  _env: Env,
  _userAId: string,
  _userBId: string
): Promise<{ outcome: "match" | "no_match" | "error"; score: number | null }> {
  return { outcome: "match", score: 1.0 };
}

async function getActiveSoulmateUsers(sql: NeonSQL): Promise<ActiveSoulmateUser[]> {
  const rows = await sql`
    SELECT sp.user_id, sp.age, sp.gender, sp.latitude, sp.longitude,
           sp.preferred_age_min, sp.preferred_age_max, sp.preferred_genders,
           vsf.version AS soul_version
    FROM soulmate_profiles sp
    JOIN visible_soul_files vsf ON vsf.user_id = sp.user_id
      AND vsf.status = 'ready'
      AND vsf.completeness >= ${COMPLETENESS_THRESHOLD}
    WHERE sp.active = true
      AND vsf.version = (
        SELECT MAX(v2.version) FROM visible_soul_files v2
        WHERE v2.user_id = sp.user_id AND v2.status = 'ready'
      )
  `;
  return rows as unknown as ActiveSoulmateUser[];
}

async function getCandidates(
  sql: NeonSQL,
  user: ActiveSoulmateUser,
  limit: number
): Promise<Candidate[]> {
  const rows = await sql`
    SELECT sp2.user_id,
           vsf.version AS soul_version,
           2 * 6371000 * asin(sqrt(
             power(sin(radians(sp2.latitude - ${user.latitude}) / 2), 2) +
             cos(radians(${user.latitude})) * cos(radians(sp2.latitude)) *
             power(sin(radians(sp2.longitude - ${user.longitude}) / 2), 2)
           )) AS distance_m
    FROM soulmate_profiles sp2
    JOIN visible_soul_files vsf ON vsf.user_id = sp2.user_id
      AND vsf.status = 'ready'
      AND vsf.completeness >= ${COMPLETENESS_THRESHOLD}
    WHERE sp2.user_id != ${user.user_id}
      AND sp2.active = true
      AND vsf.version = (
        SELECT MAX(v2.version) FROM visible_soul_files v2
        WHERE v2.user_id = sp2.user_id AND v2.status = 'ready'
      )
      -- Mutual age preference
      AND sp2.age BETWEEN ${user.preferred_age_min} AND ${user.preferred_age_max}
      AND ${user.age} BETWEEN sp2.preferred_age_min AND sp2.preferred_age_max
      -- Mutual gender preference
      AND sp2.gender = ANY(${user.preferred_genders})
      AND ${user.gender} = ANY(sp2.preferred_genders)
      -- Exclude existing matches
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE m.user_a_id = LEAST(${user.user_id}, sp2.user_id)
          AND m.user_b_id = GREATEST(${user.user_id}, sp2.user_id)
          AND m.result = 'match'
      )
      -- Exclude already attempted with current soul versions
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE m.user_a_id = LEAST(${user.user_id}, sp2.user_id)
          AND m.user_b_id = GREATEST(${user.user_id}, sp2.user_id)
          AND m.a_soul_version = CASE
            WHEN LEAST(${user.user_id}, sp2.user_id) = ${user.user_id}
            THEN ${user.soul_version} ELSE vsf.version END
          AND m.b_soul_version = CASE
            WHEN GREATEST(${user.user_id}, sp2.user_id) = ${user.user_id}
            THEN ${user.soul_version} ELSE vsf.version END
          AND m.result IN ('no_match', 'error')
      )
    ORDER BY distance_m ASC
    LIMIT ${limit}
  `;
  return rows as unknown as Candidate[];
}
