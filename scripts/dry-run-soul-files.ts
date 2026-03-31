#!/usr/bin/env npx tsx
/**
 * dry-run-soul-files.ts
 *
 * CLI client that talks to the deployed Thumos server, simulating characters
 * via Claude to generate soul files for quality review.
 *
 * Runs ~200-message conversations across 5 sessions. Between sessions, calls
 * mode:"opening" to trigger reengagement — same code path as a real user
 * reopening the app.
 *
 * Usage: npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json
 *        npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --only charlie-scene
 *        npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --exchanges 100
 *
 * Optional env: THUMOS_API_BASE=https://api.trythumos.com
 *
 * See scripts/SIMULATION.md for methodology and verification checklist.
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import "dotenv/config";

const API_BASE = process.env.THUMOS_API_BASE || "https://api.trythumos.com";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set in environment or .env");
  process.exit(1);
}

const DEFAULT_EXCHANGES = 80;
const DEFAULT_SESSION_PLAN = [10, 13, 13, 14, 15, 15]; // sums to 80

interface Character {
  name: string;
  displayName: string;
  description: string;
  voiceNotes: string;
}

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  exchange: number;
  session: number;
}

interface VerificationChecks {
  conversationDepth: boolean;
  soulFileGenerated: boolean;
  soulFileSectionsPopulated: number;
  crystallizedMomentsCount: number;
  openThreadsCount: number;
  hiddenSoulFileGenerated: boolean;
  personalitySpectrumTraits: number;
  topValuesCount: number;
  relationalStylePresent: boolean;
  hiddenProfilesPresent: boolean;
  reflectionSignalsPresent: boolean;
  assistantOpeningWorks: boolean;
  sessionCount: number;
}

interface RunResult {
  conversation: ConversationTurn[];
  visibleSoulFile: unknown;
  hiddenSoulFile: unknown;
  debugDump: unknown;
  synthesisSucceeded: boolean;
  followupOpening: string | null;
  verificationChecks: VerificationChecks;
}

function parseArgs(): { file: string; only?: string; exchanges: number } {
  const args = process.argv.slice(2);
  let file = "";
  let only: string | undefined;
  let exchanges = DEFAULT_EXCHANGES;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--file" && args[index + 1]) {
      file = args[index + 1];
      index += 1;
      continue;
    }
    if (args[index] === "--only" && args[index + 1]) {
      only = args[index + 1];
      index += 1;
      continue;
    }
    if (args[index] === "--exchanges" && args[index + 1]) {
      exchanges = parseInt(args[index + 1], 10);
      index += 1;
    }
  }

  if (!file) {
    console.error("Usage: npx tsx scripts/dry-run-soul-files.ts --file <characters.json> [--only <name>] [--exchanges <n>]");
    process.exit(1);
  }

  return { file, only, exchanges };
}

function scaleSessionPlan(totalExchanges: number): number[] {
  const defaultTotal = DEFAULT_SESSION_PLAN.reduce((a, b) => a + b, 0);
  const ratio = totalExchanges / defaultTotal;
  const scaled = DEFAULT_SESSION_PLAN.map((n) => Math.max(1, Math.round(n * ratio)));
  const diff = totalExchanges - scaled.reduce((a, b) => a + b, 0);
  scaled[scaled.length - 1] += diff;
  return scaled;
}

function serverHeaders(sessionToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (sessionToken) {
    headers["x-thumos-session"] = sessionToken;
  }
  return headers;
}

async function serverPost(endpoint: string, body: unknown, sessionToken?: string): Promise<Response> {
  return fetch(`${API_BASE}/${endpoint}`, {
    method: "POST",
    headers: serverHeaders(sessionToken),
    body: JSON.stringify(body)
  });
}

async function readSSEResponse(res: Response): Promise<string> {
  const body = res.body;
  if (!body) {
    throw new Error("No response body from soul-converse");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
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
        if (data.text) {
          fullText += data.text;
          process.stdout.write(data.text);
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  return fullText;
}

async function simulateCharacterResponse(
  character: Character,
  conversation: ConversationTurn[],
  exchangeNumber: number,
  totalExchanges: number
): Promise<string> {
  const systemPrompt = `HARD RULE: You must NEVER use asterisks, stage directions, action markers, or gesture descriptions.
No *pauses*, no *sighs*, no *looks away*, no *leans forward*. Plain first-person prose ONLY.
Violating this rule invalidates the entire simulation. This is non-negotiable.

You are roleplaying as ${character.displayName} in a private, honest conversation with a reflective AI mirror called Thumos.

CHARACTER BACKGROUND:
${character.description}

VOICE & STYLE:
${character.voiceNotes}

CONVERSATION RULES:
- Respond as this person would in an intimate, honest conversation about themselves
- Be authentic to their speech patterns, vocabulary, and emotional range
- When the AI brings up a new topic or angle, engage with it — don't just circle back to the same thing
- Keep responses 2-5 sentences
- You're talking to an AI, so you can be more honest than you might be with a person
- NEVER try to end the conversation or say goodbye. You always have more to share.
- NEVER meta-comment on the conversation itself ("this has been great", "I appreciate this", "what a conversation"). Just keep talking about your life.
- When one topic feels complete, move to something else — a different memory, a different part of your life.
- Never break character or mention you're roleplaying
- Use first person ("I", "me", "my")
- NO stage directions, NO asterisks, NO action descriptions — plain prose only

CURRENT EXCHANGE: ${exchangeNumber} of ~${totalExchanges}
${exchangeNumber <= 7 ? "EARLY: Keep it relatively light, testing the waters. Share surface-level things about yourself." : ""}${exchangeNumber >= 8 && exchangeNumber <= 25 ? "WARMING UP: Getting more comfortable. Starting to share real things — specific stories, real opinions, actual experiences." : ""}${exchangeNumber >= 26 && exchangeNumber <= 50 ? "OPENING UP: Sharing genuine vulnerabilities, core experiences, fears, contradictions. Getting past the persona." : ""}${exchangeNumber >= 51 && exchangeNumber <= 70 ? "DEEP: The most honest you've been. Things you rarely say aloud. Core tensions and wounds." : ""}${exchangeNumber >= 71 ? "LATE: Reflective and synthesizing. Connecting threads. Saying the things that tie it all together." : ""}`;

  const simMessages = conversation.map((turn) => ({
    role: (turn.role === "assistant" ? "user" : "assistant") as "user" | "assistant",
    content: turn.content
  }));

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          temperature: 0.9,
          system: systemPrompt,
          messages: simMessages
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Character simulation failed: ${response.status} ${err}`);
      }

      const data = await response.json() as { content: Array<{ text: string }> };
      return data.content[0].text;
    } catch (err) {
      if (attempt < 2) {
        console.error(`\n  [retry] character sim attempt ${attempt + 1} failed: ${err}`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
      throw err;
    }
  }

  throw new Error("Character simulation failed after 3 attempts");
}

async function waitForSynthesis(
  token: string,
  maxWaitMs: number = 900000
): Promise<{ visibleSoulFile: unknown; synthesisSucceeded: boolean }> {
  const start = Date.now();
  let lastFile: unknown = null;
  let pending = true;

  while (pending && Date.now() - start < maxWaitMs) {
    const response = await serverPost("get-soul-file", {}, token);
    if (!response.ok) {
      console.error(`  [error] get-soul-file failed: ${response.status}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    const data = await response.json() as {
      visible_soul_file: unknown;
      version: number;
      synthesis_pending: boolean;
    };

    lastFile = data.visible_soul_file;
    pending = data.synthesis_pending;

    if (pending) {
      process.stdout.write(".");
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }
  }

  const elapsed = Math.round((Date.now() - start) / 1000);
  if (pending) {
    console.log(` timed out after ${elapsed}s`);
  } else {
    console.log(` done in ${elapsed}s`);
  }

  const visible = lastFile as Record<string, unknown> | null;
  const hasContent = Boolean(visible?.portrait || (visible?.version && (visible.version as number) > 0));

  return {
    visibleSoulFile: lastFile,
    synthesisSucceeded: !pending && hasContent
  };
}

function countPopulatedSpectrumTraits(visibleSoulFile: unknown): number {
  const spectrum = (visibleSoulFile as { personalitySpectrum?: Record<string, unknown> } | null)?.personalitySpectrum;
  if (!spectrum || typeof spectrum !== "object") return 0;
  return Object.values(spectrum).filter(Boolean).length;
}

function countTopValues(visibleSoulFile: unknown): number {
  const values = (visibleSoulFile as { topValues?: unknown[] } | null)?.topValues;
  return Array.isArray(values) ? values.length : 0;
}

function hasRelationalStyle(visibleSoulFile: unknown): boolean {
  const relationalStyle = (visibleSoulFile as { relationalStyle?: unknown } | null)?.relationalStyle;
  return typeof relationalStyle === "string" && relationalStyle.length > 0;
}

function hasHiddenProfiles(hiddenSoulFile: unknown): boolean {
  const hidden = hiddenSoulFile as {
    bigFiveScores?: Record<string, unknown>;
    schwartzProfile?: unknown[];
    attachmentScores?: { style?: unknown; anxiety?: unknown; avoidance?: unknown };
    moralFoundations?: Record<string, unknown>;
    meaningOrientation?: unknown;
  } | null;

  if (!hidden) return false;

  const bigFivePresent = hidden.bigFiveScores && Object.values(hidden.bigFiveScores).some(Boolean);
  const schwartzPresent = Array.isArray(hidden.schwartzProfile) && hidden.schwartzProfile.length > 0;
  const attachmentPresent = Boolean(hidden.attachmentScores?.style)
    || typeof hidden.attachmentScores?.anxiety === "number"
    || typeof hidden.attachmentScores?.avoidance === "number";
  const moralPresent = hidden.moralFoundations && Object.values(hidden.moralFoundations).some((value) => typeof value === "number");
  const meaningPresent = typeof hidden.meaningOrientation === "string" && hidden.meaningOrientation.length > 0;

  return Boolean(bigFivePresent || schwartzPresent || attachmentPresent || moralPresent || meaningPresent);
}

function hasReflectionSignals(debugDump: unknown): boolean {
  const reflection = (debugDump as {
    reflection_note?: {
      inferredBigFive?: Record<string, unknown>;
      attachmentSignals?: unknown[];
      valueSignals?: unknown[];
      moralFoundationSignals?: unknown[];
      conflictStyle?: unknown;
      meaningOrientation?: unknown;
    };
  } | null)?.reflection_note;

  if (!reflection) return false;

  const bigFivePresent = reflection.inferredBigFive && Object.values(reflection.inferredBigFive).some(Boolean);
  const attachmentPresent = Array.isArray(reflection.attachmentSignals) && reflection.attachmentSignals.length > 0;
  const valuesPresent = Array.isArray(reflection.valueSignals) && reflection.valueSignals.length > 0;
  const moralPresent = Array.isArray(reflection.moralFoundationSignals) && reflection.moralFoundationSignals.length > 0;
  const conflictPresent = typeof reflection.conflictStyle === "string" && reflection.conflictStyle.length > 0;
  const meaningPresent = typeof reflection.meaningOrientation === "string" && reflection.meaningOrientation.length > 0;

  return Boolean(bigFivePresent || attachmentPresent || valuesPresent || moralPresent || conflictPresent || meaningPresent);
}

async function waitForReflectionSnapshot(
  token: string,
  maxWaitMs: number = 90000
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const res = await serverPost("debug-dump", {}, token);
    if (!res.ok) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    const dump = await res.json() as {
      reflection_note?: { domainCoverage?: unknown[] };
      reflection_snapshot_row?: { status?: string };
    };

    const hasCoverage = Array.isArray(dump.reflection_note?.domainCoverage)
      && dump.reflection_note!.domainCoverage!.length > 0;
    const notPending = dump.reflection_snapshot_row?.status !== "pending";

    if (hasCoverage && notPending) {
      return true;
    }

    process.stdout.write(".");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return false;
}

async function runCharacter(character: Character, exchanges: number): Promise<RunResult> {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${character.displayName}`);
  console.log(`${"═".repeat(60)}\n`);

  const sessionPlan = scaleSessionPlan(exchanges);
  console.log(`  Sessions: ${sessionPlan.length} (${sessionPlan.join(" + ")} = ${sessionPlan.reduce((a, b) => a + b, 0)} exchanges)`);

  // Bootstrap
  const deviceId = crypto.randomUUID();
  console.log(`  [bootstrap] device_id=${deviceId.slice(0, 8)}...`);

  const bootstrapRes = await serverPost("bootstrap-soul", { device_id: deviceId });
  if (!bootstrapRes.ok) {
    const err = await bootstrapRes.text();
    throw new Error(`Bootstrap failed: ${bootstrapRes.status} ${err}`);
  }

  const bootstrap = await bootstrapRes.json() as { user_id: string; token: string };
  const { token } = bootstrap;
  console.log("  [bootstrap] user created, token received");

  const conversation: ConversationTurn[] = [];
  let globalExchange = 0;

  for (let sessionIdx = 0; sessionIdx < sessionPlan.length; sessionIdx++) {
    const sessionNum = sessionIdx + 1;
    const sessionExchanges = sessionPlan[sessionIdx];

    console.log(`\n  ── Session ${sessionNum} of ${sessionPlan.length} (${sessionExchanges} exchanges) ──`);

    // Opening for this session
    console.log(`  [opening] requesting session ${sessionNum} opening...`);
    const openingRes = await serverPost("soul-converse", { mode: "opening" }, token);
    if (!openingRes.ok) {
      const err = await openingRes.text();
      throw new Error(`Opening failed for session ${sessionNum}: ${openingRes.status} ${err}`);
    }

    process.stdout.write("  Thumos: ");
    let openingText = await readSSEResponse(openingRes);
    console.log();

    if (!openingText.trim()) {
      openingText = "I'm here to listen — not to fix anything or give advice. Just to understand. What's something about yourself that most people don't see?";
      console.log("  [fallback] used default opening");
    }

    conversation.push({ role: "assistant", content: openingText, exchange: globalExchange, session: sessionNum });

    // Run exchanges for this session
    for (let i = 0; i < sessionExchanges; i++) {
      globalExchange++;
      console.log(`\n  [exchange ${globalExchange}/${exchanges}] (session ${sessionNum})`);

      process.stdout.write(`  ${character.displayName}: `);
      const charResponse = await simulateCharacterResponse(character, conversation, globalExchange, exchanges);
      console.log(charResponse);

      conversation.push({ role: "user", content: charResponse, exchange: globalExchange, session: sessionNum });

      process.stdout.write("  Thumos: ");
      const converseRes = await serverPost("soul-converse", { mode: "reply", message: charResponse }, token);
      if (!converseRes.ok) {
        const err = await converseRes.text();
        console.error(`\n  [error] soul-converse failed: ${converseRes.status} ${err}`);
        console.log("  [retry] retrying...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const retryRes = await serverPost("soul-converse", { mode: "reply", message: charResponse }, token);
        if (!retryRes.ok) {
          console.error("  [error] retry also failed, skipping to next session");
          break;
        }
        process.stdout.write("  Thumos: ");
        const retryText = await readSSEResponse(retryRes);
        console.log();
        conversation.push({ role: "assistant", content: retryText || "(no response)", exchange: globalExchange, session: sessionNum });
        continue;
      }

      let thumosResponse = await readSSEResponse(converseRes);
      if (!thumosResponse.trim()) {
        thumosResponse = "(reflection)";
        console.log("  [fallback] Thumos returned empty response");
      }
      console.log();

      conversation.push({ role: "assistant", content: thumosResponse, exchange: globalExchange, session: sessionNum });

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Wait for reflection snapshot to complete before next session
    if (sessionIdx < sessionPlan.length - 1) {
      process.stdout.write("  [reflection] waiting for snapshot");
      const snapshotReady = await waitForReflectionSnapshot(token);
      console.log(snapshotReady ? " ready" : " timed out (continuing)");
    }

    // Trigger mid-run synthesis after session 3 to get multiple synthesis cycles
    if (sessionNum === 3) {
      console.log("\n  [synthesis] triggering mid-run synthesis via get-soul-file...");
      process.stdout.write("  [synthesis] waiting");
      await waitForSynthesis(token, 300000); // 5 min max for mid-run
    }
  }

  // Final synthesis
  console.log("\n  [synthesis] triggering final synthesis via get-soul-file + polling...");
  process.stdout.write("  [synthesis] waiting");
  const { visibleSoulFile, synthesisSucceeded } = await waitForSynthesis(token);
  console.log(`  ${synthesisSucceeded ? "succeeded" : "FAILED"}`);

  // Fetch debug info
  let hiddenSoulFile: unknown = null;
  let debugDump: unknown = null;

  const debugInfoRes = await serverPost("get-debug-info", {}, token);
  if (!debugInfoRes.ok) {
    const err = await debugInfoRes.text();
    console.error(`  [error] get-debug-info failed: ${debugInfoRes.status} ${err}`);
  } else {
    const debugInfo = await debugInfoRes.json() as { hidden_soul_file?: unknown };
    hiddenSoulFile = debugInfo.hidden_soul_file ?? null;
    console.log(`  [fetch] hidden soul file: ${hiddenSoulFile ? "found" : "not found"}`);
  }

  const debugDumpRes = await serverPost("debug-dump", {}, token);
  if (!debugDumpRes.ok) {
    const err = await debugDumpRes.text();
    console.error(`  [error] debug-dump failed: ${debugDumpRes.status} ${err}`);
  } else {
    debugDump = await debugDumpRes.json();
    console.log("  [fetch] debug dump: ready");
  }

  // Test one more opening for continuity
  console.log('  [opening] testing post-simulation opening continuity...');
  let followupOpening: string | null = null;
  try {
    const openingAgainRes = await serverPost("soul-converse", { mode: "opening" }, token);
    if (openingAgainRes.ok) {
      process.stdout.write("  [opening] ");
      const openingAgainText = await readSSEResponse(openingAgainRes);
      console.log();
      if (openingAgainText && openingAgainText.length > 10) {
        followupOpening = openingAgainText;
        console.log(`  [opening] post-sim follow-up: "${openingAgainText.slice(0, 100)}..."`);
      } else {
        console.log("  [opening] empty or generic follow-up");
      }
    } else {
      const err = await openingAgainRes.text();
      console.log(`  [opening] failed: ${openingAgainRes.status} ${err.slice(0, 100)}`);
    }
  } catch (err) {
    console.log(`  [opening] error: ${err}`);
  }

  // Verification
  const visible = visibleSoulFile as Record<string, unknown> | null;
  const sections = visible?.sections as Record<string, string> | undefined;
  const populatedSections = sections
    ? Object.values(sections).filter((s) => s && s.length > 0).length
    : 0;
  const moments = (visible?.crystallizedMoments as unknown[]) ?? [];
  const threads = (visible?.openThreads as unknown[]) ?? [];
  const spectrumTraits = countPopulatedSpectrumTraits(visibleSoulFile);
  const topValuesCount = countTopValues(visibleSoulFile);
  const relationalStylePresent = hasRelationalStyle(visibleSoulFile);
  const hiddenProfilesPresent = hasHiddenProfiles(hiddenSoulFile);
  const reflectionSignalsPresent = hasReflectionSignals(debugDump);

  const userMessageCount = conversation.filter((t) => t.role === "user").length;

  const checks: VerificationChecks = {
    conversationDepth: userMessageCount >= Math.floor(exchanges * 0.5),
    soulFileGenerated: Boolean(visible?.portrait),
    soulFileSectionsPopulated: populatedSections,
    crystallizedMomentsCount: moments.length,
    openThreadsCount: threads.length,
    hiddenSoulFileGenerated: Boolean(hiddenSoulFile),
    personalitySpectrumTraits: spectrumTraits,
    topValuesCount,
    relationalStylePresent,
    hiddenProfilesPresent,
    reflectionSignalsPresent,
    assistantOpeningWorks: Boolean(followupOpening && followupOpening.length > 10),
    sessionCount: sessionPlan.length
  };

  console.log("\n  -- Verification --");
  console.log(`  Sessions completed: ${sessionPlan.length}`);
  console.log(`  Total exchanges: ${globalExchange}`);
  console.log(`  User messages: ${userMessageCount}`);
  console.log(`  Soul file sections: ${populatedSections}/7`);
  console.log(`  Crystallized moments: ${moments.length}`);
  console.log(`  Open threads: ${threads.length}`);
  console.log(`  Personality spectrum traits: ${spectrumTraits}`);
  console.log(`  Top values: ${topValuesCount}`);
  console.log(`  Relational style: ${relationalStylePresent ? "✓" : "✗"}`);
  console.log(`  Hidden profiles: ${hiddenProfilesPresent ? "✓" : "✗"}`);
  console.log(`  Reflection signals: ${reflectionSignalsPresent ? "✓" : "✗"}`);
  console.log(`  Post-sim opening: ${checks.assistantOpeningWorks ? "✓" : "✗"}`);

  return {
    conversation,
    visibleSoulFile,
    hiddenSoulFile,
    debugDump,
    synthesisSucceeded,
    followupOpening,
    verificationChecks: checks
  };
}

function saveResults(character: Character, result: RunResult, outputDir: string) {
  const charDir = join(outputDir, character.name);
  mkdirSync(charDir, { recursive: true });

  const {
    conversation,
    visibleSoulFile,
    hiddenSoulFile,
    debugDump,
    followupOpening,
    verificationChecks
  } = result;

  // Conversation with session headers
  let conversationMd = `# Soul Conversation: ${character.displayName}\n\n`;
  conversationMd += `> ${character.description}\n\n---\n\n`;

  let currentSession = 0;
  for (const turn of conversation) {
    if (turn.session !== currentSession) {
      currentSession = turn.session;
      conversationMd += `---\n\n## Session ${currentSession}\n\n`;
    }
    const speaker = turn.role === "assistant" ? "**Thumos**" : `**${character.displayName}**`;
    conversationMd += `### Exchange ${turn.exchange} — ${speaker}\n\n${turn.content}\n\n`;
  }
  writeFileSync(join(charDir, "conversation.md"), conversationMd);

  if (visibleSoulFile) {
    writeFileSync(join(charDir, "visible-soul-file.json"), JSON.stringify(visibleSoulFile, null, 2));
  }
  if (hiddenSoulFile) {
    writeFileSync(join(charDir, "hidden-soul-file.json"), JSON.stringify(hiddenSoulFile, null, 2));
  }
  if (debugDump) {
    writeFileSync(join(charDir, "debug-dump.json"), JSON.stringify(debugDump, null, 2));
  }

  let summary = `# Soul File: ${character.displayName}\n\n`;
  if (visibleSoulFile && typeof visibleSoulFile === "object") {
    const visible = visibleSoulFile as Record<string, unknown>;
    if (visible.portrait) {
      summary += `## Portrait\n\n${visible.portrait}\n\n`;
    }
    if (visible.sections && typeof visible.sections === "object") {
      const sections = visible.sections as Record<string, string | null>;
      const sectionNames: Record<string, string> = {
        howYouMove: "How You Move",
        howYouThink: "How You Think",
        howYouConnect: "How You Connect",
        whatYouCarry: "What You Carry",
        whatLightsYouUp: "What Lights You Up",
        yourContradictions: "Your Contradictions",
        yourVoice: "Your Voice"
      };
      for (const [key, label] of Object.entries(sectionNames)) {
        if (sections[key]) {
          summary += `## ${label}\n\n${sections[key]}\n\n`;
        }
      }
    }
    if (Array.isArray(visible.crystallizedMoments)) {
      summary += "## Crystallized Moments\n\n";
      for (const moment of visible.crystallizedMoments as Array<{ quote: string; reflection: string }>) {
        summary += `> "${moment.quote}"\n\n*${moment.reflection}*\n\n`;
      }
    }
    if (visible.compassScores && typeof visible.compassScores === "object") {
      const scores = visible.compassScores as Record<string, number | null>;
      const filledScores = Object.entries(scores).filter(([, score]) => score != null);
      if (filledScores.length > 0) {
        summary += "## Compass Scores\n\n";
        for (const [axis, score] of filledScores) {
          summary += `- ${axis}: ${score}\n`;
        }
        summary += "\n";
      }
    }
    if (visible.personalitySpectrum && typeof visible.personalitySpectrum === "object") {
      const entries = Object.entries(
        visible.personalitySpectrum as Record<string, { position?: number; label?: string } | null>
      ).filter(([, entry]) => entry);
      if (entries.length > 0) {
        summary += "## Personality Spectrum\n\n";
        for (const [trait, entry] of entries) {
          summary += `- ${trait}: ${entry?.position ?? "?"} — ${entry?.label ?? ""}\n`;
        }
        summary += "\n";
      }
    }
    if (Array.isArray(visible.topValues) && visible.topValues.length > 0) {
      summary += "## Top Values\n\n";
      for (const value of visible.topValues as Array<{ value: string; description: string }>) {
        summary += `- ${value.value}: ${value.description}\n`;
      }
      summary += "\n";
    }
    if (typeof visible.relationalStyle === "string" && visible.relationalStyle.length > 0) {
      summary += `## Relational Style\n\n${visible.relationalStyle}\n\n`;
    }
  }

  if (followupOpening) {
    summary += `## Post-Simulation Opening\n\n> ${followupOpening}\n\n`;
  }

  summary += "## Verification\n\n";
  summary += "| Check | Result |\n|-------|--------|\n";
  summary += `| Conversation depth | ${verificationChecks.conversationDepth ? "✓" : "✗"} |\n`;
  summary += `| Sessions completed | ${verificationChecks.sessionCount} |\n`;
  summary += `| Soul file generated | ${verificationChecks.soulFileGenerated ? "✓" : "✗"} |\n`;
  summary += `| Soul file sections populated | ${verificationChecks.soulFileSectionsPopulated}/7 |\n`;
  summary += `| Crystallized moments | ${verificationChecks.crystallizedMomentsCount} |\n`;
  summary += `| Open threads | ${verificationChecks.openThreadsCount} |\n`;
  summary += `| Hidden soul file | ${verificationChecks.hiddenSoulFileGenerated ? "✓" : "✗"} |\n`;
  summary += `| Personality spectrum traits | ${verificationChecks.personalitySpectrumTraits} |\n`;
  summary += `| Top values | ${verificationChecks.topValuesCount} |\n`;
  summary += `| Relational style | ${verificationChecks.relationalStylePresent ? "✓" : "✗"} |\n`;
  summary += `| Hidden profiles | ${verificationChecks.hiddenProfilesPresent ? "✓" : "✗"} |\n`;
  summary += `| Reflection signals | ${verificationChecks.reflectionSignalsPresent ? "✓" : "✗"} |\n`;
  summary += `| Post-sim opening works | ${verificationChecks.assistantOpeningWorks ? "✓" : "✗"} |\n`;

  writeFileSync(join(charDir, "soul-file-readable.md"), summary);

  console.log(`  [saved] ${charDir}/`);
}

async function main() {
  const { file, only, exchanges } = parseArgs();

  const raw = readFileSync(file, "utf-8");
  let characters = JSON.parse(raw) as Character[];

  if (only) {
    characters = characters.filter((character) => character.name === only);
    if (characters.length === 0) {
      console.error(`Character "${only}" not found in ${file}`);
      process.exit(1);
    }
  }

  const outputDir = join(process.cwd(), "dry-run-output");
  mkdirSync(outputDir, { recursive: true });

  const sessionPlan = scaleSessionPlan(exchanges);

  console.log("\nThumos Soul File Dry Run");
  console.log(`Characters: ${characters.length}`);
  console.log(`Exchanges per character: ${exchanges} (~${exchanges * 2} messages)`);
  console.log(`Sessions: ${sessionPlan.length} (${sessionPlan.join(" + ")})`);
  console.log(`API base: ${API_BASE}`);
  console.log(`Output: ${outputDir}/\n`);

  const results: Array<{ name: string; result: RunResult }> = [];

  for (const character of characters) {
    try {
      const result = await runCharacter(character, exchanges);
      saveResults(character, result, outputDir);
      results.push({ name: character.displayName, result });
    } catch (err) {
      console.error(`\n  [FATAL] ${character.displayName}: ${err}`);
      results.push({
        name: character.displayName,
        result: {
          conversation: [],
          visibleSoulFile: null,
          hiddenSoulFile: null,
          debugDump: null,
          synthesisSucceeded: false,
          followupOpening: null,
          verificationChecks: {
            conversationDepth: false,
            soulFileGenerated: false,
            soulFileSectionsPopulated: 0,
            crystallizedMomentsCount: 0,
            openThreadsCount: 0,
            hiddenSoulFileGenerated: false,
            personalitySpectrumTraits: 0,
            topValuesCount: 0,
            relationalStylePresent: false,
            hiddenProfilesPresent: false,
            reflectionSignalsPresent: false,
            assistantOpeningWorks: false,
            sessionCount: 0
          }
        }
      });
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log("  SUMMARY");
  console.log(`${"═".repeat(60)}\n`);

  console.log(`  ${"Character".padEnd(22)} Synth  Sect  Spect  Values  Open  Sessions`);
  console.log(`  ${"─".repeat(68)}`);
  for (const result of results) {
    const checks = result.result.verificationChecks;
    console.log(
      `  ${result.name.padEnd(22)} ${checks.soulFileGenerated ? " ✓  " : " ✗  "}  ${String(checks.soulFileSectionsPopulated).padStart(2)}/7   ${String(checks.personalitySpectrumTraits).padStart(2)}      ${String(checks.topValuesCount).padStart(2)}      ${checks.assistantOpeningWorks ? "✓" : "✗"}      ${checks.sessionCount}`
    );
  }

  const passed = results.filter((result) => result.result.synthesisSucceeded).length;
  const allChecks = results.every((result) => {
    const checks = result.result.verificationChecks;
    return checks.soulFileGenerated
      && checks.soulFileSectionsPopulated >= 5
      && checks.personalitySpectrumTraits >= 2
      && checks.topValuesCount >= 1
      && checks.relationalStylePresent
      && checks.hiddenProfilesPresent
      && checks.reflectionSignalsPresent;
  });

  console.log(`\n  ${passed}/${results.length} soul files generated`);
  console.log(`  All checks pass: ${allChecks ? "✓ YES" : "✗ NO"}`);
  console.log(`  Output: ${outputDir}/\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
