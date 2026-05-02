import type { NeonSQL } from "./db.ts";
import type { Env } from "./env.ts";
import { sendPush, configFromEnv, type ApnsPayload } from "./apns.ts";

export async function upsertPushToken(
  sql: NeonSQL,
  userId: string,
  token: string,
  platform: "ios" = "ios"
): Promise<void> {
  await sql`
    INSERT INTO device_push_tokens (token, user_id, platform, last_seen_at)
    VALUES (${token}, ${userId}, ${platform}, now())
    ON CONFLICT (token) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      last_seen_at = now()
  `;
}

async function getTokensForUser(sql: NeonSQL, userId: string): Promise<string[]> {
  const rows = await sql`
    SELECT token FROM device_push_tokens WHERE user_id = ${userId}
  `;
  return (rows as Array<{ token: string }>).map((r) => r.token);
}

async function pruneToken(sql: NeonSQL, token: string): Promise<void> {
  await sql`DELETE FROM device_push_tokens WHERE token = ${token}`;
}

async function fanOut(
  sql: NeonSQL,
  env: Env,
  userId: string,
  payload: ApnsPayload
): Promise<void> {
  const config = configFromEnv(env as unknown as Record<string, string | undefined>);
  if (!config) {
    console.warn("APNs not configured; skipping push");
    return;
  }
  const tokens = await getTokensForUser(sql, userId);
  if (tokens.length === 0) return;

  const results = await Promise.all(
    tokens.map(async (token) => {
      try {
        const outcome = await sendPush(config, token, payload);
        return { token, outcome };
      } catch (err) {
        return {
          token,
          outcome: {
            ok: false as const,
            status: 0,
            reason: err instanceof Error ? err.message : "fetch failed",
            tokenInvalid: false
          }
        };
      }
    })
  );

  for (const r of results) {
    if (r.outcome.ok) continue;
    if (r.outcome.tokenInvalid) {
      await pruneToken(sql, r.token).catch((e) => console.error("prune token failed", e));
    } else {
      console.warn(`APNs push failed for user=${userId}: ${r.outcome.status} ${r.outcome.reason}`);
    }
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export async function notifyAdminMessage(
  sql: NeonSQL,
  env: Env,
  userId: string,
  preview: string
): Promise<void> {
  await fanOut(sql, env, userId, {
    alert: { title: "Magpie", body: truncate(preview, 180) },
    customData: { type: "admin_message" }
  });
}

export async function notifyNewMatch(
  sql: NeonSQL,
  env: Env,
  userId: string,
  otherDisplayName: string | null
): Promise<void> {
  const name = otherDisplayName?.trim() || "someone";
  await fanOut(sql, env, userId, {
    alert: {
      title: "New soulmate match",
      body: `You matched with ${name}. Tap to see why.`
    },
    customData: { type: "new_match" }
  });
}
