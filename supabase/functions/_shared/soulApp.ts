import type { VisibleSoulFile, HiddenSoulFile, ReflectionNote } from "../../../src/domain/schemas.ts";
import { STALE_SESSION_HOURS } from "../../../src/domain/constants.ts";
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
} from "../../../src/domain/soulFile.ts";
import { callClaude } from "./claude.ts";
import { supabaseUrl, supabaseServiceRoleKey } from "./env.ts";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseServiceRoleKey(),
      Authorization: `Bearer ${supabaseServiceRoleKey()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase REST error ${response.status}: ${await response.text()}`);
  }

  if (response.status === 204) return [] as T;
  const text = await response.text();
  if (text.trim().length === 0) return [] as T;
  return JSON.parse(text) as T;
}

// ── Visible Soul File CRUD ─────────────────────────────────────

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
  created_at: string;
}

export async function getVisibleSoulFile(userId: string): Promise<VisibleSoulFile | null> {
  const rows = await rest<VisibleSoulFileRow[]>(
    `visible_soul_files?user_id=eq.${userId}&select=*`
  );
  if (!rows[0]) return null;
  const row = rows[0];
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

export async function upsertVisibleSoulFile(userId: string, file: VisibleSoulFile): Promise<void> {
  await rest<Json>("visible_soul_files?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      user_id: userId,
      version: file.version,
      last_updated: file.lastUpdated,
      portrait: file.portrait,
      how_you_move: file.sections.howYouMove,
      how_you_think: file.sections.howYouThink,
      how_you_connect: file.sections.howYouConnect,
      what_you_carry: file.sections.whatYouCarry,
      what_lights_you_up: file.sections.whatLightsYouUp,
      your_contradictions: file.sections.yourContradictions,
      your_voice: file.sections.yourVoice,
      crystallized_moments: file.crystallizedMoments,
      open_threads: file.openThreads
    }])
  });
}

// ── Hidden Soul File CRUD ──────────────────────────────────────

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
  created_at: string;
}

export async function getHiddenSoulFile(userId: string): Promise<HiddenSoulFile | null> {
  const rows = await rest<HiddenSoulFileRow[]>(
    `hidden_soul_files?user_id=eq.${userId}&select=*`
  );
  if (!rows[0]) return null;
  const row = rows[0];
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

export async function upsertHiddenSoulFile(userId: string, file: HiddenSoulFile): Promise<void> {
  await rest<Json>("hidden_soul_files?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      user_id: userId,
      version: file.version,
      last_updated: file.lastUpdated,
      confidence: file.confidence,
      expert_reflections: file.expertReflections,
      core_drivers: file.coreDrivers,
      core_values: file.coreValues,
      voice: file.voice,
      depth_map: file.depthMap,
      analyst_notes: file.analystNotes
    }])
  });
}

// ── Soul Session CRUD ──────────────────────────────────────────

interface SoulSessionRow {
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

export async function getActiveSession(userId: string): Promise<SoulSessionRow | null> {
  const rows = await rest<SoulSessionRow[]>(
    `soul_sessions?user_id=eq.${userId}&status=in.(in_session,extracting,synthesizing)&order=created_at.desc&limit=1&select=*`
  );
  return rows[0] ?? null;
}

export async function getLatestSession(userId: string): Promise<SoulSessionRow | null> {
  const rows = await rest<SoulSessionRow[]>(
    `soul_sessions?user_id=eq.${userId}&order=created_at.desc&limit=1&select=*`
  );
  return rows[0] ?? null;
}

export async function createSoulSession(userId: string, sessionNumber: number): Promise<SoulSessionRow> {
  const rows = await rest<SoulSessionRow[]>("soul_sessions", {
    method: "POST",
    body: JSON.stringify([{
      user_id: userId,
      session_number: sessionNumber,
      status: "in_session",
      exchange_count: 0,
      reflection_notes: []
    }])
  });
  return rows[0];
}

export async function updateSoulSession(
  sessionId: string,
  patch: Record<string, Json>
): Promise<void> {
  await rest<Json>(`soul_sessions?id=eq.${sessionId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch)
  });
}

// ── Soul Messages CRUD ──────────────────────────────────────────

interface SoulMessageRow {
  id: string;
  session_id: string;
  user_id: string;
  role: string;
  content: string;
  created_at: string;
}

export async function getSoulMessages(sessionId: string): Promise<SoulMessageRow[]> {
  return rest<SoulMessageRow[]>(
    `soul_messages?session_id=eq.${sessionId}&order=created_at.asc&select=*`
  );
}

export async function getAllSoulMessages(userId: string): Promise<SoulMessageRow[]> {
  return rest<SoulMessageRow[]>(
    `soul_messages?user_id=eq.${userId}&order=created_at.asc&select=*`
  );
}

export async function insertSoulMessage(
  sessionId: string,
  userId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await rest<Json>("soul_messages", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      session_id: sessionId,
      user_id: userId,
      role,
      content
    }])
  });
}

// ── Session Lifecycle ──────────────────────────────────────────

export function isSessionStale(session: SoulSessionRow): boolean {
  const lastActivity = new Date(session.started_at).getTime();
  const staleThreshold = STALE_SESSION_HOURS * 60 * 60 * 1000;
  return Date.now() - lastActivity > staleThreshold;
}

export async function autoCompleteStaleSession(session: SoulSessionRow): Promise<void> {
  await updateSoulSession(session.id, {
    status: "complete",
    completed_at: new Date().toISOString(),
    extraction_error: "auto-completed: session was stale"
  });
}

// ── Mid-Conversation Reflection Update ───────────────────────

export async function runReflectionUpdate(
  session: SoulSessionRow,
  userId: string
): Promise<{ reflectionNote: ReflectionNote | null; visibleSoulFile: VisibleSoulFile | null }> {
  const messages = await getSoulMessages(session.id);
  const existingVisible = await getVisibleSoulFile(userId);

  const extractionMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content
  }));

  const existingNotes = (session.reflection_notes as ReflectionNote[]) ?? [];
  const lastNote = existingNotes.length > 0 ? existingNotes[existingNotes.length - 1] : null;

  try {
    // Run reflection prompt (lightweight, Haiku)
    const reflectionPromptText = buildReflectionPrompt(
      extractionMessages,
      lastNote,
      session.exchange_count
    );

    const reflectionRaw = await callClaude(
      "You are a conversation analyst. Output valid JSON only.",
      [{ role: "user", content: reflectionPromptText }],
      { model: "claude-haiku-4-5-20251001", maxTokens: 1024, temperature: 0.3 }
    );

    const reflectionNote = parseReflectionNote(reflectionRaw);

    // Store reflection note in session
    if (reflectionNote) {
      const updatedNotes = [...existingNotes, reflectionNote];
      await updateSoulSession(session.id, {
        reflection_notes: updatedNotes as unknown as Json
      });
    }

    // Run light visible extraction (Haiku)
    const lightPromptText = buildLightVisiblePrompt(
      extractionMessages,
      existingVisible,
      reflectionNote ?? lastNote,
      session.session_number
    );

    const lightRaw = await callClaude(
      "You are a soul file writer. Output valid JSON only.",
      [{ role: "user", content: lightPromptText }],
      { model: "claude-haiku-4-5-20251001", maxTokens: 1024, temperature: 0.5 }
    );

    const lightUpdate = parseLightVisibleUpdate(lightRaw);
    if (lightUpdate) {
      const merged = mergeVisibleSoulFile(existingVisible, lightUpdate);
      await upsertVisibleSoulFile(userId, merged);
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
  session: SoulSessionRow,
  userId: string
): Promise<{ visible: VisibleSoulFile | null; hidden: HiddenSoulFile | null }> {
  const messages = await getSoulMessages(session.id);
  const existingVisible = await getVisibleSoulFile(userId);
  const existingHidden = await getHiddenSoulFile(userId);

  const extractionMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content
  }));

  const reflectionNotes = (session.reflection_notes as ReflectionNote[]) ?? [];

  try {
    await updateSoulSession(session.id, { status: "synthesizing" });

    const synthesisPromptText = buildSoulSynthesisPrompt(
      extractionMessages,
      reflectionNotes,
      existingVisible,
      existingHidden,
      session.session_number
    );

    // Use Opus for synthesis quality
    const synthesisRaw = await callClaude(
      "You are a multi-expert soul analyst. Follow the analysis procedure exactly. Output only the two JSON objects separated by <<<SPLIT>>>.",
      [{ role: "user", content: synthesisPromptText }],
      { model: "claude-opus-4-20250514", maxTokens: 8192, temperature: 0.5 }
    );

    const result = parseSoulSynthesis(synthesisRaw);
    if (!result) {
      console.error("Soul synthesis parsing failed");
      await updateSoulSession(session.id, {
        status: "complete",
        completed_at: new Date().toISOString(),
        extraction_error: "synthesis parsing failed"
      });
      return { visible: existingVisible, hidden: existingHidden };
    }

    // Merge with existing
    const mergedVisible = mergeVisibleSoulFile(existingVisible, {
      portrait: result.visible.portrait ?? undefined,
      sections: result.visible.sections,
      crystallizedMoments: result.visible.crystallizedMoments,
      openThreads: result.visible.openThreads
    });
    const mergedHidden = mergeHiddenSoulFile(existingHidden, result.hidden);

    await upsertVisibleSoulFile(userId, mergedVisible);
    await upsertHiddenSoulFile(userId, mergedHidden);

    await updateSoulSession(session.id, {
      status: "complete",
      completed_at: new Date().toISOString()
    });

    return { visible: mergedVisible, hidden: mergedHidden };
  } catch (error) {
    console.error("Soul synthesis failed:", error);
    await updateSoulSession(session.id, {
      status: "complete",
      completed_at: new Date().toISOString(),
      extraction_error: `synthesis failed: ${error instanceof Error ? error.message : String(error)}`
    });
    return { visible: existingVisible, hidden: existingHidden };
  }
}

/**
 * Bootstrap a user's soul mirror state. Returns current state for the client.
 */
export async function bootstrapSoulState(userId: string): Promise<{
  visibleSoulFile: VisibleSoulFile | null;
  activeSession: SoulSessionRow | null;
  canStartSession: boolean;
  cooldownRemainingMs: number;
  nextSessionNumber: number;
}> {
  const visibleSoulFile = await getVisibleSoulFile(userId);
  let activeSession = await getActiveSession(userId);

  // Handle stale sessions
  if (activeSession && isSessionStale(activeSession)) {
    await autoCompleteStaleSession(activeSession);
    activeSession = null;
  }

  const latestSession = await getLatestSession(userId);
  const nextSessionNumber = (latestSession?.session_number ?? 0) + (activeSession ? 0 : 1);

  return {
    visibleSoulFile,
    activeSession,
    canStartSession: !activeSession,
    cooldownRemainingMs: 0,
    nextSessionNumber: Math.max(1, nextSessionNumber)
  };
}
