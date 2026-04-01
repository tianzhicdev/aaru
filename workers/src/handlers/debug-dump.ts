import { jsonResponse } from "../../../src/lib/http.ts";
import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { debugTracesEnabled, getLatestClaudeDebugTrace } from "../debugTraces.ts";
import {
  hiddenSoulFileSchema,
  reflectionNoteSchema,
  type HiddenSoulFile
} from "../../../src/domain/schemas.ts";
import { requireDebugApiToken, requireDeviceSession } from "../requestAuth.ts";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

interface HiddenSoulFileDumpRow {
  version: number;
  last_updated: string | Date;
  confidence: string;
  expert_reflections: Json;
  core_drivers: Json;
  core_values: Json;
  voice: Json;
  depth_map: Json;
  analyst_notes: Json;
}

function normalizeTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === "string" ? value : "";
}

function toHiddenSoulFile(row: HiddenSoulFileDumpRow | null): HiddenSoulFile | null {
  if (!row) return null;

  const parsed = hiddenSoulFileSchema.safeParse({
    version: row.version,
    lastUpdated: normalizeTimestamp(row.last_updated),
    confidence: row.confidence,
    expertReflections: row.expert_reflections,
    coreDrivers: row.core_drivers,
    coreValues: row.core_values,
    voice: row.voice,
    depthMap: row.depth_map,
    analystNotes: row.analyst_notes
  });

  return parsed.success ? parsed.data : null;
}

function buildSteeringPreview(reflectionNote: unknown) {
  const parsed = reflectionNoteSchema.safeParse(reflectionNote);
  if (!parsed.success) {
    return null;
  }

  return {
    current_threads: parsed.data.currentThreads,
    avoid_past_observations: parsed.data.avoidPastObservations,
    avoid_past_questions: parsed.data.avoidPastQuestions,
    steer_to_topics: parsed.data.steerToTopics,
    steering_pressure: parsed.data.steeringPressure,
    steering_reasoning: parsed.data.steeringReasoning
  };
}

export async function handleDebugDump(
  sql: NeonSQL,
  env: Env,
  _payload: unknown,
  request: Request
) {
  const debugAccess = requireDebugApiToken(request, env);
  if (debugAccess) {
    return debugAccess.error;
  }

  const auth = await requireDeviceSession(sql, request, { touch: false });
  if (!auth.ok) {
    return auth.error;
  }

  const userId = auth.session.user_id;
  const tracesAllowed = debugTracesEnabled(env);

  const [
    userRows,
    messageRows,
    reflectionSnapshotRows,
    visibleSoulFileRows,
    hiddenSoulFileRows,
    latestConversationTrace,
    latestSynthesisTrace,
    latestReflectionTrace
  ] = await Promise.all([
    sql`
      SELECT id, device_id, model_profile_id, last_active_at, created_at, updated_at
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `,
    sql`
      SELECT id, user_id, role, content, created_at
      FROM soul_messages
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `,
    sql`
      SELECT *
      FROM reflection_snapshots
      WHERE user_id = ${userId}
      LIMIT 1
    `,
    sql`
      SELECT *
      FROM visible_soul_files
      WHERE user_id = ${userId}
      LIMIT 1
    `,
    sql`
      SELECT *
      FROM hidden_soul_files
      WHERE user_id = ${userId}
      LIMIT 1
    `,
    tracesAllowed ? getLatestClaudeDebugTrace(sql, userId, "conversation") : Promise.resolve(null),
    tracesAllowed ? getLatestClaudeDebugTrace(sql, userId, "synthesis") : Promise.resolve(null),
    tracesAllowed ? getLatestClaudeDebugTrace(sql, userId, "reflection") : Promise.resolve(null)
  ]);

  const userRow = (userRows[0] as Record<string, unknown>) ?? null;
  const reflectionSnapshotRow = (reflectionSnapshotRows[0] as Record<string, unknown>) ?? null;
  const hiddenSoulFileParsed = toHiddenSoulFile((hiddenSoulFileRows[0] as HiddenSoulFileDumpRow) ?? null);

  return jsonResponse(200, {
    user: userRow,
    reflection_note: reflectionSnapshotRow?.note ?? null,
    reflection_snapshot_row: reflectionSnapshotRow,
    steering_preview: buildSteeringPreview(reflectionSnapshotRow?.note),
    steering_source: reflectionSnapshotRow?.note ? "reflection_snapshot" : "none",
    raw_messages: messageRows,
    visible_soul_file_row: visibleSoulFileRows[0] ?? null,
    hidden_soul_file_row: hiddenSoulFileRows[0] ?? null,
    hidden_soul_file: hiddenSoulFileParsed,
    latest_conversation_trace: latestConversationTrace,
    latest_synthesis_trace: latestSynthesisTrace,
    latest_reflection_trace: latestReflectionTrace
  });
}
