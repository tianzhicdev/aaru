import type { NeonSQL } from "./db.ts";
import type { Env } from "./env.ts";
import { computeCoverageProgress } from "../../src/domain/matching.ts";
import type { DomainCoverageEntry } from "../../src/domain/schemas.ts";
import { insertMatchAttempt } from "./matchApp.ts";
import { runSimulatedMatch } from "./matchSimulation.ts";
import { enqueueMatchReasoning } from "./backgroundJobsQueue.ts";
import { notifyNewMatch } from "./notifications.ts";

const MAX_MATCHES_PER_RUN = 2;
const CANDIDATE_BATCH = 20;

interface ActiveSoulmateUser {
  user_id: string;
  display_name: string | null;
  age: number;
  gender: string;
  latitude: number;
  longitude: number;
  preferred_age_min: number;
  preferred_age_max: number;
  preferred_genders: string[];
  soul_version: number;
  language: string;
}

interface Candidate {
  user_id: string;
  display_name: string | null;
  soul_version: number;
  distance_m: number;
}

export const ELIGIBILITY_MIN_USER_MESSAGES = 30;
export const ELIGIBILITY_MIN_COMPLETENESS = 0.80;

export async function runMatchingPipeline(
  sql: NeonSQL,
  env: Env
): Promise<void> {
  if (env.ENABLE_SOULMATE !== "true") return;

  const users = await getActiveSoulmateUsers(sql);
  await runMatchingForUsers(sql, env, users);
}

export async function runMatchingPipelineForUser(
  sql: NeonSQL,
  env: Env,
  userId: string
): Promise<void> {
  if (env.ENABLE_SOULMATE !== "true") return;

  const users = await getActiveSoulmateUsers(sql);
  const targetUser = users.find(u => u.user_id === userId);
  if (!targetUser) return;

  await runMatchingForUsers(sql, env, [targetUser]);
}

async function runMatchingForUsers(
  sql: NeonSQL,
  env: Env,
  users: ActiveSoulmateUser[]
): Promise<void> {
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
      const nameA = (userAId === user.user_id ? user.display_name : candidate.display_name) ?? "Someone";
      const nameB = (userBId === user.user_id ? user.display_name : candidate.display_name) ?? "Someone";

      const result = await runSimulatedMatch(sql, env, userAId, userBId, nameA, nameB);

      const matchId = await insertMatchAttempt(
        sql,
        userAId,
        userBId,
        aSoulVersion,
        bSoulVersion,
        result.outcome,
        result.score,
        null, // reasoning generated async per-user
        {
          connectionZones: result.observerResult?.connectionZones ?? null,
          rawEvaluation: result.observerResult as unknown as Record<string, unknown> ?? null
        }
      );

      if (result.outcome === "match" && matchId) {
        matchCounts.set(user.user_id, (matchCounts.get(user.user_id) ?? 0) + 1);
        matchCounts.set(candidate.user_id, (matchCounts.get(candidate.user_id) ?? 0) + 1);

        // Enqueue per-user reasoning generation
        const langA = await getUserLanguage(sql, userAId);
        const langB = await getUserLanguage(sql, userBId);

        await Promise.all([
          enqueueMatchReasoning(env.BACKGROUND_QUEUE, matchId, userAId, nameB, "a", langA),
          enqueueMatchReasoning(env.BACKGROUND_QUEUE, matchId, userBId, nameA, "b", langB),
          notifyNewMatch(sql, env, userAId, nameB).catch((err) =>
            console.error("notifyNewMatch failed for user_a:", err)
          ),
          notifyNewMatch(sql, env, userBId, nameA).catch((err) =>
            console.error("notifyNewMatch failed for user_b:", err)
          )
        ]);
      }
    }
  }
}

async function getUserLanguage(sql: NeonSQL, userId: string): Promise<string> {
  const rows = await sql`SELECT language FROM users WHERE id = ${userId}`;
  return (rows[0] as unknown as { language?: string })?.language ?? "English";
}

async function getActiveSoulmateUsers(sql: NeonSQL): Promise<ActiveSoulmateUser[]> {
  const rows = await sql`
    SELECT sp.user_id, sp.display_name, sp.age, sp.gender, sp.latitude, sp.longitude,
           sp.preferred_age_min, sp.preferred_age_max, sp.preferred_genders,
           vsf.version AS soul_version,
           COALESCE(u.language, 'en') AS language,
           rs.note AS reflection_note
    FROM soulmate_profiles sp
    JOIN users u ON u.id = sp.user_id
    JOIN visible_soul_files vsf ON vsf.user_id = sp.user_id
      AND vsf.status = 'ready'
      AND vsf.completeness >= ${ELIGIBILITY_MIN_COMPLETENESS}
    LEFT JOIN LATERAL (
      SELECT note
      FROM reflection_snapshots
      WHERE user_id = sp.user_id AND status = 'ready'
      ORDER BY version DESC
      LIMIT 1
    ) rs ON true
    WHERE u.is_test_user = false
      AND sp.active = true
      AND vsf.version = (
        SELECT MAX(v2.version) FROM visible_soul_files v2
        WHERE v2.user_id = sp.user_id AND v2.status = 'ready'
      )
      AND (
        SELECT COUNT(*) FROM soul_messages
        WHERE user_id = sp.user_id AND role = 'user'
      ) >= ${ELIGIBILITY_MIN_USER_MESSAGES}
  `;

  return (rows as unknown as Array<ActiveSoulmateUser & { reflection_note: unknown }>)
    .filter((row) => {
      const coverage = extractDomainCoverage(row.reflection_note);
      return computeCoverageProgress(coverage).unlocked;
    })
    .map(({ reflection_note: _ignored, ...user }) => user);
}

function extractDomainCoverage(note: unknown): DomainCoverageEntry[] {
  if (!note || typeof note !== "object") return [];
  const coverage = (note as { domainCoverage?: unknown }).domainCoverage;
  if (!Array.isArray(coverage)) return [];
  return coverage.filter((entry): entry is DomainCoverageEntry =>
    !!entry && typeof entry === "object" &&
    typeof (entry as { domain?: unknown }).domain === "string" &&
    typeof (entry as { depth?: unknown }).depth === "string"
  );
}

async function getCandidates(
  sql: NeonSQL,
  user: ActiveSoulmateUser,
  limit: number
): Promise<Candidate[]> {
  const rows = await sql`
    SELECT sp2.user_id, sp2.display_name,
           vsf.version AS soul_version,
           rs.note AS reflection_note,
           2 * 6371000 * asin(sqrt(
             power(sin(radians(sp2.latitude - ${user.latitude}) / 2), 2) +
             cos(radians(${user.latitude})) * cos(radians(sp2.latitude)) *
             power(sin(radians(sp2.longitude - ${user.longitude}) / 2), 2)
           )) AS distance_m
    FROM soulmate_profiles sp2
    JOIN users u2 ON u2.id = sp2.user_id
    JOIN visible_soul_files vsf ON vsf.user_id = sp2.user_id
      AND vsf.status = 'ready'
      AND vsf.completeness >= ${ELIGIBILITY_MIN_COMPLETENESS}
    LEFT JOIN LATERAL (
      SELECT note
      FROM reflection_snapshots
      WHERE user_id = sp2.user_id AND status = 'ready'
      ORDER BY version DESC
      LIMIT 1
    ) rs ON true
    WHERE sp2.user_id != ${user.user_id}
      AND u2.is_test_user = false
      AND sp2.active = true
      -- Same language
      AND COALESCE(u2.language, 'en') = ${user.language}
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

  return (rows as unknown as Array<Candidate & { reflection_note: unknown }>)
    .filter((row) => computeCoverageProgress(extractDomainCoverage(row.reflection_note)).unlocked)
    .map(({ reflection_note: _ignored, ...candidate }) => candidate);
}
