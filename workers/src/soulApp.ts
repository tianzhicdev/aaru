import type { NeonSQL } from "./db.ts";
import type { VisibleSoulFile, HiddenSoulFile, ReflectionNote } from "../../src/domain/schemas.ts";
import {
  emptyVisibleSoulFile,
  buildSoulSynthesisPrompt,
  parseReflectionNote,
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
  compass_scores: Json;
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

export interface SoulMessageRow {
  id: string;
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
    openThreads: (row.open_threads as string[]) ?? [],
    compassScores: (row.compass_scores as Record<string, number | null>) ?? {}
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
      crystallized_moments, open_threads, compass_scores
    ) VALUES (
      ${userId}, ${file.version}, ${file.lastUpdated}, ${file.portrait},
      ${file.sections.howYouMove}, ${file.sections.howYouThink},
      ${file.sections.howYouConnect}, ${file.sections.whatYouCarry},
      ${file.sections.whatLightsYouUp}, ${file.sections.yourContradictions},
      ${file.sections.yourVoice},
      ${JSON.stringify(file.crystallizedMoments)}, ${JSON.stringify(file.openThreads)},
      ${JSON.stringify(file.compassScores ?? {})}
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
      compass_scores = EXCLUDED.compass_scores
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
    depthMap: (row.depth_map as HiddenSoulFile["depthMap"]) ?? { safeEntryPoints: [], unlockTopics: [], avoidEarly: [], currentlyLiveTopics: [], domainCoverage: [] },
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

// ── Reflection Note (stored on users table) ──────────────────

export async function getReflectionNote(sql: NeonSQL, userId: string): Promise<ReflectionNote | null> {
  const rows = await sql`SELECT reflection_note FROM users WHERE id = ${userId}`;
  if (!rows[0]?.reflection_note) return null;
  return rows[0].reflection_note as ReflectionNote;
}

export async function upsertReflectionNote(sql: NeonSQL, userId: string, note: ReflectionNote): Promise<void> {
  await sql`UPDATE users SET reflection_note = ${JSON.stringify(note)} WHERE id = ${userId}`;
}

// ── Soul Messages CRUD ───────────────────────────────────────

/**
 * Get ALL messages for a user (for synthesis).
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
 * Get the last N messages for a user (for conversation context).
 */
export async function getLastNMessages(sql: NeonSQL, userId: string, n: number): Promise<SoulMessageRow[]> {
  const rows = await sql`
    SELECT * FROM soul_messages
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${n}
  `;
  return (rows as unknown as SoulMessageRow[]).reverse();
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

// ── Full Soul Synthesis (user-triggered) ─────────────────────

export async function runSoulSynthesis(
  sql: NeonSQL,
  apiKey: string,
  userId: string
): Promise<{ visible: VisibleSoulFile | null; hidden: HiddenSoulFile | null }> {
  const allMessages = await getAllSoulMessages(sql, userId);
  const existingVisible = await getVisibleSoulFile(sql, userId);
  const existingHidden = await getHiddenSoulFile(sql, userId);
  const reflectionNote = await getReflectionNote(sql, userId);

  const extractionMessages = allMessages
    .filter(m => m.content !== "[begin]")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content
    }));

  try {
    const synthesisPromptText = buildSoulSynthesisPrompt(
      extractionMessages,
      reflectionNote,
      existingVisible,
      existingHidden
    );

    const synthesisRaw = await callClaude(
      "You are a multi-expert soul analyst. Follow the analysis procedure exactly. Output only the two JSON objects separated by <<<SPLIT>>>.",
      [{ role: "user", content: synthesisPromptText }],
      { apiKey, model: "claude-opus-4-20250514", maxTokens: 8192, temperature: 0.5 }
    );

    const result = parseSoulSynthesis(synthesisRaw);
    if (!result) {
      console.error("Soul synthesis parsing failed");
      return { visible: existingVisible, hidden: existingHidden };
    }

    const mergedVisible = mergeVisibleSoulFile(existingVisible, {
      portrait: result.visible.portrait ?? undefined,
      sections: result.visible.sections,
      crystallizedMoments: result.visible.crystallizedMoments,
      openThreads: result.visible.openThreads,
      compassScores: result.visible.compassScores
    });
    const mergedHidden = mergeHiddenSoulFile(existingHidden, result.hidden);

    await upsertVisibleSoulFile(sql, userId, mergedVisible);
    await upsertHiddenSoulFile(sql, userId, mergedHidden);

    return { visible: mergedVisible, hidden: mergedHidden };
  } catch (error) {
    console.error("Soul synthesis failed:", error);
    return { visible: existingVisible, hidden: existingHidden };
  }
}

// Re-export parseReflectionNote for use in handlers
export { parseReflectionNote } from "../../src/domain/soulFile.ts";
export { emptyVisibleSoulFile } from "../../src/domain/soulFile.ts";
