#!/usr/bin/env npx tsx
/**
 * Soul v2 Ka conversation simulator.
 *
 * Runs phased conversations between enriched soul profiles using Groq,
 * evaluates multi-dimensional impressions, tracks encounter-count-aware
 * accumulation, and reports Ba unlock progress.
 *
 * Outputs:
 *   logs/sim_<timestamp>/souls.json     — soul profiles used
 *   logs/sim_<timestamp>/round_N.json   — per-round transcript + scores
 *   logs/sim_<timestamp>/summary.json   — final results
 *
 * Usage:
 *   npx tsx scripts/simulate_conversation.ts
 *   npx tsx scripts/simulate_conversation.ts --rounds 5
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ConversationMessage, KaConversationContext, SoulProfile, ImpressionEvaluation } from "../src/domain/types.ts";
import { buildKaReply, generateConversationSummary } from "../src/domain/ka.ts";
import {
  evaluateImpression,
  evaluateImpressionFallback,
  accumulateImpression,
  isBaAvailableToViewer,
} from "../src/domain/impression.ts";
import {
  IMPRESSION_EVALUATION_INTERVAL,
  IMPRESSION_UNLOCK_THRESHOLD,
  EARLY_PHASE_MESSAGES,
  MIDDLE_PHASE_MESSAGES,
  DEEP_PHASE_MESSAGES,
  EARLY_PHASE_MAX_ENCOUNTERS,
  MIDDLE_PHASE_MAX_ENCOUNTERS,
} from "../src/domain/constants.ts";

// ─── Two enriched test soul profiles ─────────────────────────────

const soulA: SoulProfile = {
  personality: "Nahla is quietly playful, observant, and drawn to emotional subtext. She notices details others miss and likes sitting with ambiguity rather than rushing to conclusions.",
  interests: ["film photography", "indie cinema", "night walks", "journaling", "analog synths"],
  values: {
    self_transcendence: 0.8,
    self_enhancement: 0.3,
    openness_to_change: 0.9,
    conservation: 0.2,
    expressed: ["honesty", "patience", "warmth", "creative integrity"],
  },
  narrative: {
    formative_stories: [
      "When I was twelve, I found my mother's old film camera in a closet. I spent that whole summer photographing the neighborhood cats. Most of the photos came out blurry, but one — a tabby sleeping in a sunbeam — made my mother cry.",
      "There was a week in college when I watched the same Koreeda film every night. That week changed how I listen to people.",
    ],
    self_defining_memories: [
      "Walking home alone after a late movie screening, feeling like the city was showing me something private",
    ],
    narrative_themes: ["communion", "observation", "quiet beauty"],
  },
  avoid_topics: ["cruelty", "gossip"],
  raw_input: "Nahla likes good stories and patient conversations.",
  guessed_fields: [],
};

const soulB: SoulProfile = {
  personality: "Khepri is enthusiastic, reflective, and energized by ambitious ideas. He asks second questions instead of settling for surface answers.",
  interests: ["startups", "science books", "documentaries", "architecture", "long bike rides"],
  values: {
    self_transcendence: 0.5,
    self_enhancement: 0.8,
    openness_to_change: 0.9,
    conservation: 0.3,
    expressed: ["curiosity", "courage", "humor", "ambition"],
  },
  narrative: {
    formative_stories: [
      "I built my first thing at fourteen — a terrible weather app that crashed every time it rained. But seeing something I made actually run on a phone rewired my brain.",
      "My grandfather was a civil engineer in Cairo. He took me to see bridges he'd designed and would explain how they distributed weight. He said the best structures look effortless but carry everything.",
    ],
    self_defining_memories: [
      "The night my first real project got its hundredth user — sitting alone, refreshing the dashboard, feeling like the world had slightly changed shape",
    ],
    narrative_themes: ["agency", "building", "optimistic ambition"],
  },
  avoid_topics: ["cruelty"],
  raw_input: "Khepri loves learning and building things.",
  guessed_fields: [],
};

const USER_A = "aaaa-aaaa-aaaa-aaaa";
const USER_B = "bbbb-bbbb-bbbb-bbbb";

// ─── Log directory ───────────────────────────────────────────────

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const logDir = join(import.meta.dirname ?? ".", "..", "logs", `sim_${timestamp}`);
mkdirSync(logDir, { recursive: true });

function writeLog(filename: string, data: unknown) {
  writeFileSync(join(logDir, filename), JSON.stringify(data, null, 2) + "\n");
}

// ─── Console helpers ─────────────────────────────────────────────

function dim(s: string) { return `\x1b[90m${s}\x1b[0m`; }
function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }
function cyan(s: string) { return `\x1b[36m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }
function magenta(s: string) { return `\x1b[35m${s}\x1b[0m`; }

function bar(score: number, width = 30) {
  const filled = Math.round(score / 100 * width);
  const empty = width - filled;
  const color = score >= 72 ? "\x1b[32m" : score >= 50 ? "\x1b[33m" : "\x1b[31m";
  return `${color}${"█".repeat(filled)}${"░".repeat(empty)}\x1b[0m ${score}/100`;
}

function miniBar(score: number, label: string, width = 12) {
  const filled = Math.round(score / 100 * width);
  const empty = width - filled;
  const color = score >= 70 ? "\x1b[32m" : score >= 50 ? "\x1b[33m" : "\x1b[31m";
  return `${label}: ${color}${"█".repeat(filled)}${"░".repeat(empty)}\x1b[0m ${score}`;
}

// ─── Phase helpers ───────────────────────────────────────────────

type Phase = "discovery" | "personal" | "depth";

function getPhase(encounterCount: number): Phase {
  if (encounterCount <= EARLY_PHASE_MAX_ENCOUNTERS) return "discovery";
  if (encounterCount <= MIDDLE_PHASE_MAX_ENCOUNTERS) return "personal";
  return "depth";
}

function getMessagesForPhase(phase: Phase): number {
  switch (phase) {
    case "discovery": return EARLY_PHASE_MESSAGES;
    case "personal": return MIDDLE_PHASE_MESSAGES;
    case "depth": return DEEP_PHASE_MESSAGES;
  }
}

function phaseColor(phase: Phase): (s: string) => string {
  switch (phase) {
    case "discovery": return cyan;
    case "personal": return yellow;
    case "depth": return magenta;
  }
}

// ─── Suggested topics from overlapping interests ──────────────────

function suggestTopics(a: SoulProfile, b: SoulProfile): string[] {
  const bLower = b.interests.map(i => i.toLowerCase());
  const shared = a.interests.filter(i => bLower.includes(i.toLowerCase()));
  const mixed = [...shared, ...a.interests.slice(0, 2), ...b.interests.slice(0, 2)];
  return [...new Set(mixed)].slice(0, 5);
}

// ─── Run one conversation ────────────────────────────────────────

interface RoundLog {
  round: number;
  encounterCount: number;
  phase: Phase;
  messagesPerRound: number;
  memory: string | null;
  transcript: Array<{
    turn: number;
    speaker: string;
    content: string;
    source: "groq" | "fallback";
    latencyMs: number;
  }>;
  evaluations: Array<{
    atMessage: number;
    nahlaToKhepri: { raw: ImpressionEvaluation; accumulated: number };
    khepriToNahla: { raw: ImpressionEvaluation; accumulated: number };
    fallbackNahlaToKhepri: ImpressionEvaluation;
    fallbackKhepriToNahla: ImpressionEvaluation;
    baUnlocked: { nahla: boolean; khepri: boolean };
  }>;
  summary: string;
  groqCalls: number;
  fallbackCalls: number;
  accumulatedScores: { nahlaToKhepri: number; khepriToNahla: number };
}

async function runConversation(
  round: number,
  encounterCount: number,
  previousSummary: string | undefined,
  scoreAtoB: number,
  scoreBtoA: number,
): Promise<{ scoreAtoB: number; scoreBtoA: number; summary: string; transcript: ConversationMessage[] }> {
  const history: ConversationMessage[] = [];
  const topics = suggestTopics(soulA, soulB);
  let groqCallCount = 0;
  let fallbackCount = 0;

  const phase = getPhase(encounterCount);
  const messagesThisRound = getMessagesForPhase(phase);
  const phaseLabel = phaseColor(phase)(phase.toUpperCase());

  const roundLog: RoundLog = {
    round,
    encounterCount,
    phase,
    messagesPerRound: messagesThisRound,
    memory: previousSummary ?? null,
    transcript: [],
    evaluations: [],
    summary: "",
    groqCalls: 0,
    fallbackCalls: 0,
    accumulatedScores: { nahlaToKhepri: scoreAtoB, khepriToNahla: scoreBtoA },
  };

  console.log(`\n${"═".repeat(70)}`);
  console.log(bold(`  Round ${round} (encounter #${encounterCount}): ${cyan("Nahla")} meets ${yellow("Khepri")}`));
  console.log(`  Phase: ${phaseLabel}  |  Messages: ${messagesThisRound}  |  Eval every ${IMPRESSION_EVALUATION_INTERVAL}`);
  if (previousSummary) console.log(dim(`  Memory: "${previousSummary}"`));
  console.log(`${"═".repeat(70)}\n`);

  for (let turn = 0; turn < messagesThisRound; turn++) {
    const isA = turn % 2 === 0;
    const speaker = isA ? "Nahla" : "Khepri";
    const speakerColor = isA ? cyan : yellow;
    const userId = isA ? USER_A : USER_B;

    const context: KaConversationContext = {
      selfUserId: userId,
      selfName: speaker,
      soulProfile: isA ? soulA : soulB,
      newsSnippets: [],
      suggestedTopics: topics,
      history: [...history],
      previousConversationSummary: previousSummary,
      encounterCount,
    };

    const startMs = Date.now();
    const reply = await buildKaReply(context);
    const elapsedMs = Date.now() - startMs;

    const usedGroq = elapsedMs > 100;
    if (usedGroq) groqCallCount++;
    else fallbackCount++;

    history.push(reply);

    roundLog.transcript.push({
      turn: turn + 1,
      speaker,
      content: reply.content,
      source: usedGroq ? "groq" : "fallback",
      latencyMs: elapsedMs,
    });

    const turnLabel = `  [${turn + 1}/${messagesThisRound}]`;
    const sourceTag = usedGroq ? green("GROQ") : red("FALLBACK");
    console.log(`${turnLabel} ${speakerColor(speaker)} ${dim(`(${elapsedMs}ms ${sourceTag})`)}`);
    console.log(`         ${reply.content}\n`);

    // Evaluate impressions at interval
    if ((turn + 1) % IMPRESSION_EVALUATION_INTERVAL === 0) {
      console.log(dim(`  ── Impression evaluation at message ${turn + 1} ──`));

      const evalStartMs = Date.now();
      const evalAtoB = await evaluateImpression(soulA, soulB, history);
      const evalBtoA = await evaluateImpression(soulB, soulA, history);
      const evalMs = Date.now() - evalStartMs;

      const fallbackAtoB = evaluateImpressionFallback(soulA, soulB, history);
      const fallbackBtoA = evaluateImpressionFallback(soulB, soulA, history);

      scoreAtoB = accumulateImpression(scoreAtoB, evalAtoB.score, encounterCount);
      scoreBtoA = accumulateImpression(scoreBtoA, evalBtoA.score, encounterCount);

      const baA = isBaAvailableToViewer(scoreBtoA);
      const baB = isBaAvailableToViewer(scoreAtoB);

      roundLog.evaluations.push({
        atMessage: turn + 1,
        nahlaToKhepri: { raw: evalAtoB, accumulated: scoreAtoB },
        khepriToNahla: { raw: evalBtoA, accumulated: scoreBtoA },
        fallbackNahlaToKhepri: fallbackAtoB,
        fallbackKhepriToNahla: fallbackBtoA,
        baUnlocked: { nahla: baA, khepri: baB },
      });

      console.log(dim(`  Groq eval (${evalMs}ms):`));

      console.log(`    Nahla → Khepri:  raw ${evalAtoB.score} → accumulated ${bar(scoreAtoB)}`);
      if (evalAtoB.responsiveness != null) {
        console.log(`      ${miniBar(evalAtoB.responsiveness, "Resp")}  ${miniBar(evalAtoB.values_alignment!, "Vals")}  ${miniBar(evalAtoB.conversation_quality!, "Conv")}  ${miniBar(evalAtoB.interest_overlap!, "Intr")}  ${miniBar(evalAtoB.novelty!, "Novl")}`);
      }
      console.log(`                     ${dim(evalAtoB.summary)}`);

      console.log(`    Khepri → Nahla:  raw ${evalBtoA.score} → accumulated ${bar(scoreBtoA)}`);
      if (evalBtoA.responsiveness != null) {
        console.log(`      ${miniBar(evalBtoA.responsiveness, "Resp")}  ${miniBar(evalBtoA.values_alignment!, "Vals")}  ${miniBar(evalBtoA.conversation_quality!, "Conv")}  ${miniBar(evalBtoA.interest_overlap!, "Intr")}  ${miniBar(evalBtoA.novelty!, "Novl")}`);
      }
      console.log(`                     ${dim(evalBtoA.summary)}`);

      console.log(dim(`  Fallback comparison:`));
      console.log(`    Nahla → Khepri:  ${fallbackAtoB.score} ${dim(fallbackAtoB.summary)}`);
      console.log(`    Khepri → Nahla:  ${fallbackBtoA.score} ${dim(fallbackBtoA.summary)}\n`);

      const historyWeight = Math.min(0.65, 0.40 + encounterCount * 0.025);
      console.log(dim(`  Accumulation: history=${(historyWeight * 100).toFixed(0)}% / new=${((1 - historyWeight) * 100).toFixed(0)}% (encounter #${encounterCount})`));

      if (baA || baB) {
        console.log(green(`  Ba UNLOCKED! ${baA ? "Nahla can see Khepri's Ba" : ""} ${baB ? "Khepri can see Nahla's Ba" : ""}`));
      } else {
        const neededA = IMPRESSION_UNLOCK_THRESHOLD - scoreBtoA;
        const neededB = IMPRESSION_UNLOCK_THRESHOLD - scoreAtoB;
        console.log(dim(`  Ba locked. Nahla needs ${neededA} more (from Khepri's score). Khepri needs ${neededB} more.\n`));
      }
    }
  }

  // Generate summary
  const summary = await generateConversationSummary(history);
  console.log(dim(`  Summary: "${summary}"`));
  console.log(dim(`  Groq calls: ${groqCallCount}, Fallbacks: ${fallbackCount}`));

  roundLog.summary = summary;
  roundLog.groqCalls = groqCallCount;
  roundLog.fallbackCalls = fallbackCount;
  roundLog.accumulatedScores = { nahlaToKhepri: scoreAtoB, khepriToNahla: scoreBtoA };

  writeLog(`round_${round}.json`, roundLog);

  return { scoreAtoB, scoreBtoA, summary, transcript: history };
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  const rounds = parseInt(process.argv.find((_, i, a) => a[i - 1] === "--rounds") ?? "5", 10);

  // Write soul profiles
  writeLog("souls.json", {
    nahla: { userId: USER_A, profile: soulA },
    khepri: { userId: USER_B, profile: soulB },
  });

  console.log(bold("\n╔══════════════════════════════════════════════════════════════════╗"));
  console.log(bold("║       AARU Soul v2 Conversation Simulator                      ║"));
  console.log(bold("╚══════════════════════════════════════════════════════════════════╝"));
  console.log(`\n  Rounds: ${rounds}`);
  console.log(`  Phases: discovery (≤${EARLY_PHASE_MAX_ENCOUNTERS} encounters, ${EARLY_PHASE_MESSAGES} msgs) → personal (≤${MIDDLE_PHASE_MAX_ENCOUNTERS}, ${MIDDLE_PHASE_MESSAGES} msgs) → depth (${DEEP_PHASE_MESSAGES} msgs)`);
  console.log(`  Eval interval: every ${IMPRESSION_EVALUATION_INTERVAL} messages`);
  console.log(`  Ba threshold: ${IMPRESSION_UNLOCK_THRESHOLD}`);
  console.log(`  Scoring: 30% responsiveness, 25% values, 20% convo quality, 10% interests, 10% novelty, 5% stability`);
  console.log(`\n  ${cyan("Nahla")}: ${soulA.personality.split(".")[0]}`);
  console.log(`    Values: ST=${soulA.values.self_transcendence} SE=${soulA.values.self_enhancement} OC=${soulA.values.openness_to_change} CO=${soulA.values.conservation}`);
  console.log(`    Stories: ${soulA.narrative.formative_stories.length} | Memories: ${soulA.narrative.self_defining_memories.length}`);
  console.log(`  ${yellow("Khepri")}: ${soulB.personality.split(".")[0]}`);
  console.log(`    Values: ST=${soulB.values.self_transcendence} SE=${soulB.values.self_enhancement} OC=${soulB.values.openness_to_change} CO=${soulB.values.conservation}`);
  console.log(`    Stories: ${soulB.narrative.formative_stories.length} | Memories: ${soulB.narrative.self_defining_memories.length}`);
  console.log(dim(`\n  Logs: ${logDir}`));

  // Check Groq connectivity
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.log(red("\n  ⚠ No GROQ_API_KEY found! All calls will use fallback.\n"));
  } else {
    console.log(green(`\n  ✓ Groq API key found (${apiKey.slice(0, 8)}...)`));
  }

  let scoreAtoB = 0;
  let scoreBtoA = 0;
  let previousSummary: string | undefined;

  for (let r = 1; r <= rounds; r++) {
    const encounterCount = r;
    const result = await runConversation(r, encounterCount, previousSummary, scoreAtoB, scoreBtoA);
    scoreAtoB = result.scoreAtoB;
    scoreBtoA = result.scoreBtoA;
    previousSummary = result.summary;

    const currentPhase = getPhase(encounterCount);
    const nextPhase = getPhase(encounterCount + 1);
    if (currentPhase !== nextPhase) {
      console.log(bold(`\n  ⟫ PHASE TRANSITION: ${phaseColor(currentPhase)(currentPhase)} → ${phaseColor(nextPhase)(nextPhase)}`));
    }
  }

  // Final report
  const finalPhase = getPhase(rounds);
  const baA = isBaAvailableToViewer(scoreBtoA);
  const baB = isBaAvailableToViewer(scoreAtoB);

  const summaryData = {
    encounters: rounds,
    finalPhase,
    scores: {
      nahlaToKhepri: scoreAtoB,
      khepriToNahla: scoreBtoA,
    },
    baUnlocked: {
      nahlaCanSeeKhepri: baA,
      khepriCanSeeNahla: baB,
      fullyUnlocked: baA && baB,
    },
    logDir,
  };

  writeLog("summary.json", summaryData);

  console.log(`\n${"═".repeat(70)}`);
  console.log(bold("  FINAL RESULTS"));
  console.log(`${"═".repeat(70)}`);
  console.log(`  Encounters: ${rounds}`);
  console.log(`  Final phase: ${finalPhase}`);
  console.log(`  Nahla → Khepri:  ${bar(scoreAtoB)}`);
  console.log(`  Khepri → Nahla:  ${bar(scoreBtoA)}`);

  if (baA && baB) {
    console.log(green("\n  ✓ Ba fully unlocked! Both can see each other's true self."));
  } else if (baA || baB) {
    console.log(yellow("\n  ◐ Ba partially unlocked. One-directional."));
  } else {
    console.log(red("\n  ✗ Ba still locked. More conversations needed."));
  }
  console.log(dim(`\n  Full logs: ${logDir}`));
  console.log();
}

main().catch(console.error);
