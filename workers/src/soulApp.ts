import type { Env } from "./env.ts";
import type { NeonSQL } from "./db.ts";
import { getUserModelProfileId } from "./db.ts";
import type { HiddenSoulFile, ReflectionNote, VisibleSoulFile } from "../../src/domain/schemas.ts";
import {
  hiddenSoulFileSchema,
  reflectionNoteSchema,
  visibleSoulFileSchema
} from "../../src/domain/schemas.ts";
import {
  buildHiddenClinicalPrompt,
  buildReflectionPrompt,
  buildVisibleNarrativePrompt,
  emptyVisibleSoulFile,
  getHiddenSoulFileJsonSchema,
  getReflectionNoteJsonSchema,
  getVisibleSoulFileJsonSchema,
  parseHiddenClinical,
  parseReflectionNote,
  parseVisibleNarrative
} from "../../src/domain/soulFile.ts";
import { callLlmJson } from "./llm.ts";
import { getTaskConfig } from "./modelProfiles.ts";
import { recordClaudeDebugTrace } from "./debugTraces.ts";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

interface VisibleSoulFileRow {
  version: number;
  last_updated: string | Date;
  portrait: string | null;
  how_you_move: string;
  how_you_think: string;
  how_you_connect: string;
  what_you_carry: string;
  what_lights_you_up: string;
  your_contradictions: string;
  your_voice: string;
  crystallized_moments: Json;
  open_threads: Json;
  compass_scores: Json;
  personality_spectrum: Json;
  top_values: Json;
  relational_style: string | null;
  status?: SynthesisStatus;
  synthesis_started_at?: string | Date | null;
}

interface HiddenSoulFileRow {
  version: number;
  last_updated: string | Date;
  confidence: string;
  expert_reflections: Json;
  core_drivers: Json;
  core_values: Json;
  voice: Json;
  depth_map: Json;
  analyst_notes: Json;
  honest_insights: Json;
  status?: SynthesisStatus;
  synthesis_started_at?: string | Date | null;
}

interface ReflectionSnapshotRow {
  version: number;
  through_message_count: number | string;
  through_last_message_created_at: string | Date | null;
  note: Json | null;
  status: ReflectionSnapshotStatus;
  started_at: string | Date | null;
  last_error: string | null;
}

function normalizeTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === "string" ? value : "";
}

export interface SoulMessageRow {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ReflectionSnapshotState {
  version: number;
  status: ReflectionSnapshotStatus;
  throughMessageCount: number;
  startedAt: string | null;
}

const SYNTHESIS_STALE_PENDING_MS = 15 * 60 * 1000;
const REFLECTION_STALE_PENDING_MS = 10 * 60 * 1000;

export type SynthesisStatus = "ready" | "pending" | "failed";
export type ReflectionSnapshotStatus = "ready" | "pending" | "failed";

function rowToVisibleSoulFile(row: VisibleSoulFileRow): VisibleSoulFile {
  return visibleSoulFileSchema.parse({
    version: row.version,
    lastUpdated: normalizeTimestamp(row.last_updated),
    portrait: row.portrait,
    sections: {
      howYouMove: row.how_you_move ?? "",
      howYouThink: row.how_you_think ?? "",
      howYouConnect: row.how_you_connect ?? "",
      whatYouCarry: row.what_you_carry ?? "",
      whatLightsYouUp: row.what_lights_you_up ?? "",
      yourTensions: row.your_contradictions ?? "",
      yourVoice: row.your_voice ?? ""
    },
    crystallizedMoments: row.crystallized_moments ?? [],
    openThreads: row.open_threads ?? [],
    compassScores: row.compass_scores ?? {},
    personalitySpectrum: row.personality_spectrum ?? {},
    topValues: row.top_values ?? [],
    relationalStyle: row.relational_style
  });
}

function rowToHiddenSoulFile(row: HiddenSoulFileRow): HiddenSoulFile {
  return hiddenSoulFileSchema.parse({
    version: row.version,
    lastUpdated: normalizeTimestamp(row.last_updated),
    confidence: row.confidence,
    expertReflections: row.expert_reflections ?? {},
    coreDrivers: row.core_drivers ?? [],
    coreValues: row.core_values ?? [],
    voice: row.voice ?? {},
    depthMap: row.depth_map ?? {},
    analystNotes: row.analyst_notes ?? [],
    honestInsights: row.honest_insights ?? []
  });
}

function parseReflectionSnapshotNote(note: unknown): ReflectionNote | null {
  const parsed = reflectionNoteSchema.safeParse(note);
  return parsed.success ? parsed.data : null;
}

export async function getVisibleSoulFile(sql: NeonSQL, userId: string): Promise<VisibleSoulFile | null> {
  const rows = await sql`
    SELECT *
    FROM visible_soul_files
    WHERE user_id = ${userId} AND status = 'ready'
    ORDER BY version DESC
    LIMIT 1
  `;

  if (!rows[0]) return null;
  return rowToVisibleSoulFile(rows[0] as unknown as VisibleSoulFileRow);
}

export async function getHiddenSoulFile(sql: NeonSQL, userId: string): Promise<HiddenSoulFile | null> {
  const rows = await sql`
    SELECT *
    FROM hidden_soul_files
    WHERE user_id = ${userId} AND status = 'ready'
    ORDER BY version DESC
    LIMIT 1
  `;

  if (!rows[0]) return null;
  return rowToHiddenSoulFile(rows[0] as unknown as HiddenSoulFileRow);
}

export async function getLatestReflectionSnapshot(
  sql: NeonSQL,
  userId: string
): Promise<ReflectionNote | null> {
  const rows = await sql`
    SELECT note
    FROM reflection_snapshots
    WHERE user_id = ${userId} AND status = 'ready'
    ORDER BY version DESC
    LIMIT 1
  `;

  return parseReflectionSnapshotNote(rows[0]?.note);
}

export async function getReflectionSnapshotState(
  sql: NeonSQL,
  userId: string
): Promise<ReflectionSnapshotState | null> {
  const rows = await sql`
    SELECT version, status, through_message_count, started_at
    FROM reflection_snapshots
    WHERE user_id = ${userId}
    ORDER BY version DESC
    LIMIT 1
  `;

  if (!rows[0]) return null;

  return {
    version: Number(rows[0].version ?? 0),
    status: rows[0].status as ReflectionSnapshotStatus,
    throughMessageCount: Number(rows[0].through_message_count ?? 0),
    startedAt: normalizeTimestamp(rows[0].started_at)
  };
}

export async function checkReflectionSnapshotNeeded(
  sql: NeonSQL,
  userId: string
): Promise<{ needed: boolean; pending: boolean; totalMessageCount: number; lastMessageCreatedAt: string | null }> {
  const countRows = await sql`
    SELECT COUNT(*)::int AS cnt, MAX(created_at) AS last_created_at
    FROM soul_messages
    WHERE user_id = ${userId}
  `;

  const totalMessageCount = Number(countRows[0]?.cnt ?? 0);
  const lastMessageCreatedAt = normalizeTimestamp(countRows[0]?.last_created_at);

  if (totalMessageCount < 5) {
    return {
      needed: false,
      pending: false,
      totalMessageCount,
      lastMessageCreatedAt: lastMessageCreatedAt || null
    };
  }

  const state = await getReflectionSnapshotState(sql, userId);
  if (state?.status === "pending" && state.startedAt) {
    const isStale = Date.now() - new Date(state.startedAt).getTime() > REFLECTION_STALE_PENDING_MS;
    if (!isStale) {
      return {
        needed: false,
        pending: true,
        totalMessageCount,
        lastMessageCreatedAt: lastMessageCreatedAt || null
      };
    }

    await markReflectionSnapshotFailed(sql, userId, "Reflection snapshot timed out");
  }

  const throughMessageCount = state?.throughMessageCount ?? 0;
  const needed = Math.floor(totalMessageCount / 5) > Math.floor(throughMessageCount / 5);

  return {
    needed,
    pending: false,
    totalMessageCount,
    lastMessageCreatedAt: lastMessageCreatedAt || null
  };
}

export async function markReflectionSnapshotPending(
  sql: NeonSQL,
  userId: string,
  throughMessageCount: number,
  throughLastMessageCreatedAt: string | null
): Promise<boolean> {
  const latest = await getReflectionSnapshotState(sql, userId);
  if (latest?.status === "pending" && latest.throughMessageCount >= throughMessageCount) {
    return false;
  }

  const nextVersion = (latest?.version ?? 0) + 1;
  const rows = await sql`
    INSERT INTO reflection_snapshots (
      user_id,
      version,
      through_message_count,
      through_last_message_created_at,
      note,
      status,
      started_at,
      last_error
    ) VALUES (
      ${userId},
      ${nextVersion},
      ${throughMessageCount},
      ${throughLastMessageCreatedAt},
      NULL,
      'pending',
      NOW(),
      NULL
    )
    RETURNING user_id
  `;

  return rows.length > 0;
}

export async function markReflectionSnapshotFailed(
  sql: NeonSQL,
  userId: string,
  lastError?: string
): Promise<void> {
  await sql`
    UPDATE reflection_snapshots
    SET status = 'failed',
        started_at = NULL,
        last_error = ${lastError ?? null}
    WHERE user_id = ${userId}
      AND version = (
        SELECT version
        FROM reflection_snapshots
        WHERE user_id = ${userId}
        ORDER BY version DESC
        LIMIT 1
      )
  `;
}

async function saveReflectionSnapshot(
  sql: NeonSQL,
  userId: string,
  note: ReflectionNote,
  throughMessageCount: number,
  throughLastMessageCreatedAt: string | null
): Promise<number> {
  const state = await getReflectionSnapshotState(sql, userId);
  const version = state?.status === "pending" ? state.version : (state?.version ?? 0) + 1;

  await sql`
    INSERT INTO reflection_snapshots (
      user_id,
      version,
      through_message_count,
      through_last_message_created_at,
      note,
      status,
      started_at,
      last_error
    ) VALUES (
      ${userId},
      ${version},
      ${throughMessageCount},
      ${throughLastMessageCreatedAt},
      ${JSON.stringify(note)},
      'ready',
      NULL,
      NULL
    )
    ON CONFLICT (user_id, version) DO UPDATE SET
      through_message_count = EXCLUDED.through_message_count,
      through_last_message_created_at = EXCLUDED.through_last_message_created_at,
      note = EXCLUDED.note,
      status = 'ready',
      started_at = NULL,
      last_error = NULL
  `;

  return version;
}

export async function getAllSoulMessages(sql: NeonSQL, userId: string): Promise<SoulMessageRow[]> {
  const rows = await sql`
    SELECT id, user_id, role, content, created_at
    FROM soul_messages
    WHERE user_id = ${userId}
    ORDER BY created_at ASC, id ASC
  `;

  return rows as unknown as SoulMessageRow[];
}

export async function insertSoulMessage(
  sql: NeonSQL,
  userId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await sql`
    INSERT INTO soul_messages (user_id, role, content)
    VALUES (${userId}, ${role}, ${content})
  `;
}

async function getLatestVisibleSynthesisState(
  sql: NeonSQL,
  userId: string
): Promise<{ version: number; status: SynthesisStatus; startedAt: string | null } | null> {
  const rows = await sql`
    SELECT version, status, synthesis_started_at
    FROM visible_soul_files
    WHERE user_id = ${userId}
    ORDER BY version DESC
    LIMIT 1
  `;

  if (!rows[0]) return null;

  return {
    version: Number(rows[0].version ?? 0),
    status: rows[0].status as SynthesisStatus,
    startedAt: normalizeTimestamp(rows[0].synthesis_started_at)
  };
}

async function getLatestHiddenSynthesisState(
  sql: NeonSQL,
  userId: string
): Promise<{ version: number; status: SynthesisStatus; startedAt: string | null } | null> {
  const rows = await sql`
    SELECT version, status, synthesis_started_at
    FROM hidden_soul_files
    WHERE user_id = ${userId}
    ORDER BY version DESC
    LIMIT 1
  `;

  if (!rows[0]) return null;

  return {
    version: Number(rows[0].version ?? 0),
    status: rows[0].status as SynthesisStatus,
    startedAt: normalizeTimestamp(rows[0].synthesis_started_at)
  };
}

export async function getSynthesisStatus(
  sql: NeonSQL,
  userId: string
): Promise<SynthesisStatus | null> {
  const state = await getLatestVisibleSynthesisState(sql, userId);
  return state?.status ?? null;
}

export async function getHiddenSynthesisStatus(
  sql: NeonSQL,
  userId: string
): Promise<SynthesisStatus | null> {
  const state = await getLatestHiddenSynthesisState(sql, userId);
  return state?.status ?? null;
}

async function artifactHasNewMessagesSince(
  sql: NeonSQL,
  userId: string,
  since: string | null
): Promise<boolean> {
  if (!since) {
    return true;
  }

  const rows = await sql`
    SELECT 1
    FROM soul_messages
    WHERE user_id = ${userId} AND created_at > ${since}
    LIMIT 1
  `;

  return rows.length > 0;
}

async function checkArtifactSynthesisNeeded(
  sql: NeonSQL,
  userId: string,
  table: "visible_soul_files" | "hidden_soul_files"
): Promise<{ needed: boolean; pending: boolean }> {
  const latestRows = table === "visible_soul_files"
    ? await sql`
        SELECT version, status, synthesis_started_at
        FROM visible_soul_files
        WHERE user_id = ${userId}
        ORDER BY version DESC
        LIMIT 1
      `
    : await sql`
        SELECT version, status, synthesis_started_at
        FROM hidden_soul_files
        WHERE user_id = ${userId}
        ORDER BY version DESC
        LIMIT 1
      `;

  const latest = latestRows[0];
  if (latest?.status === "pending" && latest.synthesis_started_at) {
    const isStale = Date.now() - new Date(latest.synthesis_started_at).getTime() > SYNTHESIS_STALE_PENDING_MS;
    if (!isStale) {
      return { needed: false, pending: true };
    }

    if (table === "visible_soul_files") {
      await markSynthesisFailed(sql, userId);
    } else {
      await markHiddenSynthesisFailed(sql, userId);
    }
  }

  const userMessageRows = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM soul_messages
    WHERE user_id = ${userId} AND role = 'user'
  `;

  const userMessageCount = Number(userMessageRows[0]?.cnt ?? 0);
  if (userMessageCount < 3) {
    return { needed: false, pending: false };
  }

  const readyRows = table === "visible_soul_files"
    ? await sql`
        SELECT last_updated
        FROM visible_soul_files
        WHERE user_id = ${userId} AND status = 'ready'
        ORDER BY version DESC
        LIMIT 1
      `
    : await sql`
        SELECT last_updated
        FROM hidden_soul_files
        WHERE user_id = ${userId} AND status = 'ready'
        ORDER BY version DESC
        LIMIT 1
      `;

  const lastUpdated = normalizeTimestamp(readyRows[0]?.last_updated);
  const needed = await artifactHasNewMessagesSince(sql, userId, lastUpdated || null);
  return { needed, pending: false };
}

export async function checkSynthesisNeeded(
  sql: NeonSQL,
  userId: string
): Promise<{ needed: boolean; pending: boolean }> {
  return checkArtifactSynthesisNeeded(sql, userId, "visible_soul_files");
}

export async function checkHiddenSynthesisNeeded(
  sql: NeonSQL,
  userId: string
): Promise<{ needed: boolean; pending: boolean }> {
  return checkArtifactSynthesisNeeded(sql, userId, "hidden_soul_files");
}

export async function markSynthesisPending(sql: NeonSQL, userId: string): Promise<boolean> {
  const latest = await getLatestVisibleSynthesisState(sql, userId);
  if (latest?.status === "pending") {
    return false;
  }

  const nextVersion = (latest?.version ?? 0) + 1;
  const rows = await sql`
    INSERT INTO visible_soul_files (user_id, version, status, synthesis_started_at)
    VALUES (${userId}, ${nextVersion}, 'pending', NOW())
    RETURNING user_id
  `;

  return rows.length > 0;
}

export async function markHiddenSynthesisPending(sql: NeonSQL, userId: string): Promise<boolean> {
  const latest = await getLatestHiddenSynthesisState(sql, userId);
  if (latest?.status === "pending") {
    return false;
  }

  const nextVersion = (latest?.version ?? 0) + 1;
  const rows = await sql`
    INSERT INTO hidden_soul_files (user_id, version, status, synthesis_started_at)
    VALUES (${userId}, ${nextVersion}, 'pending', NOW())
    RETURNING user_id
  `;

  return rows.length > 0;
}

export async function markSynthesisFailed(sql: NeonSQL, userId: string): Promise<void> {
  await sql`
    UPDATE visible_soul_files
    SET status = 'failed'
    WHERE user_id = ${userId}
      AND version = (
        SELECT version
        FROM visible_soul_files
        WHERE user_id = ${userId}
        ORDER BY version DESC
        LIMIT 1
      )
  `;
}

export async function markHiddenSynthesisFailed(sql: NeonSQL, userId: string): Promise<void> {
  await sql`
    UPDATE hidden_soul_files
    SET status = 'failed'
    WHERE user_id = ${userId}
      AND version = (
        SELECT version
        FROM hidden_soul_files
        WHERE user_id = ${userId}
        ORDER BY version DESC
        LIMIT 1
      )
  `;
}

async function saveVisibleSoulFile(
  sql: NeonSQL,
  userId: string,
  file: VisibleSoulFile
): Promise<number> {
  const latest = await getLatestVisibleSynthesisState(sql, userId);
  const version = latest?.status === "pending" ? latest.version : (latest?.version ?? 0) + 1;
  const timestamp = new Date().toISOString();

  await sql`
    INSERT INTO visible_soul_files (
      user_id, version, last_updated, portrait,
      how_you_move, how_you_think, how_you_connect, what_you_carry,
      what_lights_you_up, your_contradictions, your_voice,
      crystallized_moments, open_threads, compass_scores,
      personality_spectrum, top_values, relational_style,
      status, synthesis_started_at
    ) VALUES (
      ${userId}, ${version}, ${timestamp}, ${file.portrait},
      ${file.sections.howYouMove}, ${file.sections.howYouThink},
      ${file.sections.howYouConnect}, ${file.sections.whatYouCarry},
      ${file.sections.whatLightsYouUp}, ${file.sections.yourTensions},
      ${file.sections.yourVoice},
      ${JSON.stringify(file.crystallizedMoments)},
      ${JSON.stringify(file.openThreads)},
      ${JSON.stringify(file.compassScores ?? {})},
      ${JSON.stringify(file.personalitySpectrum ?? {})},
      ${JSON.stringify(file.topValues ?? [])},
      ${file.relationalStyle},
      'ready',
      NULL
    )
    ON CONFLICT (user_id, version) DO UPDATE SET
      last_updated = EXCLUDED.last_updated,
      portrait = EXCLUDED.portrait,
      how_you_move = EXCLUDED.how_you_move,
      how_you_think = EXCLUDED.how_you_think,
      how_you_connect = EXCLUDED.how_you_connect,
      what_you_carry = EXCLUDED.what_you_carry,
      what_lights_you_up = EXCLUDED.what_lights_you_up,
      your_contradictions = EXCLUDED.your_contradictions,
      your_voice = EXCLUDED.your_voice,
      crystallized_moments = EXCLUDED.crystallized_moments,
      open_threads = EXCLUDED.open_threads,
      compass_scores = EXCLUDED.compass_scores,
      personality_spectrum = EXCLUDED.personality_spectrum,
      top_values = EXCLUDED.top_values,
      relational_style = EXCLUDED.relational_style,
      status = 'ready',
      synthesis_started_at = NULL
  `;

  return version;
}

async function saveHiddenSoulFile(
  sql: NeonSQL,
  userId: string,
  file: HiddenSoulFile
): Promise<number> {
  const latest = await getLatestHiddenSynthesisState(sql, userId);
  const version = latest?.status === "pending" ? latest.version : (latest?.version ?? 0) + 1;
  const timestamp = new Date().toISOString();

  await sql`
    INSERT INTO hidden_soul_files (
      user_id, version, last_updated, confidence,
      expert_reflections, core_drivers, core_values,
      voice, depth_map, analyst_notes, honest_insights,
      status, synthesis_started_at
    ) VALUES (
      ${userId}, ${version}, ${timestamp}, ${file.confidence},
      ${JSON.stringify(file.expertReflections)},
      ${JSON.stringify(file.coreDrivers)},
      ${JSON.stringify(file.coreValues)},
      ${JSON.stringify(file.voice)},
      ${JSON.stringify(file.depthMap)},
      ${JSON.stringify(file.analystNotes)},
      ${JSON.stringify(file.honestInsights)},
      'ready',
      NULL
    )
    ON CONFLICT (user_id, version) DO UPDATE SET
      last_updated = EXCLUDED.last_updated,
      confidence = EXCLUDED.confidence,
      expert_reflections = EXCLUDED.expert_reflections,
      core_drivers = EXCLUDED.core_drivers,
      core_values = EXCLUDED.core_values,
      voice = EXCLUDED.voice,
      depth_map = EXCLUDED.depth_map,
      analyst_notes = EXCLUDED.analyst_notes,
      honest_insights = EXCLUDED.honest_insights,
      status = 'ready',
      synthesis_started_at = NULL
  `;

  return version;
}

export async function runReflectionSnapshot(
  sql: NeonSQL,
  env: Env,
  userId: string
): Promise<ReflectionNote | null> {
  const profileId = await getUserModelProfileId(sql, userId);
  const reflectionConfig = getTaskConfig(profileId, "reflection_snapshot");
  const allMessages = await getAllSoulMessages(sql, userId);
  const existingSnapshot = await getLatestReflectionSnapshot(sql, userId);

  if (allMessages.length < 5) {
    return existingSnapshot;
  }

  const prompt = buildReflectionPrompt(
    allMessages.map((message) => ({ role: message.role, content: message.content })),
    allMessages.length
  );

  try {
    const rawResponse = await callLlmJson<ReflectionNote>(
      env,
      reflectionConfig,
      "You are a careful transcript synthesizer. Output valid JSON only.",
      [{ role: "user", content: prompt }],
      {
        profileId,
        task: "reflection_snapshot",
        userId
      },
      {
        name: "reflection_note",
        schema: getReflectionNoteJsonSchema(),
        strict: true
      }
    );

    const parsed = parseReflectionNote(JSON.stringify(rawResponse));
    await recordClaudeDebugTrace(sql, env, {
      userId,
      traceKind: "reflection",
      model: reflectionConfig.model,
      systemPrompt: "You are a careful transcript synthesizer. Output valid JSON only.",
      inputMessages: [{ role: "user", content: prompt }],
      rawResponse: JSON.stringify(rawResponse),
      meta: {
        message_count: allMessages.length,
        parse_success: Boolean(parsed),
        provider: reflectionConfig.provider,
        model_profile_id: profileId
      }
    }).catch((traceError) => {
      console.error("Failed to record reflection debug trace:", traceError);
    });

    if (!parsed) {
      await markReflectionSnapshotFailed(sql, userId, "Reflection parsing failed");
      return existingSnapshot;
    }

    await saveReflectionSnapshot(
      sql,
      userId,
      parsed,
      allMessages.length,
      allMessages[allMessages.length - 1]?.created_at ?? null
    );

    return parsed;
  } catch (error) {
    await recordClaudeDebugTrace(sql, env, {
      userId,
      traceKind: "reflection",
      model: reflectionConfig.model,
      systemPrompt: "You are a careful transcript synthesizer. Output valid JSON only.",
      inputMessages: [{ role: "user", content: prompt }],
      rawResponse: null,
      meta: {
        message_count: allMessages.length,
        parse_success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        provider: reflectionConfig.provider,
        model_profile_id: profileId
      }
    }).catch((traceError) => {
      console.error("Failed to record failed reflection trace:", traceError);
    });

    console.error("Reflection snapshot failed:", error);
    await markReflectionSnapshotFailed(
      sql,
      userId,
      error instanceof Error ? error.message : "Unknown error"
    );
    return existingSnapshot;
  }
}

export async function runVisibleSynthesis(
  sql: NeonSQL,
  env: Env,
  userId: string
): Promise<VisibleSoulFile | null> {
  const profileId = await getUserModelProfileId(sql, userId);
  const visibleConfig = getTaskConfig(profileId, "synthesis_visible");
  const [allMessages, reflectionNote, existingVisible] = await Promise.all([
    getAllSoulMessages(sql, userId),
    getLatestReflectionSnapshot(sql, userId),
    getVisibleSoulFile(sql, userId)
  ]);

  if (allMessages.length === 0) {
    return existingVisible;
  }

  const prompt = buildVisibleNarrativePrompt(
    allMessages.map((message) => ({ role: message.role, content: message.content })),
    reflectionNote
  );

  try {
    const rawResponse = await callLlmJson<VisibleSoulFile>(
      env,
      visibleConfig,
      "You are a gifted soul writer. Output valid JSON only.",
      [{ role: "user", content: prompt }],
      {
        profileId,
        task: "synthesis_visible",
        userId
      },
      {
        name: "visible_soul_file",
        schema: getVisibleSoulFileJsonSchema(),
        strict: true
      }
    );

    const parsed = parseVisibleNarrative(JSON.stringify(rawResponse));
    await recordClaudeDebugTrace(sql, env, {
      userId,
      traceKind: "synthesis",
      model: visibleConfig.model,
      systemPrompt: "visible soul synthesis",
      inputMessages: [{ role: "user", content: prompt }],
      rawResponse: JSON.stringify(rawResponse),
      meta: {
        artifact: "visible",
        message_count: allMessages.length,
        parse_success: Boolean(parsed),
        has_reflection_snapshot: Boolean(reflectionNote),
        provider: visibleConfig.provider,
        model_profile_id: profileId
      }
    }).catch((traceError) => {
      console.error("Failed to record visible synthesis trace:", traceError);
    });

    if (!parsed) {
      await markSynthesisFailed(sql, userId);
      return existingVisible;
    }

    const version = await saveVisibleSoulFile(sql, userId, parsed);
    return {
      ...parsed,
      version,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error("Visible synthesis failed:", error);
    await markSynthesisFailed(sql, userId);
    return existingVisible;
  }
}

export async function runHiddenSynthesis(
  sql: NeonSQL,
  env: Env,
  userId: string
): Promise<HiddenSoulFile | null> {
  const profileId = await getUserModelProfileId(sql, userId);
  const hiddenConfig = getTaskConfig(profileId, "synthesis_hidden");
  const [allMessages, reflectionNote, existingHidden] = await Promise.all([
    getAllSoulMessages(sql, userId),
    getLatestReflectionSnapshot(sql, userId),
    getHiddenSoulFile(sql, userId)
  ]);

  if (allMessages.length === 0) {
    return existingHidden;
  }

  const prompt = buildHiddenClinicalPrompt(
    allMessages.map((message) => ({ role: message.role, content: message.content })),
    reflectionNote
  );

  try {
    const rawResponse = await callLlmJson<HiddenSoulFile>(
      env,
      hiddenConfig,
      "You are a careful internal soul analyst. Output valid JSON only.",
      [{ role: "user", content: prompt }],
      {
        profileId,
        task: "synthesis_hidden",
        userId
      },
      {
        name: "hidden_soul_file",
        schema: getHiddenSoulFileJsonSchema(),
        strict: true
      }
    );

    const parsed = parseHiddenClinical(JSON.stringify(rawResponse));
    await recordClaudeDebugTrace(sql, env, {
      userId,
      traceKind: "synthesis",
      model: hiddenConfig.model,
      systemPrompt: "hidden soul synthesis",
      inputMessages: [{ role: "user", content: prompt }],
      rawResponse: JSON.stringify(rawResponse),
      meta: {
        artifact: "hidden",
        message_count: allMessages.length,
        parse_success: Boolean(parsed),
        has_reflection_snapshot: Boolean(reflectionNote),
        provider: hiddenConfig.provider,
        model_profile_id: profileId
      }
    }).catch((traceError) => {
      console.error("Failed to record hidden synthesis trace:", traceError);
    });

    if (!parsed) {
      await markHiddenSynthesisFailed(sql, userId);
      return existingHidden;
    }

    const version = await saveHiddenSoulFile(sql, userId, parsed);
    return {
      ...parsed,
      version,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error("Hidden synthesis failed:", error);
    await markHiddenSynthesisFailed(sql, userId);
    return existingHidden;
  }
}

export { emptyVisibleSoulFile };
