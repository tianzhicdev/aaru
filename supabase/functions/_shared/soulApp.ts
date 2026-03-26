import type { SoulFile, SoulSession, SoulMessage } from "../../../src/domain/schemas.ts";
import { COOLDOWN_HOURS, STALE_SESSION_HOURS } from "../../../src/domain/constants.ts";
import { buildExtractionPrompt, parseSoulFileUpdate, mergeSoulFile, emptySoulFile } from "../../../src/domain/soulFile.ts";
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

// ── Soul File CRUD ──────────────────────────────────────────────

interface SoulFileRow {
  user_id: string;
  essence: string | null;
  tensions: Json;
  comes_alive: string | null;
  running_from: string | null;
  your_words: Json;
  evolution: Json;
  session_count: number;
  created_at: string;
  updated_at: string;
}

export async function getSoulFile(userId: string): Promise<SoulFile | null> {
  const rows = await rest<SoulFileRow[]>(
    `soul_files?user_id=eq.${userId}&select=*`
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    essence: row.essence,
    tensions: (row.tensions as SoulFile["tensions"]) ?? [],
    comes_alive: row.comes_alive,
    running_from: row.running_from,
    your_words: (row.your_words as string[]) ?? [],
    evolution: (row.evolution as SoulFile["evolution"]) ?? [],
    session_count: row.session_count
  };
}

export async function upsertSoulFile(userId: string, file: SoulFile): Promise<void> {
  await rest<Json>("soul_files?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      user_id: userId,
      essence: file.essence,
      tensions: file.tensions,
      comes_alive: file.comes_alive,
      running_from: file.running_from,
      your_words: file.your_words,
      evolution: file.evolution,
      session_count: file.session_count,
      updated_at: new Date().toISOString()
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
  started_at: string;
  completed_at: string | null;
  next_available_at: string | null;
  extraction_error: string | null;
  created_at: string;
}

export async function getActiveSession(userId: string): Promise<SoulSessionRow | null> {
  const rows = await rest<SoulSessionRow[]>(
    `soul_sessions?user_id=eq.${userId}&status=in.(in_session,extracting)&order=created_at.desc&limit=1&select=*`
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
      exchange_count: 0
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

export function isCooldownActive(session: SoulSessionRow | null): boolean {
  if (!session) return false;
  if (session.status !== "complete") return false;
  if (!session.next_available_at) return false;
  return new Date(session.next_available_at).getTime() > Date.now();
}

export function getCooldownRemaining(session: SoulSessionRow | null): number {
  if (!session?.next_available_at) return 0;
  const remaining = new Date(session.next_available_at).getTime() - Date.now();
  return Math.max(0, remaining);
}

export async function autoCompleteStaleSession(session: SoulSessionRow): Promise<void> {
  await updateSoulSession(session.id, {
    status: "complete",
    completed_at: new Date().toISOString(),
    // Don't set next_available_at — stale sessions don't burn cooldown
    extraction_error: "auto-completed: session was stale (>24h)"
  });
}

export async function completeSessionWithExtraction(
  session: SoulSessionRow,
  userId: string
): Promise<{ success: boolean; soulFile: SoulFile | null }> {
  // Mark as extracting
  await updateSoulSession(session.id, { status: "extracting" });

  const messages = await getSoulMessages(session.id);
  const existingSoulFile = await getSoulFile(userId);

  const extractionMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content
  }));

  const prompt = buildExtractionPrompt(
    extractionMessages,
    existingSoulFile,
    session.session_number
  );

  let retries = 0;
  const maxRetries = 1;

  while (retries <= maxRetries) {
    try {
      const raw = await callClaude(
        "You are a soul file extractor. Output valid JSON only.",
        [{ role: "user", content: prompt }],
        { model: "claude-haiku-4-5-20251001", maxTokens: 2048, temperature: 0.3 }
      );

      const update = parseSoulFileUpdate(raw);
      if (!update) {
        if (retries < maxRetries) {
          retries++;
          continue;
        }
        throw new Error("Failed to parse extraction response");
      }

      const merged = mergeSoulFile(existingSoulFile, update, session.session_number);
      await upsertSoulFile(userId, merged);

      const nextAvailable = new Date(Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
      await updateSoulSession(session.id, {
        status: "complete",
        completed_at: new Date().toISOString(),
        next_available_at: nextAvailable
      });

      return { success: true, soulFile: merged };
    } catch (error) {
      if (retries < maxRetries) {
        retries++;
        continue;
      }

      const errorMsg = error instanceof Error ? error.message : "Unknown extraction error";
      console.error("Soul file extraction failed:", errorMsg);

      await updateSoulSession(session.id, {
        status: "complete",
        completed_at: new Date().toISOString(),
        // Don't burn cooldown on extraction failure
        extraction_error: errorMsg
      });

      return { success: false, soulFile: existingSoulFile };
    }
  }

  return { success: false, soulFile: null };
}

/**
 * Bootstrap a user's soul mirror state. Returns current state for the client.
 */
export async function bootstrapSoulState(userId: string): Promise<{
  soulFile: SoulFile | null;
  activeSession: SoulSessionRow | null;
  canStartSession: boolean;
  cooldownRemainingMs: number;
  nextSessionNumber: number;
}> {
  const soulFile = await getSoulFile(userId);
  let activeSession = await getActiveSession(userId);

  // Handle stale sessions
  if (activeSession && isSessionStale(activeSession)) {
    await autoCompleteStaleSession(activeSession);
    activeSession = null;
  }

  const latestSession = await getLatestSession(userId);
  const cooldownActive = isCooldownActive(latestSession);
  const cooldownRemaining = getCooldownRemaining(latestSession);
  const nextSessionNumber = (latestSession?.session_number ?? 0) + (activeSession ? 0 : 1);

  return {
    soulFile,
    activeSession,
    canStartSession: !activeSession && !cooldownActive,
    cooldownRemainingMs: cooldownRemaining,
    nextSessionNumber: Math.max(1, nextSessionNumber)
  };
}
