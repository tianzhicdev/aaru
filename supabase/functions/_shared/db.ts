import { supabaseServiceRoleKey, supabaseUrl } from "./env.ts";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

interface UserRow {
  id: string;
  device_id: string;
  display_name: string;
  instance_id: string | null;
  is_npc: boolean;
}

interface DeviceSessionRow {
  id: string;
  user_id: string;
  device_id: string;
  token_hash: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

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

  if (response.status === 204) {
    return [] as T;
  }

  const text = await response.text();
  if (text.trim().length === 0) {
    return [] as T;
  }

  return JSON.parse(text) as T;
}

export async function createUser(deviceId: string): Promise<UserRow> {
  const created = await rest<UserRow[]>("users?on_conflict=device_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      device_id: deviceId,
      display_name: `Soul ${deviceId.slice(-4)}`,
      is_npc: false
    })
  });
  return created[0];
}

export async function ensureUser(deviceId: string): Promise<UserRow> {
  return createUser(deviceId);
}

export async function createDeviceSession(
  userId: string,
  deviceId: string,
  tokenHash: string,
  expiresAt: string
): Promise<DeviceSessionRow> {
  const created = await rest<DeviceSessionRow[]>("device_sessions", {
    method: "POST",
    body: JSON.stringify([{
      user_id: userId,
      device_id: deviceId,
      token_hash: tokenHash,
      expires_at: expiresAt
    }])
  });
  return created[0];
}

export async function revokeSessionsForDevice(userId: string, deviceId: string): Promise<void> {
  await rest<Json>(`device_sessions?user_id=eq.${userId}&device_id=eq.${encodeURIComponent(deviceId)}&revoked_at=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ revoked_at: new Date().toISOString() })
  });
}

export async function getActiveSessionByTokenHash(tokenHash: string): Promise<DeviceSessionRow | null> {
  const rows = await rest<DeviceSessionRow[]>(
    `device_sessions?token_hash=eq.${tokenHash}&revoked_at=is.null&select=id,user_id,device_id,token_hash,expires_at,last_seen_at,revoked_at`
  );
  return rows[0] ?? null;
}

export async function touchDeviceSession(sessionId: string): Promise<void> {
  await rest<Json>(`device_sessions?id=eq.${sessionId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_seen_at: new Date().toISOString() })
  });
}
