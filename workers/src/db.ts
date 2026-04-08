import { neon } from "@neondatabase/serverless";
import { normalizeModelProfileId, type ModelProfileId } from "./modelProfiles.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NeonSQL = (strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>;

export function createSQL(databaseUrl: string): NeonSQL {
  return neon(databaseUrl) as NeonSQL;
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// ── User types ────────────────────────────────────────────────

export interface UserRow {
  id: string;
  device_id: string;
  display_name: string;
  model_profile_id: string;
  language: string;
}

export interface DeviceSessionRow {
  id: string;
  user_id: string;
  device_id: string;
  token_hash: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

// ── User & Device Session CRUD ────────────────────────────────

export async function ensureUser(
  sql: NeonSQL,
  deviceId: string,
  modelProfileId: ModelProfileId = "frontier_v1"
): Promise<UserRow> {
  const rows = await sql`
    INSERT INTO users (device_id, display_name, model_profile_id)
    VALUES (${deviceId}, ${"Soul " + deviceId.slice(-4)}, ${modelProfileId})
    ON CONFLICT (device_id) DO UPDATE SET device_id = EXCLUDED.device_id
    RETURNING id, device_id, display_name, model_profile_id, language
  `;
  return rows[0] as UserRow;
}

export async function getUserModelProfileId(
  sql: NeonSQL,
  userId: string
): Promise<ModelProfileId> {
  const rows = await sql`
    SELECT model_profile_id
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;

  return normalizeModelProfileId(rows[0]?.model_profile_id);
}

export async function updateUserModelProfileId(
  sql: NeonSQL,
  userId: string,
  modelProfileId: ModelProfileId
): Promise<ModelProfileId> {
  const rows = await sql`
    UPDATE users
    SET model_profile_id = ${modelProfileId}
    WHERE id = ${userId}
    RETURNING model_profile_id
  `;

  return normalizeModelProfileId(rows[0]?.model_profile_id);
}

export async function createDeviceSession(
  sql: NeonSQL,
  userId: string,
  deviceId: string,
  tokenHash: string,
  expiresAt: string
): Promise<DeviceSessionRow> {
  const rows = await sql`
    INSERT INTO device_sessions (user_id, device_id, token_hash, expires_at)
    VALUES (${userId}, ${deviceId}, ${tokenHash}, ${expiresAt})
    RETURNING id, user_id, device_id, token_hash, expires_at, last_seen_at, revoked_at
  `;
  return rows[0] as DeviceSessionRow;
}

export async function getActiveSessionByTokenHash(sql: NeonSQL, tokenHash: string): Promise<DeviceSessionRow | null> {
  const rows = await sql`
    SELECT id, user_id, device_id, token_hash, expires_at, last_seen_at, revoked_at
    FROM device_sessions
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
  `;
  return (rows[0] as DeviceSessionRow) ?? null;
}

export async function touchDeviceSession(sql: NeonSQL, sessionId: string): Promise<void> {
  await sql`
    UPDATE device_sessions SET last_seen_at = NOW() WHERE id = ${sessionId}
  `;
}

// ── Language ──────────────────────────────────────────────────

export async function getUserLanguage(
  sql: NeonSQL,
  userId: string
): Promise<string> {
  const rows = await sql`
    SELECT language FROM users WHERE id = ${userId} LIMIT 1
  `;
  return (rows[0]?.language as string) ?? "en";
}

export async function updateUserLanguage(
  sql: NeonSQL,
  userId: string,
  language: string
): Promise<string> {
  const rows = await sql`
    UPDATE users SET language = ${language} WHERE id = ${userId} RETURNING language
  `;
  return (rows[0]?.language as string) ?? "en";
}

// ── Delete user (CASCADE handles all dependent tables) ────────

export async function deleteUser(sql: NeonSQL, userId: string): Promise<void> {
  await sql`DELETE FROM users WHERE id = ${userId}`;
}
