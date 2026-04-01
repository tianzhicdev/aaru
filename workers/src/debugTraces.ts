import type { NeonSQL } from "./db.ts";

type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type ClaudeDebugTraceKind = "conversation" | "synthesis" | "reflection";

export interface ClaudeDebugTraceMessage {
  role: string;
  content: string;
}

export interface ClaudeDebugTraceRow {
  id: string;
  user_id: string;
  trace_kind: ClaudeDebugTraceKind;
  model: string;
  system_prompt: string;
  input_messages: Json;
  raw_response: string | null;
  meta: Json;
  created_at: string | Date;
}

export interface ClaudeDebugTraceInput {
  userId: string;
  traceKind: ClaudeDebugTraceKind;
  model: string;
  systemPrompt: string;
  inputMessages: ClaudeDebugTraceMessage[];
  rawResponse: string | null;
  meta?: Record<string, Json>;
}

export function debugTracesEnabled(env: { ENABLE_DEBUG_TRACES?: string }): boolean {
  const value = env.ENABLE_DEBUG_TRACES?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export async function recordClaudeDebugTrace(
  sql: NeonSQL,
  env: { ENABLE_DEBUG_TRACES?: string },
  trace: ClaudeDebugTraceInput
): Promise<void> {
  if (!debugTracesEnabled(env)) {
    return;
  }

  await sql`
    INSERT INTO claude_debug_traces (
      user_id,
      trace_kind,
      model,
      system_prompt,
      input_messages,
      raw_response,
      meta
    ) VALUES (
      ${trace.userId},
      ${trace.traceKind},
      ${trace.model},
      ${trace.systemPrompt},
      ${JSON.stringify(trace.inputMessages)},
      ${trace.rawResponse},
      ${JSON.stringify(trace.meta ?? {})}
    )
  `;

  await sql`
    DELETE FROM claude_debug_traces
    WHERE user_id = ${trace.userId}
      AND trace_kind = ${trace.traceKind}
      AND id NOT IN (
        SELECT id
        FROM claude_debug_traces
        WHERE user_id = ${trace.userId}
          AND trace_kind = ${trace.traceKind}
        ORDER BY created_at DESC
        LIMIT 3
      )
  `;
}

export async function getLatestClaudeDebugTrace(
  sql: NeonSQL,
  userId: string,
  traceKind: ClaudeDebugTraceKind
): Promise<ClaudeDebugTraceRow | null> {
  const rows = await sql`
    SELECT
      id,
      user_id,
      trace_kind,
      model,
      system_prompt,
      input_messages,
      raw_response,
      meta,
      created_at
    FROM claude_debug_traces
    WHERE user_id = ${userId}
      AND trace_kind = ${traceKind}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  return (rows[0] as ClaudeDebugTraceRow) ?? null;
}
