import type { Env } from "./env.ts";
import type { NeonSQL } from "./db.ts";
import { getUserModelProfileId } from "./db.ts";
import type { VisibleSoulFile, HiddenSoulFile, ReflectionNote } from "../../src/domain/schemas.ts";
import {
  hiddenSoulFileSchema,
  reflectionNoteSchema,
  visibleSoulFileSchema
} from "../../src/domain/schemas.ts";
import {
  buildAssessmentPrompt,
  buildHiddenClinicalPrompt,
  buildReflectionPrompt,
  buildVisibleNarrativePrompt,
  emptyVisibleSoulFile,
  mergeHiddenSoulFile,
  mergeVisibleSoulFile,
  parseAssessment,
  parseHiddenClinical,
  parseReflectionNote,
  parseVisibleNarrative
} from "../../src/domain/soulFile.ts";
import { callLlmText, streamLlmText } from "./llm.ts";
import type { ModelProfileId, ModelTaskConfig } from "./modelProfiles.ts";
import { getTaskConfig } from "./modelProfiles.ts";
import { recordClaudeDebugTrace } from "./debugTraces.ts";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

interface VisibleSoulFileRow {
  user_id: string;
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
}

interface HiddenSoulFileRow {
  user_id: string;
  version: number;
  last_updated: string | Date;
  confidence: string;
  expert_reflections: Json;
  core_drivers: Json;
  core_values: Json;
  voice: Json;
  depth_map: Json;
  analyst_notes: Json;
  big_five_scores: Json;
  schwartz_profile: Json;
  attachment_scores: Json;
  moral_foundations: Json;
  meaning_orientation: string | null;
}

interface ReflectionSnapshotRow {
  user_id: string;
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
  status: ReflectionSnapshotStatus;
  throughMessageCount: number;
  startedAt: string | null;
}

const SYNTHESIS_STALE_PENDING_MS = 15 * 60 * 1000;
const REFLECTION_STALE_PENDING_MS = 10 * 60 * 1000;

export type SynthesisStatus = "ready" | "pending" | "failed";
export type ReflectionSnapshotStatus = "ready" | "pending" | "failed";

function rowToVisibleSoulFile(row: VisibleSoulFileRow): VisibleSoulFile {
  const parsed = visibleSoulFileSchema.safeParse({
    version: row.version,
    lastUpdated: normalizeTimestamp(row.last_updated),
    portrait: row.portrait,
    sections: {
      howYouMove: row.how_you_move ?? "",
      howYouThink: row.how_you_think ?? "",
      howYouConnect: row.how_you_connect ?? "",
      whatYouCarry: row.what_you_carry ?? "",
      whatLightsYouUp: row.what_lights_you_up ?? "",
      yourContradictions: row.your_contradictions ?? "",
      yourVoice: row.your_voice ?? ""
    },
    crystallizedMoments: (row.crystallized_moments as VisibleSoulFile["crystallizedMoments"]) ?? [],
    openThreads: (row.open_threads as string[]) ?? [],
    compassScores: (row.compass_scores as Record<string, number | null>) ?? {},
    personalitySpectrum: row.personality_spectrum ?? {},
    topValues: row.top_values ?? [],
    relationalStyle: row.relational_style
  });

  if (parsed.success) {
    return parsed.data;
  }

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
      yourContradictions: row.your_contradictions ?? "",
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
  const parsed = hiddenSoulFileSchema.safeParse({
    version: row.version,
    lastUpdated: normalizeTimestamp(row.last_updated),
    confidence: row.confidence as HiddenSoulFile["confidence"],
    expertReflections: (row.expert_reflections as HiddenSoulFile["expertReflections"]) ?? { psychologist: [], sociologist: [], linguist: [], narrativeAnalyst: [] },
    coreDrivers: (row.core_drivers as HiddenSoulFile["coreDrivers"]) ?? [],
    coreValues: (row.core_values as string[]) ?? [],
    voice: (row.voice as HiddenSoulFile["voice"]) ?? { register: "casual", density: "moderate", humorStyle: "", conflictStyle: "", disclosureRate: "gradual", signaturePatterns: [], voiceExamples: [] },
    depthMap: (row.depth_map as HiddenSoulFile["depthMap"]) ?? { safeEntryPoints: [], unlockTopics: [], avoidEarly: [], currentlyLiveTopics: [], domainCoverage: [] },
    analystNotes: (row.analyst_notes as string[]) ?? [],
    bigFiveScores: row.big_five_scores ?? {},
    schwartzProfile: row.schwartz_profile ?? [],
    attachmentScores: row.attachment_scores ?? {},
    moralFoundations: row.moral_foundations ?? {},
    meaningOrientation: row.meaning_orientation
  });

  if (parsed.success) {
    return parsed.data;
  }

  return hiddenSoulFileSchema.parse({
    version: row.version,
    lastUpdated: normalizeTimestamp(row.last_updated),
    confidence: row.confidence,
    expertReflections: {},
    coreDrivers: [],
    coreValues: [],
    voice: {},
    depthMap: row.depth_map ?? {},
    analystNotes: row.analyst_notes ?? [],
    bigFiveScores: row.big_five_scores ?? {},
    schwartzProfile: row.schwartz_profile ?? [],
    attachmentScores: row.attachment_scores ?? {},
    moralFoundations: row.moral_foundations ?? {},
    meaningOrientation: row.meaning_orientation
  });
}

function parseReflectionSnapshotNote(note: unknown): ReflectionNote | null {
  const parsed = reflectionNoteSchema.safeParse(note);
  if (parsed.success) {
    return parsed.data;
  }

  if (note == null) {
    return null;
  }

  return reflectionNoteSchema.parse({
    updatedAt: "",
    factualAnchors: {},
    tensions: [],
    recurringThemes: [],
    notableAbsences: [],
    emotionalArc: "",
    domainCoverage: [],
    recentAssistantQuestions: [],
    openLoops: [],
    inferredBigFive: {},
    attachmentSignals: [],
    valueSignals: [],
    moralFoundationSignals: [],
    conflictStyle: "",
    meaningOrientation: ""
  });
}

export async function getVisibleSoulFile(sql: NeonSQL, userId: string): Promise<VisibleSoulFile | null> {
  const rows = await sql`
    SELECT * FROM visible_soul_files WHERE user_id = ${userId}
  `;
  if (!rows[0]) return null;
  return rowToVisibleSoulFile(rows[0] as unknown as VisibleSoulFileRow);
}

export async function upsertVisibleSoulFile(sql: NeonSQL, userId: string, file: VisibleSoulFile): Promise<void> {
  await sql`
    INSERT INTO visible_soul_files (
      user_id, version, last_updated, portrait,
      how_you_move, how_you_think, how_you_connect, what_you_carry,
      what_lights_you_up, your_contradictions, your_voice,
      crystallized_moments, open_threads, compass_scores,
      personality_spectrum, top_values, relational_style,
      status, synthesis_started_at
    ) VALUES (
      ${userId}, ${file.version}, ${file.lastUpdated}, ${file.portrait},
      ${file.sections.howYouMove}, ${file.sections.howYouThink},
      ${file.sections.howYouConnect}, ${file.sections.whatYouCarry},
      ${file.sections.whatLightsYouUp}, ${file.sections.yourContradictions},
      ${file.sections.yourVoice},
      ${JSON.stringify(file.crystallizedMoments)}, ${JSON.stringify(file.openThreads)},
      ${JSON.stringify(file.compassScores ?? {})},
      ${JSON.stringify(file.personalitySpectrum ?? {})},
      ${JSON.stringify(file.topValues ?? [])},
      ${file.relationalStyle},
      'ready', NULL
    )
    ON CONFLICT (user_id) DO UPDATE SET
      version = EXCLUDED.version,
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
}

export async function getHiddenSoulFile(sql: NeonSQL, userId: string): Promise<HiddenSoulFile | null> {
  const rows = await sql`
    SELECT * FROM hidden_soul_files WHERE user_id = ${userId}
  `;
  if (!rows[0]) return null;
  return rowToHiddenSoulFile(rows[0] as unknown as HiddenSoulFileRow);
}

export async function upsertHiddenSoulFile(sql: NeonSQL, userId: string, file: HiddenSoulFile): Promise<void> {
  await sql`
    INSERT INTO hidden_soul_files (
      user_id, version, last_updated, confidence,
      expert_reflections, core_drivers, core_values,
      voice, depth_map, analyst_notes,
      big_five_scores, schwartz_profile, attachment_scores,
      moral_foundations, meaning_orientation
    ) VALUES (
      ${userId}, ${file.version}, ${file.lastUpdated}, ${file.confidence},
      ${JSON.stringify(file.expertReflections)}, ${JSON.stringify(file.coreDrivers)},
      ${JSON.stringify(file.coreValues)}, ${JSON.stringify(file.voice)},
      ${JSON.stringify(file.depthMap)}, ${JSON.stringify(file.analystNotes)},
      ${JSON.stringify(file.bigFiveScores ?? {})},
      ${JSON.stringify(file.schwartzProfile ?? [])},
      ${JSON.stringify(file.attachmentScores ?? {})},
      ${JSON.stringify(file.moralFoundations ?? {})},
      ${file.meaningOrientation}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      version = EXCLUDED.version,
      last_updated = EXCLUDED.last_updated,
      confidence = EXCLUDED.confidence,
      expert_reflections = EXCLUDED.expert_reflections,
      core_drivers = EXCLUDED.core_drivers,
      core_values = EXCLUDED.core_values,
      voice = EXCLUDED.voice,
      depth_map = EXCLUDED.depth_map,
      analyst_notes = EXCLUDED.analyst_notes,
      big_five_scores = EXCLUDED.big_five_scores,
      schwartz_profile = EXCLUDED.schwartz_profile,
      attachment_scores = EXCLUDED.attachment_scores,
      moral_foundations = EXCLUDED.moral_foundations,
      meaning_orientation = EXCLUDED.meaning_orientation
  `;
}

export async function getLatestReflectionSnapshot(sql: NeonSQL, userId: string): Promise<ReflectionNote | null> {
  const rows = await sql`
    SELECT note
    FROM reflection_snapshots
    WHERE user_id = ${userId} AND status = 'ready'
    LIMIT 1
  `;

  return parseReflectionSnapshotNote(rows[0]?.note);
}

export async function getReflectionSnapshotState(
  sql: NeonSQL,
  userId: string
): Promise<ReflectionSnapshotState | null> {
  const rows = await sql`
    SELECT status, through_message_count, started_at
    FROM reflection_snapshots
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  if (!rows[0]) return null;

  return {
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

  if (totalMessageCount < 10) {
    return { needed: false, pending: false, totalMessageCount, lastMessageCreatedAt: lastMessageCreatedAt || null };
  }

  const state = await getReflectionSnapshotState(sql, userId);
  if (state?.status === "pending" && state.startedAt) {
    const isStale = Date.now() - new Date(state.startedAt).getTime() > REFLECTION_STALE_PENDING_MS;
    if (!isStale) {
      return { needed: false, pending: true, totalMessageCount, lastMessageCreatedAt: lastMessageCreatedAt || null };
    }

    await markReflectionSnapshotFailed(sql, userId, "Reflection snapshot timed out");
  }

  const throughMessageCount = state?.throughMessageCount ?? 0;
  const needed = Math.floor(totalMessageCount / 10) > Math.floor(throughMessageCount / 10);
  return { needed, pending: false, totalMessageCount, lastMessageCreatedAt: lastMessageCreatedAt || null };
}

export async function markReflectionSnapshotPending(
  sql: NeonSQL,
  userId: string,
  throughMessageCount: number,
  throughLastMessageCreatedAt: string | null
): Promise<boolean> {
  const rows = await sql`
    INSERT INTO reflection_snapshots (
      user_id,
      through_message_count,
      through_last_message_created_at,
      note,
      status,
      started_at,
      last_error
    ) VALUES (
      ${userId},
      ${throughMessageCount},
      ${throughLastMessageCreatedAt},
      NULL,
      'pending',
      NOW(),
      NULL
    )
    ON CONFLICT (user_id) DO UPDATE SET
      through_message_count = EXCLUDED.through_message_count,
      through_last_message_created_at = EXCLUDED.through_last_message_created_at,
      status = 'pending',
      started_at = NOW(),
      last_error = NULL
    WHERE reflection_snapshots.status IS DISTINCT FROM 'pending'
       OR reflection_snapshots.through_message_count < EXCLUDED.through_message_count
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
  `;
}

async function upsertReflectionSnapshot(
  sql: NeonSQL,
  userId: string,
  note: ReflectionNote,
  throughMessageCount: number,
  throughLastMessageCreatedAt: string | null
): Promise<void> {
  await sql`
    INSERT INTO reflection_snapshots (
      user_id,
      through_message_count,
      through_last_message_created_at,
      note,
      status,
      started_at,
      last_error
    ) VALUES (
      ${userId},
      ${throughMessageCount},
      ${throughLastMessageCreatedAt},
      ${JSON.stringify(note)},
      'ready',
      NULL,
      NULL
    )
    ON CONFLICT (user_id) DO UPDATE SET
      through_message_count = EXCLUDED.through_message_count,
      through_last_message_created_at = EXCLUDED.through_last_message_created_at,
      note = EXCLUDED.note,
      status = 'ready',
      started_at = NULL,
      last_error = NULL
  `;
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

export async function getSynthesisStatus(
  sql: NeonSQL,
  userId: string
): Promise<SynthesisStatus | null> {
  const rows = await sql`
    SELECT status FROM visible_soul_files
    WHERE user_id = ${userId}
  `;
  return (rows[0]?.status as SynthesisStatus | undefined) ?? null;
}

export async function checkSynthesisNeeded(
  sql: NeonSQL,
  userId: string
): Promise<{ needed: boolean; pending: boolean }> {
  const statusRows = await sql`
    SELECT status, synthesis_started_at, last_updated
    FROM visible_soul_files
    WHERE user_id = ${userId}
  `;
  const fileState = statusRows[0];

  if (fileState?.status === "pending" && fileState.synthesis_started_at) {
    const startedAt = new Date(fileState.synthesis_started_at).getTime();
    const isStale = Date.now() - startedAt > SYNTHESIS_STALE_PENDING_MS;
    if (!isStale) {
      return { needed: false, pending: true };
    }

    await sql`
      UPDATE visible_soul_files SET status = 'failed'
      WHERE user_id = ${userId} AND status = 'pending'
    `;
  }

  if (fileState?.status === "failed" && fileState.synthesis_started_at) {
    const newMsgRows = await sql`
      SELECT 1 FROM soul_messages
      WHERE user_id = ${userId} AND created_at > ${fileState.synthesis_started_at}
      LIMIT 1
    `;
    return { needed: newMsgRows.length > 0, pending: false };
  }

  const countRows = await sql`
    SELECT COUNT(*) AS cnt FROM soul_messages
    WHERE user_id = ${userId} AND role = 'user'
  `;
  const userMessageCount = Number(countRows[0]?.cnt ?? 0);
  if (userMessageCount < 3) {
    return { needed: false, pending: false };
  }

  const fileRows = await sql`
    SELECT last_updated FROM visible_soul_files
    WHERE user_id = ${userId} AND status = 'ready'
  `;
  const lastUpdated = fileRows[0]?.last_updated;

  if (!lastUpdated) {
    return { needed: true, pending: false };
  }

  const newMsgRows = await sql`
    SELECT 1 FROM soul_messages
    WHERE user_id = ${userId} AND created_at > ${lastUpdated}
    LIMIT 1
  `;
  return { needed: newMsgRows.length > 0, pending: false };
}

export async function markSynthesisPending(sql: NeonSQL, userId: string): Promise<boolean> {
  const rows = await sql`
    INSERT INTO visible_soul_files (user_id, status, synthesis_started_at)
    VALUES (${userId}, 'pending', NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      status = 'pending',
      synthesis_started_at = NOW()
    WHERE visible_soul_files.status IS DISTINCT FROM 'pending'
    RETURNING user_id
  `;
  return rows.length > 0;
}

export async function markSynthesisFailed(sql: NeonSQL, userId: string): Promise<void> {
  await sql`
    UPDATE visible_soul_files SET status = 'failed'
    WHERE user_id = ${userId}
  `;
}

export async function runReflectionSnapshot(
  sql: NeonSQL,
  env: Env,
  userId: string
): Promise<ReflectionNote | null> {
  const profileId = await getUserModelProfileId(sql, userId);
  const reflectionConfig = getTaskConfig(profileId, "reflection_snapshot");
  const reflectionModel = reflectionConfig.model;
  const reflectionSystemPrompt =
    "You are a careful transcript synthesizer. Output valid JSON only.";
  const allMessages = await getAllSoulMessages(sql, userId);
  const existingSnapshot = await getLatestReflectionSnapshot(sql, userId);

  if (allMessages.length < 10) {
    return existingSnapshot;
  }

  const messageCount = allMessages.length;
  const lastMessageCreatedAt = allMessages[allMessages.length - 1]?.created_at ?? null;
  const prompt = buildReflectionPrompt(
    allMessages.map((message) => ({
      role: message.role,
      content: message.content
    })),
    existingSnapshot,
    messageCount
  );

  try {
    const rawResponse = await callLlmText(
      env,
      reflectionConfig,
      reflectionSystemPrompt,
      [{ role: "user", content: prompt }],
      {
        profileId,
        task: "reflection_snapshot",
        userId
      }
    );

    const parsed = parseReflectionNote(rawResponse);
    await recordClaudeDebugTrace(sql, {
      userId,
      traceKind: "reflection",
      model: reflectionModel,
      systemPrompt: reflectionSystemPrompt,
      inputMessages: [{ role: "user", content: prompt }],
      rawResponse,
      meta: {
        message_count: messageCount,
        parse_success: Boolean(parsed),
        has_existing_snapshot: Boolean(existingSnapshot),
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

    await upsertReflectionSnapshot(sql, userId, parsed, messageCount, lastMessageCreatedAt);
    return parsed;
  } catch (error) {
    await recordClaudeDebugTrace(sql, {
      userId,
      traceKind: "reflection",
      model: reflectionModel,
      systemPrompt: reflectionSystemPrompt,
      inputMessages: [{ role: "user", content: prompt }],
      rawResponse: null,
      meta: {
        message_count: messageCount,
        parse_success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        has_existing_snapshot: Boolean(existingSnapshot),
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

async function collectModelStream(
  env: Env,
  config: ModelTaskConfig,
  systemPrompt: string,
  prompt: string,
  context: {
    profileId: ModelProfileId;
    task: "synthesis_visible";
    userId: string;
  }
): Promise<string> {
  let fullText = "";
  for await (const chunk of streamLlmText(
    env,
    config,
    systemPrompt,
    [{ role: "user", content: prompt }],
    context
  )) {
    fullText += chunk;
  }
  return fullText;
}

export async function runSoulSynthesis(
  sql: NeonSQL,
  env: Env,
  userId: string
): Promise<{ visible: VisibleSoulFile | null; hidden: HiddenSoulFile | null }> {
  const profileId = await getUserModelProfileId(sql, userId);
  const assessmentConfig = getTaskConfig(profileId, "synthesis_assessment");
  const visibleConfig = getTaskConfig(profileId, "synthesis_visible");
  const hiddenConfig = getTaskConfig(profileId, "synthesis_hidden");
  const assessmentModel = assessmentConfig.model;
  const visibleModel = visibleConfig.model;
  const hiddenModel = hiddenConfig.model;
  const assessmentSystemPrompt =
    "You are a careful psychometric analyst. Output valid JSON only.";
  const visibleSystemPrompt =
    "You are a gifted soul writer. Output valid JSON only.";
  const hiddenSystemPrompt =
    "You are a careful internal soul analyst. Output valid JSON only.";
  const allMessages = await getAllSoulMessages(sql, userId);
  const existingVisible = await getVisibleSoulFile(sql, userId);
  const existingHidden = await getHiddenSoulFile(sql, userId);
  const reflectionNote = await getLatestReflectionSnapshot(sql, userId);

  const extractionMessages = allMessages.map((m) => ({
    role: m.role,
    content: m.content
  }));

  const traceMetaBase = {
    message_count: extractionMessages.length,
    has_existing_visible: Boolean(existingVisible),
    has_existing_hidden: Boolean(existingHidden),
    has_reflection_snapshot: Boolean(reflectionNote),
    model_profile_id: profileId,
    assessment_provider: assessmentConfig.provider,
    visible_provider: visibleConfig.provider,
    hidden_provider: hiddenConfig.provider
  };

  const recordSynthesisTrace = async (
    inputMessages: Array<{ role: string; content: string }>,
    rawResponse: string | null,
    meta: Record<string, Json>
  ) => {
    await recordClaudeDebugTrace(sql, {
      userId,
      traceKind: "synthesis",
      model: [assessmentModel, visibleModel, hiddenModel].join(" | "),
      systemPrompt: "dashboard-v2 synthesis pipeline",
      inputMessages,
      rawResponse,
      meta
    }).catch((traceError) => {
      console.error("Failed to record synthesis debug trace:", traceError);
    });
  };

  try {
    const assessmentPromptText = buildAssessmentPrompt(
      extractionMessages,
      reflectionNote,
      existingHidden
    );
    const assessmentRaw = await callLlmText(
      env,
      assessmentConfig,
      assessmentSystemPrompt,
      [{ role: "user", content: assessmentPromptText }],
      {
        profileId,
        task: "synthesis_assessment",
        userId
      }
    );
    const assessment = parseAssessment(assessmentRaw);

    if (!assessment) {
      await recordSynthesisTrace(
        [{ role: "user", content: `ASSESSMENT PROMPT\n\n${assessmentPromptText}` }],
        JSON.stringify({ assessmentRaw }, null, 2),
        {
          ...traceMetaBase,
          pipeline: "assessment_visible_hidden",
          assessment_parse_success: false,
          error: "assessment_parse_failed"
        }
      );
      await markSynthesisFailed(sql, userId);
      return { visible: existingVisible, hidden: existingHidden };
    }

    const visiblePromptText = buildVisibleNarrativePrompt(
      extractionMessages,
      reflectionNote,
      assessment,
      existingVisible
    );
    const hiddenPromptText = buildHiddenClinicalPrompt(
      extractionMessages,
      reflectionNote,
      assessment,
      existingHidden
    );

    const [visibleRaw, hiddenRaw] = await Promise.all([
      collectModelStream(env, visibleConfig, visibleSystemPrompt, visiblePromptText, {
        profileId,
        task: "synthesis_visible",
        userId
      }),
      callLlmText(
        env,
        hiddenConfig,
        hiddenSystemPrompt,
        [{ role: "user", content: hiddenPromptText }],
        {
          profileId,
          task: "synthesis_hidden",
          userId
        }
      )
    ]);

    const visibleResult = parseVisibleNarrative(visibleRaw);
    const hiddenResult = parseHiddenClinical(hiddenRaw);

    await recordSynthesisTrace(
      [
        { role: "user", content: `ASSESSMENT PROMPT\n\n${assessmentPromptText}` },
        { role: "user", content: `VISIBLE NARRATIVE PROMPT\n\n${visiblePromptText}` },
        { role: "user", content: `HIDDEN CLINICAL PROMPT\n\n${hiddenPromptText}` }
      ],
      JSON.stringify(
        {
          assessmentRaw,
          visibleRaw,
          hiddenRaw
        },
        null,
        2
      ),
      {
        ...traceMetaBase,
        pipeline: "assessment_visible_hidden",
        assessment_parse_success: true,
        visible_parse_success: Boolean(visibleResult),
        hidden_parse_success: Boolean(hiddenResult)
      }
    );

    if (!visibleResult || !hiddenResult) {
      await markSynthesisFailed(sql, userId);
      return { visible: existingVisible, hidden: existingHidden };
    }

    const mergedVisible = mergeVisibleSoulFile(existingVisible, {
      portrait: visibleResult.portrait ?? undefined,
      sections: visibleResult.sections,
      crystallizedMoments: visibleResult.crystallizedMoments,
      openThreads: visibleResult.openThreads,
      compassScores: visibleResult.compassScores,
      personalitySpectrum: visibleResult.personalitySpectrum,
      topValues: visibleResult.topValues,
      relationalStyle: visibleResult.relationalStyle
    });
    const mergedHidden = mergeHiddenSoulFile(existingHidden, hiddenResult);

    await upsertVisibleSoulFile(sql, userId, mergedVisible);
    await upsertHiddenSoulFile(sql, userId, mergedHidden);

    return { visible: mergedVisible, hidden: mergedHidden };
  } catch (error) {
    console.error("Soul synthesis pipeline failed:", error);
    await recordSynthesisTrace(
      [],
      null,
      {
        ...traceMetaBase,
        pipeline: "assessment_visible_hidden",
        assessment_parse_success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    );
    await markSynthesisFailed(sql, userId).catch((markError) =>
      console.error("Failed to mark synthesis as failed:", markError)
    );
    return { visible: existingVisible, hidden: existingHidden };
  }
}

export { emptyVisibleSoulFile };
