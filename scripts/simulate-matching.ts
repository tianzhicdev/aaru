#!/usr/bin/env npx tsx
/**
 * simulate-matching.ts
 *
 * End-to-end matching simulation: bootstraps diverse characters, runs
 * conversations via the deployed Thumos API, creates soulmate profiles,
 * triggers matching scans, and reports on matches produced.
 *
 * Usage:
 *   npx tsx scripts/simulate-matching.ts --file scripts/matching-characters.json
 *   npx tsx scripts/simulate-matching.ts --file scripts/matching-characters.json --exchanges 35
 *   npx tsx scripts/simulate-matching.ts --file scripts/matching-characters.json --only yuki-tanaka
 *   npx tsx scripts/simulate-matching.ts --file scripts/matching-characters.json --concurrency 3
 *
 * Optional env:
 *   THUMOS_API_BASE=https://thumos-api-dev.tianzhic-dev.workers.dev
 *   ANTHROPIC_API_KEY=...
 *   THUMOS_DEBUG_API_TOKEN=...
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import "dotenv/config";

// ── Config ──────────────────────────────────────────────────────

const API_BASE = process.env.THUMOS_API_BASE || "https://thumos-api-dev.tianzhic-dev.workers.dev";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DEBUG_API_TOKEN = process.env.THUMOS_DEBUG_API_TOKEN
  || process.env.DEBUG_API_TOKEN
  || process.env.DEBUG_API_TOKEN_DEV;

if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set in environment or .env");
  process.exit(1);
}

const DEFAULT_EXCHANGES = 35;
const DEFAULT_CONCURRENCY = 2;
const MATCH_POLL_INTERVAL_MS = 15_000;
const MATCH_POLL_MAX_WAIT_MS = 300_000; // 5 min

// ── Types ───────────────────────────────────────────────────────

interface SoulmateProfile {
  display_name: string;
  age: number;
  gender: string;
  latitude: number;
  longitude: number;
  preferred_age_min: number;
  preferred_age_max: number;
  preferred_genders: string[];
}

interface MatchCharacter {
  name: string;
  displayName: string;
  description: string;
  voiceNotes: string;
  language: string;
  soulmateProfile: SoulmateProfile;
}

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  exchange: number;
}

interface CharacterState {
  character: MatchCharacter;
  deviceId: string;
  userId: string;
  token: string;
  conversation: ConversationTurn[];
  exchangesCompleted: number;
  synthesisSucceeded: boolean;
  profileCreated: boolean;
  completeness: number;
}

interface MatchResult {
  match_id: string;
  matched_user_id: string;
  display_name: string;
  matched_at: string;
  reasoning: string | null;
  connection_zones: unknown;
  score: number | null;
}

// ── CLI ─────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let file = "";
  let only: string | undefined;
  let exchanges = DEFAULT_EXCHANGES;
  let concurrency = DEFAULT_CONCURRENCY;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) { file = args[++i]; continue; }
    if (args[i] === "--only" && args[i + 1]) { only = args[++i]; continue; }
    if (args[i] === "--exchanges" && args[i + 1]) { exchanges = parseInt(args[++i], 10); continue; }
    if (args[i] === "--concurrency" && args[i + 1]) { concurrency = parseInt(args[++i], 10); continue; }
  }

  if (!file) {
    console.error("Usage: npx tsx scripts/simulate-matching.ts --file <matching-characters.json> [--only <name>] [--exchanges <n>] [--concurrency <n>]");
    process.exit(1);
  }
  return { file, only, exchanges, concurrency };
}

// ── HTTP helpers ────────────────────────────────────────────────

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
  if (token) h["x-thumos-session"] = token;
  if (DEBUG_API_TOKEN) h["x-thumos-debug-token"] = DEBUG_API_TOKEN;
  return h;
}

async function post(endpoint: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`${API_BASE}/${endpoint}`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body)
  });
}

async function get(endpoint: string, token?: string): Promise<Response> {
  return fetch(`${API_BASE}/${endpoint}`, {
    method: "GET",
    headers: headers(token)
  });
}

/** Read SSE or JSON response from soul-converse */
async function readConverse(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const payload = await res.json() as { content?: string };
    return typeof payload.content === "string" ? payload.content : "";
  }

  const body = res.body;
  if (!body) return "";

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6)) as { text?: string };
        if (data.text) full += data.text;
      } catch { /* skip */ }
    }
  }
  return full;
}

// ── Character simulation via Claude Haiku ───────────────────────

async function simulateCharacter(
  char: MatchCharacter,
  conversation: ConversationTurn[],
  exchange: number,
  total: number
): Promise<string> {
  const phase =
    exchange <= 7 ? "EARLY: Keep it light, testing the waters. Share surface-level things about yourself." :
    exchange <= 20 ? "WARMING UP: Getting more comfortable. Share real things — specific stories, real opinions, actual experiences." :
    exchange <= 30 ? "OPENING UP: Share genuine vulnerabilities, core experiences, fears, contradictions. Get past the persona." :
    "DEEP: The most honest you've been. Things you rarely say aloud. Core tensions and wounds.";

  const system = `HARD RULE: You must NEVER use asterisks, stage directions, action markers, or gesture descriptions.
No *pauses*, no *sighs*, no *looks away*. Plain first-person prose ONLY.

You are ${char.displayName}. You are a REAL PERSON talking to an AI called Thumos.
You are NOT Thumos. You are NOT an AI. You are NOT a therapist or counselor.
You do NOT ask reflective questions. You do NOT mirror or paraphrase. You SHARE your own experiences.

CHARACTER BACKGROUND:
${char.description}

VOICE & STYLE:
${char.voiceNotes}

LANGUAGE: Respond naturally in ${char.language === "en" ? "English" : `the language associated with locale ${char.language}`}. If the AI writes in English, you may reply in your language or English — whatever feels natural for this character.

RULES:
- Respond as this person would in an intimate, honest conversation
- Keep responses 2-5 sentences
- Talk about YOUR life, YOUR feelings, YOUR memories — never analyze the other person
- NEVER ask therapeutic questions like "How does that make you feel?" or "Tell me more about..."
- NEVER try to end the conversation or say goodbye
- NEVER meta-comment on the conversation ("this has been great", etc.)
- Use first person. NO stage directions or asterisks.

EXCHANGE ${exchange} of ~${total}
${phase}`;

  const messages = conversation.map(t => ({
    role: (t.role === "assistant" ? "user" : "assistant") as "user" | "assistant",
    content: t.content
  }));

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: AbortSignal.timeout(45_000),
        headers: {
          "x-api-key": ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          temperature: 0.9,
          system,
          messages
        })
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Character sim ${res.status}: ${err.slice(0, 200)}`);
      }

      const data = await res.json() as { content: Array<{ text: string }> };
      return data.content[0].text;
    } catch (err) {
      if (attempt < 2) {
        console.error(`    [retry ${attempt + 1}] char sim: ${err instanceof Error ? err.message : err}`);
        await sleep(3000);
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

// ── Utilities ───────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function log(name: string, msg: string) {
  console.log(`  [${name}] ${msg}`);
}

// ── Phase 1: Bootstrap + Converse ───────────────────────────────

async function runConversation(char: MatchCharacter, exchanges: number): Promise<CharacterState> {
  const tag = char.name.slice(0, 12);
  log(tag, `bootstrapping...`);

  const deviceId = crypto.randomUUID();
  const bRes = await post("bootstrap-soul", { device_id: deviceId });
  if (!bRes.ok) throw new Error(`Bootstrap failed: ${bRes.status} ${await bRes.text()}`);

  const boot = await bRes.json() as { user_id: string; token: string };
  const { token, user_id: userId } = boot;
  log(tag, `user ${userId.slice(0, 8)}... created`);

  // Set language
  if (char.language !== "en") {
    const langRes = await post("update-language", { language: char.language }, token);
    if (!langRes.ok) {
      log(tag, `language set failed: ${langRes.status} (continuing with default)`);
    } else {
      log(tag, `language set to ${char.language}`);
    }
  }

  const conversation: ConversationTurn[] = [];
  let exchange = 0;

  // Session plan: 3 sessions for efficiency
  const sessionPlan = splitExchanges(exchanges, 3);

  for (let s = 0; s < sessionPlan.length; s++) {
    const sessionExchanges = sessionPlan[s];
    log(tag, `session ${s + 1}/${sessionPlan.length} (${sessionExchanges} exchanges)`);

    // Opening
    const openRes = await post("soul-converse", { mode: "opening" }, token);
    if (!openRes.ok) {
      log(tag, `opening failed: ${openRes.status}`);
      continue;
    }

    let opening = await readConverse(openRes);
    if (!opening.trim()) {
      opening = "What's something about yourself that most people don't see?";
    }
    conversation.push({ role: "assistant", content: opening, exchange });

    // Exchanges
    for (let i = 0; i < sessionExchanges; i++) {
      exchange++;
      const userMsg = await simulateCharacter(char, conversation, exchange, exchanges);
      conversation.push({ role: "user", content: userMsg, exchange });

      const replyRes = await post("soul-converse", { mode: "reply", message: userMsg }, token);
      if (!replyRes.ok) {
        log(tag, `reply failed at exchange ${exchange}: ${replyRes.status}`);
        conversation.push({ role: "assistant", content: "(no response)", exchange });
        await sleep(2000);
        continue;
      }

      let reply = await readConverse(replyRes);
      if (!reply.trim()) reply = "(reflection)";
      conversation.push({ role: "assistant", content: reply, exchange });
      await sleep(300);
    }

    // Brief pause between sessions for reflection snapshot processing
    if (s < sessionPlan.length - 1) {
      log(tag, `waiting for reflection snapshot...`);
      await sleep(10_000);
    }
  }

  log(tag, `${exchange} exchanges done, waiting for synthesis...`);

  // Wait for synthesis
  let synthesisSucceeded = false;
  let completeness = 0;
  const synthStart = Date.now();
  const synthMax = 300_000; // 5 min

  while (Date.now() - synthStart < synthMax) {
    const sfRes = await post("get-soul-file", {}, token);
    if (!sfRes.ok) {
      await sleep(5000);
      continue;
    }

    const sfData = await sfRes.json() as {
      visible_soul_file?: { completeness?: number; portrait?: string };
      synthesis_pending: boolean;
    };

    completeness = sfData.visible_soul_file?.completeness ?? 0;

    if (!sfData.synthesis_pending && sfData.visible_soul_file?.portrait) {
      synthesisSucceeded = true;
      break;
    }

    process.stdout.write(".");
    await sleep(10_000);
  }

  const synthTime = Math.round((Date.now() - synthStart) / 1000);
  log(tag, `synthesis ${synthesisSucceeded ? "done" : "timed out"} (${synthTime}s, completeness: ${Math.round(completeness * 100)}%)`);

  return {
    character: char,
    deviceId,
    userId,
    token,
    conversation,
    exchangesCompleted: exchange,
    synthesisSucceeded,
    profileCreated: false,
    completeness
  };
}

function splitExchanges(total: number, sessions: number): number[] {
  const base = Math.floor(total / sessions);
  const remainder = total - base * sessions;
  return Array.from({ length: sessions }, (_, i) => base + (i < remainder ? 1 : 0));
}

// ── Phase 2: Create Soulmate Profiles ───────────────────────────

async function createSoulmateProfile(state: CharacterState): Promise<boolean> {
  const tag = state.character.name.slice(0, 12);
  const profile = state.character.soulmateProfile;

  const res = await post("soulmate-profile", profile, state.token);
  if (!res.ok) {
    const err = await res.text();
    log(tag, `profile creation failed: ${res.status} ${err.slice(0, 200)}`);
    return false;
  }

  log(tag, `soulmate profile created (${profile.display_name}, ${profile.age}${profile.gender[0]})`);
  return true;
}

// ── Phase 3: Trigger Matching ───────────────────────────────────

async function triggerMatchingScan(state: CharacterState): Promise<string> {
  const tag = state.character.name.slice(0, 12);
  const res = await post("run-matching-scan", {}, state.token);
  if (!res.ok) {
    const err = await res.text();
    log(tag, `matching scan failed: ${res.status} ${err.slice(0, 200)}`);
    return "error";
  }

  const data = await res.json() as { status: string; reason?: string };
  log(tag, `scan: ${data.status}${data.reason ? ` — ${data.reason}` : ""}`);
  return data.status;
}

// ── Phase 4: Poll Matches ───────────────────────────────────────

async function pollMatches(state: CharacterState): Promise<MatchResult[]> {
  const tag = state.character.name.slice(0, 12);
  const start = Date.now();

  while (Date.now() - start < MATCH_POLL_MAX_WAIT_MS) {
    const res = await get("soulmate-matches", state.token);
    if (!res.ok) {
      await sleep(MATCH_POLL_INTERVAL_MS);
      continue;
    }

    const data = await res.json() as { matches: MatchResult[] };
    if (data.matches.length > 0) {
      log(tag, `${data.matches.length} match(es) found`);
      return data.matches;
    }

    process.stdout.write(".");
    await sleep(MATCH_POLL_INTERVAL_MS);
  }

  log(tag, `no matches after ${Math.round(MATCH_POLL_MAX_WAIT_MS / 1000)}s`);
  return [];
}

// ── Concurrency helper ──────────────────────────────────────────

async function runWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  const running: Promise<void>[] = [];
  let index = 0;

  async function runNext(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      try {
        results[i] = await fn(items[i]);
      } catch (err) {
        console.error(`  [error] item ${i}: ${err}`);
        results[i] = undefined as unknown as R;
      }
      // Continue processing next items
    }
  }

  for (let c = 0; c < Math.min(concurrency, items.length); c++) {
    running.push(runNext());
  }

  await Promise.all(running);
  return results;
}

// ── Output ──────────────────────────────────────────────────────

function saveOutput(states: CharacterState[], allMatches: Map<string, MatchResult[]>) {
  const outputDir = join(process.cwd(), "dry-run-output", "matching-sim");
  mkdirSync(outputDir, { recursive: true });

  // Per-character conversations
  for (const state of states) {
    const charDir = join(outputDir, state.character.name);
    mkdirSync(charDir, { recursive: true });

    let md = `# ${state.character.displayName} (${state.character.language})\n\n`;
    md += `> ${state.character.description.slice(0, 200)}...\n\n`;
    md += `Exchanges: ${state.exchangesCompleted} | Synthesis: ${state.synthesisSucceeded ? "✓" : "✗"} | Completeness: ${Math.round(state.completeness * 100)}%\n\n---\n\n`;

    for (const turn of state.conversation) {
      const speaker = turn.role === "assistant" ? "**Thumos**" : `**${state.character.displayName}**`;
      md += `${speaker}: ${turn.content}\n\n`;
    }

    writeFileSync(join(charDir, "conversation.md"), md);

    // Matches
    const matches = allMatches.get(state.userId) ?? [];
    if (matches.length > 0) {
      let matchMd = `# Matches for ${state.character.displayName}\n\n`;
      for (const m of matches) {
        matchMd += `## ${m.display_name} (score: ${m.score ?? "N/A"})\n\n`;
        matchMd += `Matched at: ${m.matched_at}\n\n`;
        if (m.reasoning) matchMd += `> ${m.reasoning}\n\n`;
        if (m.connection_zones) matchMd += `Connection zones: ${JSON.stringify(m.connection_zones)}\n\n`;
        matchMd += "---\n\n";
      }
      writeFileSync(join(charDir, "matches.md"), matchMd);
    }
  }

  // Summary report
  let report = `# Matching Simulation Report\n\n`;
  report += `Date: ${new Date().toISOString()}\n`;
  report += `Characters: ${states.length}\n`;
  report += `API: ${API_BASE}\n\n`;

  report += `## Character Status\n\n`;
  report += `| Character | Lang | Exchanges | Synthesis | Completeness | Profile | Matches |\n`;
  report += `|-----------|------|-----------|-----------|--------------|---------|----------|\n`;

  let totalMatches = 0;
  for (const state of states) {
    const matches = allMatches.get(state.userId) ?? [];
    totalMatches += matches.length;
    report += `| ${state.character.displayName} | ${state.character.language} | ${state.exchangesCompleted} | ${state.synthesisSucceeded ? "✓" : "✗"} | ${Math.round(state.completeness * 100)}% | ${state.profileCreated ? "✓" : "✗"} | ${matches.length} |\n`;
  }

  report += `\n## Match Pairs\n\n`;

  const seen = new Set<string>();
  for (const state of states) {
    const matches = allMatches.get(state.userId) ?? [];
    for (const m of matches) {
      const pairKey = [state.userId, m.matched_user_id].sort().join(":");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const otherState = states.find(s => s.userId === m.matched_user_id);
      const otherName = otherState?.character.displayName ?? m.display_name;
      report += `### ${state.character.displayName} × ${otherName}\n`;
      report += `Score: ${m.score ?? "N/A"}\n`;
      if (m.connection_zones) report += `Zones: ${JSON.stringify(m.connection_zones)}\n`;
      report += `\n`;

      // Show both sides' reasoning
      const thisReasoning = m.reasoning;
      const otherMatches = allMatches.get(m.matched_user_id) ?? [];
      const reverseMatch = otherMatches.find(om => om.matched_user_id === state.userId);
      const otherReasoning = reverseMatch?.reasoning;

      if (thisReasoning) report += `**${state.character.displayName}'s reasoning:**\n> ${thisReasoning}\n\n`;
      if (otherReasoning) report += `**${otherName}'s reasoning:**\n> ${otherReasoning}\n\n`;
      report += `---\n\n`;
    }
  }

  report += `\n## Summary\n\n`;
  report += `- Total unique match pairs: ${seen.size}\n`;
  report += `- Characters with matches: ${states.filter(s => (allMatches.get(s.userId) ?? []).length > 0).length}/${states.length}\n`;
  report += `- Characters with synthesis: ${states.filter(s => s.synthesisSucceeded).length}/${states.length}\n`;

  writeFileSync(join(outputDir, "report.md"), report);
  console.log(`\n  Output saved to ${outputDir}/`);
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const { file, only, exchanges, concurrency } = parseArgs();
  const raw = readFileSync(file, "utf-8");
  let characters = JSON.parse(raw) as MatchCharacter[];

  if (only) {
    characters = characters.filter(c => c.name === only);
    if (characters.length === 0) {
      console.error(`Character "${only}" not found`);
      process.exit(1);
    }
  }

  console.log("\n╔════════════════════════════════════════════╗");
  console.log("║    Thumos Matching Simulation             ║");
  console.log("╚════════════════════════════════════════════╝\n");
  console.log(`  Characters: ${characters.length}`);
  console.log(`  Exchanges:  ${exchanges} per character`);
  console.log(`  Concurrency: ${concurrency}`);
  console.log(`  API: ${API_BASE}\n`);

  // ── Phase 1: Conversations ──
  console.log("═══ Phase 1: Conversations ═══\n");
  const states = await runWithConcurrency(
    characters,
    char => runConversation(char, exchanges).catch(err => {
      console.error(`  [FATAL] ${char.name}: ${err}`);
      return {
        character: char,
        deviceId: "",
        userId: "",
        token: "",
        conversation: [],
        exchangesCompleted: 0,
        synthesisSucceeded: false,
        profileCreated: false,
        completeness: 0
      } as CharacterState;
    }),
    concurrency
  );

  const viable = states.filter(s => s.token && s.synthesisSucceeded);
  console.log(`\n  ${viable.length}/${states.length} characters ready for matching\n`);

  if (viable.length < 2) {
    console.log("  Not enough viable characters for matching. Exiting.");
    saveOutput(states, new Map());
    return;
  }

  // ── Phase 2: Soulmate Profiles ──
  console.log("═══ Phase 2: Soulmate Profiles ═══\n");
  for (const state of viable) {
    state.profileCreated = await createSoulmateProfile(state);
  }

  const withProfiles = viable.filter(s => s.profileCreated);
  console.log(`  ${withProfiles.length} profiles created\n`);

  // ── Phase 3: Trigger Matching Scans ──
  console.log("═══ Phase 3: Matching Scans ═══\n");
  const scanResults: string[] = [];
  for (const state of withProfiles) {
    const status = await triggerMatchingScan(state);
    scanResults.push(status);
    // Small delay between scans to let the queue process
    await sleep(2000);
  }

  const scanning = scanResults.filter(s => s === "scanning").length;
  console.log(`\n  ${scanning}/${withProfiles.length} scans triggered\n`);

  if (scanning === 0) {
    console.log("  No scans triggered. Check eligibility requirements.");
    saveOutput(states, new Map());
    return;
  }

  // Wait for background queue to process
  console.log("  Waiting 60s for background queue to process matches...");
  await sleep(60_000);

  // ── Phase 4: Poll for Matches ──
  console.log("\n═══ Phase 4: Fetching Matches ═══\n");
  const allMatches = new Map<string, MatchResult[]>();

  for (const state of withProfiles) {
    const matches = await pollMatches(state);
    allMatches.set(state.userId, matches);
  }

  // ── Report ──
  console.log("\n═══ Results ═══\n");

  let totalPairs = 0;
  const seenPairs = new Set<string>();

  for (const state of withProfiles) {
    const matches = allMatches.get(state.userId) ?? [];
    const tag = state.character.displayName.padEnd(16);

    if (matches.length === 0) {
      console.log(`  ${tag}  → no matches`);
    } else {
      for (const m of matches) {
        const pairKey = [state.userId, m.matched_user_id].sort().join(":");
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          totalPairs++;
        }
        console.log(`  ${tag}  → ${m.display_name} (score: ${m.score ?? "?"}, zones: ${m.connection_zones ? JSON.stringify(m.connection_zones) : "N/A"})`);
      }
    }
  }

  console.log(`\n  Total unique match pairs: ${totalPairs}`);
  console.log(`  Characters with matches: ${withProfiles.filter(s => (allMatches.get(s.userId) ?? []).length > 0).length}/${withProfiles.length}`);

  // Show reasoning samples
  console.log("\n═══ Reasoning Samples ═══\n");
  let shown = 0;
  for (const state of withProfiles) {
    if (shown >= 4) break;
    const matches = allMatches.get(state.userId) ?? [];
    for (const m of matches) {
      if (shown >= 4) break;
      if (m.reasoning) {
        console.log(`  ${state.character.displayName} → ${m.display_name}:`);
        console.log(`  "${m.reasoning.slice(0, 200)}${m.reasoning.length > 200 ? "..." : ""}"\n`);
        shown++;
      }
    }
  }

  saveOutput(states, allMatches);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
