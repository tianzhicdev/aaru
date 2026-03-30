import { jsonResponse } from "../../../src/lib/http.ts";
import type { NeonSQL } from "../db.ts";
import { readBearerToken, hashSessionToken } from "../auth.ts";
import { getActiveSessionByTokenHash } from "../db.ts";
import { getLatestClaudeDebugTrace } from "../debugTraces.ts";
import { deriveConversationSteering } from "../../../src/domain/soul.ts";
import {
  hiddenSoulFileSchema,
  reflectionNoteSchema,
  type HiddenSoulFile
} from "../../../src/domain/schemas.ts";

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

export async function handleDebugDump(sql: NeonSQL, _payload: unknown, request: Request) {
  const bearerToken = readBearerToken(request);
  if (!bearerToken) {
    return jsonResponse(401, { code: 401, message: "Missing device session" });
  }

  const tokenHash = await hashSessionToken(bearerToken);
  const session = await getActiveSessionByTokenHash(sql, tokenHash);
  if (!session || new Date(session.expires_at) <= new Date()) {
    return jsonResponse(401, { code: 401, message: "Invalid device session" });
  }

  const userId = session.user_id;

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
      SELECT id, device_id, last_active_at, created_at, updated_at
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
    getLatestClaudeDebugTrace(sql, userId, "conversation"),
    getLatestClaudeDebugTrace(sql, userId, "synthesis"),
    getLatestClaudeDebugTrace(sql, userId, "reflection")
  ]);

  const userRow = (userRows[0] as Record<string, unknown>) ?? null;
  const reflectionSnapshotRow = (reflectionSnapshotRows[0] as Record<string, unknown>) ?? null;
  const reflectionNoteParsed = reflectionNoteSchema.safeParse(reflectionSnapshotRow?.note);
  const hiddenSoulFileParsed = toHiddenSoulFile((hiddenSoulFileRows[0] as HiddenSoulFileDumpRow) ?? null);
  const { steering, source } = deriveConversationSteering(
    reflectionNoteParsed.success ? reflectionNoteParsed.data : null
  );

  return jsonResponse(200, {
    user: userRow,
    reflection_note: reflectionSnapshotRow?.note ?? null,
    reflection_snapshot_row: reflectionSnapshotRow,
    steering_preview: steering,
    steering_source: source,
    raw_messages: messageRows,
    visible_soul_file_row: visibleSoulFileRows[0] ?? null,
    hidden_soul_file_row: hiddenSoulFileRows[0] ?? null,
    latest_conversation_trace: latestConversationTrace,
    latest_synthesis_trace: latestSynthesisTrace,
    latest_reflection_trace: latestReflectionTrace
  });
}
