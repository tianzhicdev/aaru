#!/usr/bin/env npx tsx
/**
 * dry-run-soul-files.ts
 *
 * CLI client that talks to the deployed Thumos server, simulating characters
 * via Claude to generate soul files for quality review.
 *
 * Usage: npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json
 *        npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --only fred-rogers
 *        npx tsx scripts/dry-run-soul-files.ts --file scripts/characters.json --exchanges 15
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

const DEFAULT_EXCHANGES = 15;

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
}

interface VerificationChecks {
  conversationDepth: boolean;
  conversationBreadth: boolean;
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
  steeringObserved: boolean;
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
  const systemPrompt = `You are roleplaying as ${character.displayName} in a private, honest conversation with a reflective AI mirror called Thumos.

CHARACTER BACKGROUND:
${character.description}

VOICE & STYLE:
${character.voiceNotes}

CONVERSATION RULES:
- Respond as this person would in an intimate, honest conversation about themselves
- Be authentic to their speech patterns, vocabulary, and emotional range
- Start surface-level in early exchanges, go deeper gradually
- By exchange 4-6, begin revealing more personal or vulnerable things
- By exchange 8-10, share something that reveals a core tension or wound
- By exchange 11+, share the deepest contradictions and things rarely said aloud
- Don't dump everything at once; let the AI's questions guide you
- Keep responses 2-5 sentences
- You're talking to an AI, so you can be more honest than you might be with a person
- Never break character or mention you're roleplaying
- Use first person ("I", "me", "my")
- Do not include stage directions or roleplay markers
- If the AI asks about a new topic area, engage with it instead of circling the same thing

CURRENT EXCHANGE: ${exchangeNumber} of ~${totalExchanges}
${exchangeNumber <= 3 ? "EARLY: Keep it relatively light, testing the waters." : ""}
${exchangeNumber >= 4 && exchangeNumber <= 7 ? "MIDDLE: Getting more comfortable, starting to share real things." : ""}
${exchangeNumber >= 8 && exchangeNumber <= 11 ? "DEEP: Opening up about core experiences, fears, contradictions." : ""}
${exchangeNumber >= 12 ? "LATE: Most honest and reflective. Saying things you rarely say." : ""}`;

  const simMessages = conversation.map((turn) => ({
    role: (turn.role === "assistant" ? "user" : "assistant") as "user" | "assistant",
    content: turn.content
  }));

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

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  relationships: ["relationship", "connect", "friend", "family", "love", "partner", "people", "trust", "lonely"],
  "work/craft": ["work", "create", "build", "craft", "career", "profession", "art", "practice", "skill"],
  identity: ["identity", "who you are", "define", "label", "see yourself", "think of yourself"],
  emotions: ["feel", "emotion", "anger", "joy", "sadness", "fear", "happy", "anxious", "peaceful"],
  values: ["value", "matter", "important", "believe", "principle", "stand for", "care about"],
  "past/memory": ["remember", "childhood", "grew up", "memory", "past", "younger", "used to"],
  contradictions: ["contradict", "tension", "both", "opposite", "struggle", "torn"],
  "loss/grief": ["loss", "grief", "miss", "gone", "death", "lost", "mourn"]
};

function detectDomains(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.entries(DOMAIN_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => lower.includes(keyword)))
    .map(([domain]) => domain);
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

async function runCharacter(character: Character, exchanges: number): Promise<RunResult> {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${character.displayName}`);
  console.log(`${"═".repeat(60)}\n`);

  const domainsCovered = new Set<string>();
  const topicShifts: string[] = [];
  let lastDomains: string[] = [];

  const deviceId = crypto.randomUUID();
  console.log(`[bootstrap] device_id=${deviceId.slice(0, 8)}...`);

  const bootstrapRes = await serverPost("bootstrap-soul", { device_id: deviceId });
  if (!bootstrapRes.ok) {
    const err = await bootstrapRes.text();
    throw new Error(`Bootstrap failed: ${bootstrapRes.status} ${err}`);
  }

  const bootstrap = await bootstrapRes.json() as { user_id: string; token: string };
  const { token } = bootstrap;
  console.log("[bootstrap] user created, token received");

  console.log("[opening] requesting first question...");
  const openingRes = await serverPost("soul-converse", { mode: "opening" }, token);
  if (!openingRes.ok) {
    const err = await openingRes.text();
    throw new Error(`Opening failed: ${openingRes.status} ${err}`);
  }

  process.stdout.write("  Thumos: ");
  let openingText = await readSSEResponse(openingRes);
  console.log();

  if (!openingText.trim()) {
    openingText = "I'm here to listen — not to fix anything or give advice. Just to understand. What's something about yourself that most people don't see?";
    console.log("  [fallback] used default opening");
  }

  const openingDomains = detectDomains(openingText);
  openingDomains.forEach((domain) => domainsCovered.add(domain));
  lastDomains = openingDomains;

  const conversation: ConversationTurn[] = [
    { role: "assistant", content: openingText, exchange: 0 }
  ];

  for (let exchange = 1; exchange <= exchanges; exchange += 1) {
    console.log(`\n  [exchange ${exchange}/${exchanges}]`);
    process.stdout.write(`  ${character.displayName}: `);
    const charResponse = await simulateCharacterResponse(character, conversation, exchange, exchanges);
    console.log(charResponse);

    conversation.push({ role: "user", content: charResponse, exchange });
    detectDomains(charResponse).forEach((domain) => domainsCovered.add(domain));

    process.stdout.write("  Thumos: ");
    const converseRes = await serverPost("soul-converse", { mode: "reply", message: charResponse }, token);
    if (!converseRes.ok) {
      const err = await converseRes.text();
      console.error(`\n  [error] soul-converse failed: ${converseRes.status} ${err}`);
      console.log("  [retry] retrying soul-converse...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const retryRes = await serverPost("soul-converse", { mode: "reply", message: charResponse }, token);
      if (!retryRes.ok) {
        console.error("  [error] retry also failed, skipping remaining exchanges");
        break;
      }
      process.stdout.write("  Thumos: ");
      const retryText = await readSSEResponse(retryRes);
      console.log();
      conversation.push({ role: "assistant", content: retryText || "(no response)", exchange });
      continue;
    }

    let thumosResponse = await readSSEResponse(converseRes);
    if (!thumosResponse.trim()) {
      thumosResponse = "(reflection)";
      console.log("  [fallback] Thumos returned empty response");
    }
    console.log();

    conversation.push({ role: "assistant", content: thumosResponse, exchange });

    const currentDomains = detectDomains(thumosResponse);
    currentDomains.forEach((domain) => domainsCovered.add(domain));

    const newDomains = currentDomains.filter((domain) => !lastDomains.includes(domain));
    if (newDomains.length > 0) {
      topicShifts.push(`Exchange ${exchange}: -> ${newDomains.join(", ")}`);
    }
    lastDomains = currentDomains;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("\n  [synthesis] triggering via get-soul-file + polling...");
  process.stdout.write("  [synthesis] waiting");
  const { visibleSoulFile, synthesisSucceeded } = await waitForSynthesis(token);
  console.log(` ${synthesisSucceeded ? "succeeded" : "FAILED"}`);

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

  console.log('  [opening] testing assistant-led opening continuity (mode:"opening")...');
  let followupOpening: string | null = null;
  try {
    const openingAgainRes = await serverPost("soul-converse", { mode: "opening" }, token);
    if (openingAgainRes.ok) {
      process.stdout.write("  [opening] ");
      const openingAgainText = await readSSEResponse(openingAgainRes);
      console.log();
      if (openingAgainText && openingAgainText.length > 10) {
        followupOpening = openingAgainText;
        console.log(`  [opening] assistant-led follow-up: "${openingAgainText.slice(0, 100)}..."`);
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

  const visible = visibleSoulFile as Record<string, unknown> | null;
  const sections = visible?.sections as Record<string, string> | undefined;
  const populatedSections = sections
    ? Object.values(sections).filter((section) => section && section.length > 0).length
    : 0;
  const moments = (visible?.crystallizedMoments as unknown[]) ?? [];
  const threads = (visible?.openThreads as unknown[]) ?? [];
  const spectrumTraits = countPopulatedSpectrumTraits(visibleSoulFile);
  const topValuesCount = countTopValues(visibleSoulFile);
  const relationalStylePresent = hasRelationalStyle(visibleSoulFile);
  const hiddenProfilesPresent = hasHiddenProfiles(hiddenSoulFile);
  const reflectionSignalsPresent = hasReflectionSignals(debugDump);

  const checks: VerificationChecks = {
    conversationDepth: conversation.filter((turn) => turn.role === "user").length >= 10,
    conversationBreadth: domainsCovered.size >= 3,
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
    steeringObserved: topicShifts.length >= 2
  };

  console.log("\n  -- Verification --");
  console.log(`  Domains covered: ${[...domainsCovered].join(", ")} (${domainsCovered.size})`);
  console.log(`  Topic shifts: ${topicShifts.length}`);
  for (const shift of topicShifts.slice(0, 5)) {
    console.log(`    ${shift}`);
  }
  console.log(`  Soul file sections: ${populatedSections}/7`);
  console.log(`  Crystallized moments: ${moments.length}`);
  console.log(`  Open threads: ${threads.length}`);
  console.log(`  Personality spectrum traits: ${spectrumTraits}`);
  console.log(`  Top values: ${topValuesCount}`);
  console.log(`  Relational style: ${relationalStylePresent ? "✓" : "✗"}`);
  console.log(`  Hidden profiles: ${hiddenProfilesPresent ? "✓" : "✗"}`);
  console.log(`  Reflection signals: ${reflectionSignalsPresent ? "✓" : "✗"}`);
  console.log(`  Assistant opening: ${checks.assistantOpeningWorks ? "✓" : "✗"}`);
  console.log(`  Steering: ${checks.steeringObserved ? "✓" : "✗"}`);

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

  let conversationMd = `# Soul Conversation: ${character.displayName}\n\n`;
  conversationMd += `> ${character.description}\n\n---\n\n`;
  for (const turn of conversation) {
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
    summary += `## Assistant-led Follow-up Opening\n\n> ${followupOpening}\n\n`;
  }

  summary += "## Verification\n\n";
  summary += "| Check | Result |\n|-------|--------|\n";
  summary += `| Conversation depth (>=10 user messages) | ${verificationChecks.conversationDepth ? "✓" : "✗"} |\n`;
  summary += `| Conversation breadth (>=3 domains) | ${verificationChecks.conversationBreadth ? "✓" : "✗"} |\n`;
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
  summary += `| Assistant-led opening works | ${verificationChecks.assistantOpeningWorks ? "✓" : "✗"} |\n`;
  summary += `| Steering observed | ${verificationChecks.steeringObserved ? "✓" : "✗"} |\n`;

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

  console.log("\nThumos Soul File Dry Run");
  console.log(`Characters: ${characters.length}`);
  console.log(`Exchanges per character: ${exchanges}`);
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
            conversationBreadth: false,
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
            steeringObserved: false
          }
        }
      });
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log("  SUMMARY");
  console.log(`${"═".repeat(60)}\n`);

  console.log(`  ${"Character".padEnd(22)} Synth  Sect  Spect  Values  Open  Steer`);
  console.log(`  ${"─".repeat(65)}`);
  for (const result of results) {
    const checks = result.result.verificationChecks;
    console.log(
      `  ${result.name.padEnd(22)} ${checks.soulFileGenerated ? " ✓  " : " ✗  "}  ${String(checks.soulFileSectionsPopulated).padStart(2)}/7   ${String(checks.personalitySpectrumTraits).padStart(2)}      ${String(checks.topValuesCount).padStart(2)}      ${checks.assistantOpeningWorks ? "✓" : "✗"}      ${checks.steeringObserved ? "✓" : "✗"}`
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
