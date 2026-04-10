import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";

function checkMonitoringAuth(
  request: Request,
  env: { DEBUG_API_TOKEN?: string }
): Response | null {
  if (!env.DEBUG_API_TOKEN) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const token =
    url.searchParams.get("token") ||
    request.headers.get("x-thumos-debug-token")?.trim();

  if (!token || token !== env.DEBUG_API_TOKEN) {
    return new Response("Forbidden", { status: 403 });
  }

  return null;
}

interface Stats {
  activeUsers24h: number;
  messages24h: number;
  dms24h: number;
  totalUsers: number;
  totalMessages: number;
  totalMatches: number;
}

export async function fetchStats(sql: NeonSQL): Promise<Stats> {
  const [activeUsers24h, messages24h, dms24h, totalUsers, totalMessages, totalMatches] =
    await Promise.all([
      sql`SELECT COUNT(DISTINCT user_id) AS n FROM soul_messages WHERE created_at > NOW() - INTERVAL '24 hours'`,
      sql`SELECT COUNT(*) AS n FROM soul_messages WHERE created_at > NOW() - INTERVAL '24 hours'`,
      sql`SELECT COUNT(*) AS n FROM match_messages WHERE created_at > NOW() - INTERVAL '24 hours'`,
      sql`SELECT COUNT(*) AS n FROM users`,
      sql`SELECT COUNT(*) AS n FROM soul_messages`,
      sql`SELECT COUNT(*) AS n FROM matches WHERE result = 'match'`,
    ]);

  return {
    activeUsers24h: Number(activeUsers24h[0].n),
    messages24h: Number(messages24h[0].n),
    dms24h: Number(dms24h[0].n),
    totalUsers: Number(totalUsers[0].n),
    totalMessages: Number(totalMessages[0].n),
    totalMatches: Number(totalMatches[0].n),
  };
}

function renderDashboard(stats: Stats): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Thumos Monitoring</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 2rem; }
  h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 2rem; color: #fff; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; max-width: 800px; }
  .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 1.25rem; }
  .card .label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin-bottom: 0.5rem; }
  .card .value { font-size: 2rem; font-weight: 700; color: #fff; }
  .section { margin-bottom: 1.5rem; }
  .section h2 { font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 0.75rem; }
  .ts { margin-top: 2rem; font-size: 0.75rem; color: #555; }
</style>
</head>
<body>
<h1>Thumos Monitoring</h1>
<div class="section">
  <h2>Last 24 Hours</h2>
  <div class="grid">
    <div class="card"><div class="label">Active Users</div><div class="value">${stats.activeUsers24h}</div></div>
    <div class="card"><div class="label">Messages</div><div class="value">${stats.messages24h}</div></div>
    <div class="card"><div class="label">DMs</div><div class="value">${stats.dms24h}</div></div>
  </div>
</div>
<div class="section">
  <h2>All Time</h2>
  <div class="grid">
    <div class="card"><div class="label">Total Users</div><div class="value">${stats.totalUsers}</div></div>
    <div class="card"><div class="label">Total Messages</div><div class="value">${stats.totalMessages}</div></div>
    <div class="card"><div class="label">Total Matches</div><div class="value">${stats.totalMatches}</div></div>
  </div>
</div>
<div class="ts">Generated at ${new Date().toISOString()}</div>
</body>
</html>`;
}

export async function handleMonitoring(
  sql: NeonSQL,
  env: Env,
  request: Request
): Promise<Response> {
  const authErr = checkMonitoringAuth(request, env);
  if (authErr) return authErr;

  const stats = await fetchStats(sql);
  return new Response(renderDashboard(stats), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
