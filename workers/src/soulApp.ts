import type { NeonSQL } from "./db.ts";
import type { VisibleSoulFile, HiddenSoulFile, ReflectionNote } from "../../src/domain/schemas.ts";
import { STALE_SESSION_HOURS } from "../../src/domain/constants.ts";
import {
  emptyVisibleSoulFile,
  emptyHiddenSoulFile,
  buildReflectionPrompt,
  buildLightVisiblePrompt,
  buildSoulSynthesisPrompt,
  parseReflectionNote,
  parseLightVisibleUpdate,
  parseSoulSynthesis,
  mergeVisibleSoulFile,
  mergeHiddenSoulFile
} from "../../src/domain/soulFile.ts";
import { callClaude } from "./claude.ts";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// ── Row types ────────────────────────────────────────────────

interface VisibleSoulFileRow {
  user_id: string;
  version: number;
  last_updated: string;
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
}

interface HiddenSoulFileRow {
  user_id: string;
  version: number;
  last_updated: string;
  confidence: string;
  expert_reflections: Json;
  core_drivers: Json;
  core_values: Json;
  voice: Json;
  depth_map: Json;
  analyst_notes: Json;
}

export interface SoulSessionRow {
  id: string;
  user_id: string;
  session_number: number;
  status: string;
  exchange_count: number;
  reflection_notes: Json;
  started_at: string;
  completed_at: string | null;
  next_available_at: string | null;
  extraction_error: string | null;
  created_at: string;
}

export interface SoulMessageRow {
  id: string;
  session_id: string;
  user_id: string;
  role: string;
  content: string;
  created_at: string;
}

// ── Visible Soul File CRUD ───────────────────────────────────

function rowToVisibleSoulFile(row: VisibleSoulFileRow): VisibleSoulFile {
  return {
    version: row.version,
    lastUpdated: row.last_updated,
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
    openThreads: (row.open_threads as string[]) ?? []
  };
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
      crystallized_moments, open_threads
    ) VALUES (
      ${userId}, ${file.version}, ${file.lastUpdated}, ${file.portrait},
      ${file.sections.howYouMove}, ${file.sections.howYouThink},
      ${file.sections.howYouConnect}, ${file.sections.whatYouCarry},
      ${file.sections.whatLightsYouUp}, ${file.sections.yourContradictions},
      ${file.sections.yourVoice},
      ${JSON.stringify(file.crystallizedMoments)}, ${JSON.stringify(file.openThreads)}
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
      open_threads = EXCLUDED.open_threads
  `;
}

// ── Hidden Soul File CRUD ────────────────────────────────────

function rowToHiddenSoulFile(row: HiddenSoulFileRow): HiddenSoulFile {
  return {
    version: row.version,
    lastUpdated: row.last_updated,
    confidence: row.confidence as HiddenSoulFile["confidence"],
    expertReflections: (row.expert_reflections as HiddenSoulFile["expertReflections"]) ?? { psychologist: [], sociologist: [], linguist: [], narrativeAnalyst: [] },
    coreDrivers: (row.core_drivers as HiddenSoulFile["coreDrivers"]) ?? [],
    coreValues: (row.core_values as string[]) ?? [],
    voice: (row.voice as HiddenSoulFile["voice"]) ?? { register: "casual", density: "moderate", humorStyle: "", conflictStyle: "", disclosureRate: "gradual", signaturePatterns: [], voiceExamples: [] },
    depthMap: (row.depth_map as HiddenSoulFile["depthMap"]) ?? { safeEntryPoints: [], unlockTopics: [], avoidEarly: [], currentlyLiveTopics: [] },
    analystNotes: (row.analyst_notes as string[]) ?? []
  };
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
      voice, depth_map, analyst_notes
    ) VALUES (
      ${userId}, ${file.version}, ${file.lastUpdated}, ${file.confidence},
      ${JSON.stringify(file.expertReflections)}, ${JSON.stringify(file.coreDrivers)},
      ${JSON.stringify(file.coreValues)}, ${JSON.stringify(file.voice)},
      ${JSON.stringify(file.depthMap)}, ${JSON.stringify(file.analystNotes)}
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
      analyst_notes = EXCLUDED.analyst_notes
  `;
}

// ── Soul Session CRUD ────────────────────────────────────────

export async function getActiveSession(sql: NeonSQL, userId: string): Promise<SoulSessionRow | null> {
  const rows = await sql`
    SELECT * FROM soul_sessions
    WHERE user_id = ${userId} AND status IN ('in_session', 'extracting', 'synthesizing')
    ORDER BY created_at DESC LIMIT 1
  `;
  return (rows[0] as unknown as SoulSessionRow) ?? null;
}

export async function getLatestSession(sql: NeonSQL, userId: string): Promise<SoulSessionRow | null> {
  const rows = await sql`
    SELECT * FROM soul_sessions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT 1
  `;
  return (rows[0] as unknown as SoulSessionRow) ?? null;
}

export async function createSoulSession(sql: NeonSQL, userId: string, sessionNumber: number): Promise<SoulSessionRow> {
  const rows = await sql`
    INSERT INTO soul_sessions (user_id, session_number, status, exchange_count, reflection_notes)
    VALUES (${userId}, ${sessionNumber}, 'in_session', 0, '[]'::jsonb)
    RETURNING *
  `;
  return rows[0] as unknown as SoulSessionRow;
}

export async function updateSoulSession(
  sql: NeonSQL,
  sessionId: string,
  patch: Record<string, Json>
): Promise<void> {
  // Build dynamic SET clause from patch keys
  const keys = Object.keys(patch);
  if (keys.length === 0) return;

  // For simplicity with neon's tagged template, build individual updates
  // This handles the common cases: status, completed_at, exchange_count, reflection_notes, extraction_error
  if (patch.status !== undefined) {
    await sql`UPDATE soul_sessions SET status = ${patch.status as string} WHERE id = ${sessionId}`;
  }
  if (patch.completed_at !== undefined) {
    await sql`UPDATE soul_sessions SET completed_at = ${patch.completed_at as string} WHERE id = ${sessionId}`;
  }
  if (patch.exchange_count !== undefined) {
    await sql`UPDATE soul_sessions SET exchange_count = ${patch.exchange_count as number} WHERE id = ${sessionId}`;
  }
  if (patch.reflection_notes !== undefined) {
    await sql`UPDATE soul_sessions SET reflection_notes = ${JSON.stringify(patch.reflection_notes)} WHERE id = ${sessionId}`;
  }
  if (patch.extraction_error !== undefined) {
    await sql`UPDATE soul_sessions SET extraction_error = ${patch.extraction_error as string} WHERE id = ${sessionId}`;
  }
}

// ── Soul Messages CRUD ───────────────────────────────────────

export async function getSoulMessages(sql: NeonSQL, sessionId: string): Promise<SoulMessageRow[]> {
  const rows = await sql`
    SELECT * FROM soul_messages
    WHERE session_id = ${sessionId}
    ORDER BY created_at ASC
  `;
  return rows as unknown as SoulMessageRow[];
}

/**
 * Get ALL messages for a user across all sessions (original — causes egress issue).
 * Kept for synthesis which needs full history for a session.
 */
export async function getAllSoulMessages(sql: NeonSQL, userId: string): Promise<SoulMessageRow[]> {
  const rows = await sql`
    SELECT * FROM soul_messages
    WHERE user_id = ${userId}
    ORDER BY created_at ASC
  `;
  return rows as unknown as SoulMessageRow[];
}

/**
 * EGRESS FIX: Get recent messages for Claude context.
 * Returns current session messages + capped previous history.
 */
export async function getRecentMessages(
  sql: NeonSQL,
  userId: string,
  currentSessionId: string,
  windowSize: number = 20
): Promise<SoulMessageRow[]> {
  // Get all current session messages (always needed)
  // Plus the last `windowSize` messages from previous sessions for continuity
  const rows = await sql`
    (
      SELECT * FROM soul_messages
      WHERE session_id = ${currentSessionId}
    )
    UNION ALL
    (
      SELECT * FROM soul_messages
      WHERE user_id = ${userId}
        AND session_id != ${currentSessionId}
      ORDER BY created_at DESC
      LIMIT ${windowSize}
    )
    ORDER BY created_at ASC
  `;
  return rows as unknown as SoulMessageRow[];
}

/**
 * EGRESS FIX: Get only current session messages for bootstrap.
 * Soul file already captures long-term memory.
 */
export async function getCurrentSessionMessages(
  sql: NeonSQL,
  sessionId: string
): Promise<SoulMessageRow[]> {
  const rows = await sql`
    SELECT * FROM soul_messages
    WHERE session_id = ${sessionId}
    ORDER BY created_at ASC
  `;
  return rows as unknown as SoulMessageRow[];
}

export async function insertSoulMessage(
  sql: NeonSQL,
  sessionId: string,
  userId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await sql`
    INSERT INTO soul_messages (session_id, user_id, role, content)
    VALUES (${sessionId}, ${userId}, ${role}, ${content})
  `;
}

// ── Session Lifecycle ────────────────────────────────────────

export function isSessionStale(session: SoulSessionRow): boolean {
  const lastActivity = new Date(session.started_at).getTime();
  const staleThreshold = STALE_SESSION_HOURS * 60 * 60 * 1000;
  return Date.now() - lastActivity > staleThreshold;
}

export async function autoCompleteStaleSession(sql: NeonSQL, session: SoulSessionRow): Promise<void> {
  await updateSoulSession(sql, session.id, {
    status: "complete",
    completed_at: new Date().toISOString(),
    extraction_error: "auto-completed: session was stale"
  });
}

// ── Mid-Conversation Reflection Update ────────────────────────

export async function runReflectionUpdate(
  sql: NeonSQL,
  apiKey: string,
  session: SoulSessionRow,
  userId: string
): Promise<{ reflectionNote: ReflectionNote | null; visibleSoulFile: VisibleSoulFile | null }> {
  const messages = await getSoulMessages(sql, session.id);
  const existingVisible = await getVisibleSoulFile(sql, userId);

  const extractionMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content
  }));

  const existingNotes = (session.reflection_notes as ReflectionNote[]) ?? [];
  const lastNote = existingNotes.length > 0 ? existingNotes[existingNotes.length - 1] : null;

  try {
    const reflectionPromptText = buildReflectionPrompt(
      extractionMessages,
      lastNote,
      session.exchange_count
    );

    const reflectionRaw = await callClaude(
      "You are a conversation analyst. Output valid JSON only.",
      [{ role: "user", content: reflectionPromptText }],
      { apiKey, model: "claude-haiku-4-5-20251001", maxTokens: 1024, temperature: 0.3 }
    );

    const reflectionNote = parseReflectionNote(reflectionRaw);

    if (reflectionNote) {
      const updatedNotes = [...existingNotes, reflectionNote];
      await updateSoulSession(sql, session.id, {
        reflection_notes: updatedNotes as unknown as Json
      });
    }

    const lightPromptText = buildLightVisiblePrompt(
      extractionMessages,
      existingVisible,
      reflectionNote ?? lastNote,
      session.session_number
    );

    const lightRaw = await callClaude(
      "You are a soul file writer. Output valid JSON only.",
      [{ role: "user", content: lightPromptText }],
      { apiKey, model: "claude-haiku-4-5-20251001", maxTokens: 1024, temperature: 0.5 }
    );

    const lightUpdate = parseLightVisibleUpdate(lightRaw);
    if (lightUpdate) {
      const merged = mergeVisibleSoulFile(existingVisible, lightUpdate);
      await upsertVisibleSoulFile(sql, userId, merged);
      return { reflectionNote, visibleSoulFile: merged };
    }

    return { reflectionNote, visibleSoulFile: existingVisible };
  } catch (error) {
    console.error("Reflection update failed:", error);
    return { reflectionNote: null, visibleSoulFile: existingVisible };
  }
}

// ── Full Soul Synthesis ──────────────────────────────────────

export async function runSoulSynthesis(
  sql: NeonSQL,
  apiKey: string,
  session: SoulSessionRow,
  userId: string
): Promise<{ visible: VisibleSoulFile | null; hidden: HiddenSoulFile | null }> {
  const messages = await getSoulMessages(sql, session.id);
  const existingVisible = await getVisibleSoulFile(sql, userId);
  const existingHidden = await getHiddenSoulFile(sql, userId);

  const extractionMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content
  }));

  const reflectionNotes = (session.reflection_notes as ReflectionNote[]) ?? [];

  try {
    await updateSoulSession(sql, session.id, { status: "synthesizing" });

    const synthesisPromptText = buildSoulSynthesisPrompt(
      extractionMessages,
      reflectionNotes,
      existingVisible,
      existingHidden,
      session.session_number
    );

    const synthesisRaw = await callClaude(
      "You are a multi-expert soul analyst. Follow the analysis procedure exactly. Output only the two JSON objects separated by <<<SPLIT>>>.",
      [{ role: "user", content: synthesisPromptText }],
      { apiKey, model: "claude-opus-4-20250514", maxTokens: 8192, temperature: 0.5 }
    );

    const result = parseSoulSynthesis(synthesisRaw);
    if (!result) {
      console.error("Soul synthesis parsing failed");
      await updateSoulSession(sql, session.id, {
        status: "complete",
        completed_at: new Date().toISOString(),
        extraction_error: "synthesis parsing failed"
      });
      return { visible: existingVisible, hidden: existingHidden };
    }

    const mergedVisible = mergeVisibleSoulFile(existingVisible, {
      portrait: result.visible.portrait ?? undefined,
      sections: result.visible.sections,
      crystallizedMoments: result.visible.crystallizedMoments,
      openThreads: result.visible.openThreads
    });
    const mergedHidden = mergeHiddenSoulFile(existingHidden, result.hidden);

    await upsertVisibleSoulFile(sql, userId, mergedVisible);
    await upsertHiddenSoulFile(sql, userId, mergedHidden);

    await updateSoulSession(sql, session.id, {
      status: "complete",
      completed_at: new Date().toISOString()
    });

    return { visible: mergedVisible, hidden: mergedHidden };
  } catch (error) {
    console.error("Soul synthesis failed:", error);
    await updateSoulSession(sql, session.id, {
      status: "complete",
      completed_at: new Date().toISOString(),
      extraction_error: `synthesis failed: ${error instanceof Error ? error.message : String(error)}`
    });
    return { visible: existingVisible, hidden: existingHidden };
  }
}

/**
 * Bootstrap a user's soul mirror state.
 */
export async function bootstrapSoulState(sql: NeonSQL, userId: string): Promise<{
  visibleSoulFile: VisibleSoulFile | null;
  activeSession: SoulSessionRow | null;
  canStartSession: boolean;
  cooldownRemainingMs: number;
  nextSessionNumber: number;
}> {
  const visibleSoulFile = await getVisibleSoulFile(sql, userId);
  let activeSession = await getActiveSession(sql, userId);

  if (activeSession && isSessionStale(activeSession)) {
    await autoCompleteStaleSession(sql, activeSession);
    activeSession = null;
  }

  const latestSession = await getLatestSession(sql, userId);
  const nextSessionNumber = (latestSession?.session_number ?? 0) + (activeSession ? 0 : 1);

  return {
    visibleSoulFile,
    activeSession,
    canStartSession: !activeSession,
    cooldownRemainingMs: 0,
    nextSessionNumber: Math.max(1, nextSessionNumber)
  };
}
