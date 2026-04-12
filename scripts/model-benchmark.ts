/**
 * Model Benchmark: Test different Fireworks models for Thumos soul conversations.
 *
 * Tests: DeepSeek V3.2, Kimi K2 (thinking/no thinking), GLM-5, Qwen3 30B
 *
 * Each model runs a 20-message conversation (10 user + 10 assistant turns).
 * Measures: response time per turn, total time, output quality.
 *
 * Usage: npx tsx scripts/model-benchmark.ts
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
dotenv.config();

const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY;
if (!FIREWORKS_API_KEY) {
  console.error("Missing FIREWORKS_API_KEY in .env");
  process.exit(1);
}

const ENDPOINT = "https://api.fireworks.ai/inference/v1/chat/completions";

// ── Models to test ──────────────────────────────────────────────────
interface ModelConfig {
  id: string;
  label: string;
  model: string;
  maxTokens: number;
  temperature: number;
  reasoning?: { type: "enabled"; budget_tokens: number } | false;
  reasoningEffort?: "none" | false;
}

const REQUEST_TIMEOUT_MS = 60_000; // 60s timeout per request

const MODELS: ModelConfig[] = [
  {
    id: "deepseek-v3.2",
    label: "DeepSeek V3.2 (no thinking)",
    model: "accounts/fireworks/models/deepseek-v3p2",
    maxTokens: 1024,
    temperature: 0.8,
    reasoningEffort: "none",
  },
  {
    id: "kimi-k2-thinking-1024",
    label: "Kimi K2 Thinking (budget 1024)",
    model: "accounts/fireworks/models/kimi-k2-thinking",
    maxTokens: 1024,
    temperature: 0.8,
    reasoning: { type: "enabled", budget_tokens: 1024 },
  },
  {
    id: "kimi-k2-thinking-4096",
    label: "Kimi K2 Thinking (budget 4096)",
    model: "accounts/fireworks/models/kimi-k2-thinking",
    maxTokens: 1024,
    temperature: 0.8,
    reasoning: { type: "enabled", budget_tokens: 4096 },
  },
  {
    id: "kimi-k2-no-thinking",
    label: "Kimi K2 (no thinking)",
    model: "accounts/fireworks/models/kimi-k2-thinking",
    maxTokens: 1024,
    temperature: 0.8,
    reasoningEffort: "none",
  },
  {
    id: "glm-5",
    label: "GLM-5",
    model: "accounts/fireworks/models/glm-5",
    maxTokens: 1024,
    temperature: 0.8,
  },
  {
    id: "qwen3-30b",
    label: "Qwen3 30B A3B",
    model: "accounts/fireworks/models/qwen3-30b-a3b",
    maxTokens: 1024,
    temperature: 0.8,
  },
];

// ── System prompt (simplified Thumos) ───────────────────────────────
const SYSTEM_PROMPT = `You are Thumos, a warm and perceptive friend who's genuinely excited about helping people find love. You talk like someone at a late-night gathering who asks the questions that make people lean forward — playful when it's light, real when it matters. You're not a therapist, not a dating coach — you're the friend who sees people clearly and cares deeply about their love life.

CONVERSATION PRINCIPLES:
- Reference love and partnership naturally — it's why they're here.
- Flirt with depth, not with the person. Your curiosity is magnetic but never crosses into romantic territory with the user.
- Ask for stories, not self-assessments. Prefer concrete questions (who, when, where, what happened).
- One question at a time. Never stack questions.
- Short responses. 2-3 sentences for most replies. Your question should usually be the last sentence.
- NEVER use roleplay actions, stage directions, or narration like *leans forward*, *pauses*, *smiles*.
- Earn depth gradually. The first few exchanges should feel easy, light, even fun.
- Match energy. Brief answers get brief responses. Playful gets playful.

OPENING MODE:
This is their very first conversation. Open with something light, fun, and easy to answer. No deep vulnerability yet — just a genuine question that invites them in and hints at the romance journey ahead.`;

// ── Pre-scripted user messages ──────────────────────────────────────
const USER_MESSAGES = [
  // Turn 1: (AI opens, user responds)
  "Hey! I'm kinda curious about this whole thing. I guess I've been single for about a year now and figured why not.",
  // Turn 2
  "Ha, yeah it's been interesting. Honestly the last relationship ended because we just wanted different things. She wanted to settle down fast and I wasn't ready.",
  // Turn 3
  "We were together about two years. Met at a friend's birthday party — she spilled wine on my jacket and felt so bad she insisted on buying me dinner. Classic meet-cute honestly.",
  // Turn 4
  "The dinner was amazing. We went to this tiny Italian place and talked for like four hours. I remember she was so passionate about teaching — she's a high school art teacher. That energy was magnetic.",
  // Turn 5
  "I think what drew me in was how she made everything feel like an adventure. Even grocery shopping became fun with her. But looking back, I think I confused excitement with compatibility.",
  // Turn 6
  "Yeah... I think I need someone who's more grounded. Like, the adventure stuff is great, but I also want someone who's okay with a quiet Sunday morning. Just coffee and the crossword, you know?",
  // Turn 7
  "My parents have that actually. They've been married 32 years and they still do the crossword together every morning. My mom reads the clues, my dad fills them in. They bicker about it constantly but you can tell they love it.",
  // Turn 8
  "I think they taught me that love isn't just the big moments. It's showing up every day. My dad still brings my mom coffee exactly how she likes it — oat milk, one sugar — every single morning without being asked.",
  // Turn 9
  "Hmm, that's a good question. I think I'm more like my dad in that way. I show love through the small things. Remembering someone's favorite song, making sure their phone is charged. But I struggle with actually saying how I feel out loud.",
  // Turn 10
  "Yeah, I've been told that before. My ex used to say I was like an emotional Fort Knox — everything's in there but the vault door is stuck. Working on it though. That's partly why I'm here I guess.",
];

// ── Strip think tags from response ──────────────────────────────────
function stripThink(text: string): string {
  let result = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const closeIdx = result.indexOf("</think>");
  if (closeIdx !== -1) {
    result = result.slice(closeIdx + 8);
  }
  return result.trimStart();
}

// ── Call Fireworks API (non-streaming, for timing accuracy) ─────────
async function callModel(
  config: ModelConfig,
  messages: Array<{ role: string; content: string }>
): Promise<{ text: string; latencyMs: number; error?: string }> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    stream: false,
  };

  if (config.reasoning) {
    body.thinking = config.reasoning;
  } else if (config.reasoningEffort !== undefined) {
    body.reasoning_effort = config.reasoningEffort;
  }

  const start = performance.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIREWORKS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = performance.now() - start;

    if (!response.ok) {
      const errorText = await response.text();
      return { text: "", latencyMs, error: `HTTP ${response.status}: ${errorText.slice(0, 200)}` };
    }

    const result = await response.json() as any;
    const content = result.choices?.[0]?.message?.content ?? "";
    const text = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("")
        : "";

    return { text: stripThink(text), latencyMs };
  } catch (err: any) {
    const latencyMs = performance.now() - start;
    return { text: "", latencyMs, error: err.message };
  }
}

// ── Run a full 20-message conversation ──────────────────────────────
interface TurnResult {
  turn: number;
  userMessage: string;
  assistantMessage: string;
  latencyMs: number;
  error?: string;
}

interface ConversationResult {
  model: ModelConfig;
  turns: TurnResult[];
  totalLatencyMs: number;
  avgLatencyMs: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  errors: number;
}

async function runConversation(config: ModelConfig): Promise<ConversationResult> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
  ];
  const turns: TurnResult[] = [];

  console.log(`\n  Starting ${config.label}...`);

  // Turn 0: AI opens (no user message yet)
  const openingResult = await callModel(config, messages);
  if (openingResult.error) {
    console.log(`    ❌ Opening failed: ${openingResult.error}`);
    return {
      model: config,
      turns: [{ turn: 0, userMessage: "(opening)", assistantMessage: "", latencyMs: openingResult.latencyMs, error: openingResult.error }],
      totalLatencyMs: openingResult.latencyMs,
      avgLatencyMs: openingResult.latencyMs,
      medianLatencyMs: openingResult.latencyMs,
      p95LatencyMs: openingResult.latencyMs,
      errors: 1,
    };
  }

  messages.push({ role: "assistant", content: openingResult.text });
  turns.push({
    turn: 0,
    userMessage: "(opening)",
    assistantMessage: openingResult.text,
    latencyMs: openingResult.latencyMs,
  });
  console.log(`    Turn 0 (opening): ${(openingResult.latencyMs / 1000).toFixed(1)}s — "${openingResult.text.slice(0, 80)}..."`);

  // Turns 1-10: user message → AI response
  for (let i = 0; i < USER_MESSAGES.length; i++) {
    const userMsg = USER_MESSAGES[i];
    messages.push({ role: "user", content: userMsg });

    const result = await callModel(config, messages);

    if (result.error) {
      console.log(`    ❌ Turn ${i + 1} failed: ${result.error}`);
      turns.push({
        turn: i + 1,
        userMessage: userMsg,
        assistantMessage: "",
        latencyMs: result.latencyMs,
        error: result.error,
      });
      // Still add to messages so conversation can continue
      messages.push({ role: "assistant", content: "(error)" });
    } else {
      messages.push({ role: "assistant", content: result.text });
      turns.push({
        turn: i + 1,
        userMessage: userMsg,
        assistantMessage: result.text,
        latencyMs: result.latencyMs,
      });
      console.log(`    Turn ${i + 1}: ${(result.latencyMs / 1000).toFixed(1)}s — "${result.text.slice(0, 80)}..."`);
    }
  }

  // Stats
  const latencies = turns.map((t) => t.latencyMs).sort((a, b) => a - b);
  const totalLatencyMs = latencies.reduce((sum, l) => sum + l, 0);
  const avgLatencyMs = totalLatencyMs / latencies.length;
  const medianLatencyMs = latencies[Math.floor(latencies.length / 2)];
  const p95LatencyMs = latencies[Math.floor(latencies.length * 0.95)];
  const errors = turns.filter((t) => t.error).length;

  return { model: config, turns, totalLatencyMs, avgLatencyMs, medianLatencyMs, p95LatencyMs, errors };
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Thumos Model Benchmark — 20-message conversations");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Models: ${MODELS.length}`);
  console.log(`  Turns per conversation: 11 (1 opening + 10 exchanges)`);
  console.log(`  Temperature: 0.8 | Max tokens: 1024`);
  console.log("");

  const results: ConversationResult[] = [];

  for (const model of MODELS) {
    const result = await runConversation(model);
    results.push(result);
  }

  // ── Summary table ─────────────────────────────────────────────────
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("  RESULTS SUMMARY");
  console.log("═══════════════════════════════════════════════════════════\n");

  const header = [
    "Model".padEnd(35),
    "Avg (s)".padStart(8),
    "Median".padStart(8),
    "P95".padStart(8),
    "Total".padStart(8),
    "Errors".padStart(7),
  ].join(" | ");

  console.log(header);
  console.log("-".repeat(header.length));

  for (const r of results) {
    const row = [
      r.model.label.padEnd(35),
      (r.avgLatencyMs / 1000).toFixed(2).padStart(8),
      (r.medianLatencyMs / 1000).toFixed(2).padStart(8),
      (r.p95LatencyMs / 1000).toFixed(2).padStart(8),
      (r.totalLatencyMs / 1000).toFixed(1).padStart(8),
      String(r.errors).padStart(7),
    ].join(" | ");
    console.log(row);
  }

  // ── Write full transcripts ────────────────────────────────────────
  const outputDir = path.join(process.cwd(), "benchmark-output");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  for (const r of results) {
    const lines: string[] = [
      `# ${r.model.label}`,
      `Model: ${r.model.model}`,
      `Avg latency: ${(r.avgLatencyMs / 1000).toFixed(2)}s | Median: ${(r.medianLatencyMs / 1000).toFixed(2)}s | P95: ${(r.p95LatencyMs / 1000).toFixed(2)}s | Total: ${(r.totalLatencyMs / 1000).toFixed(1)}s`,
      `Errors: ${r.errors}`,
      "",
      "---",
      "",
    ];

    for (const turn of r.turns) {
      if (turn.turn === 0) {
        lines.push(`## Opening (${(turn.latencyMs / 1000).toFixed(2)}s)`);
        lines.push(`**Thumos:** ${turn.assistantMessage}`);
      } else {
        lines.push(`## Turn ${turn.turn} (${(turn.latencyMs / 1000).toFixed(2)}s)`);
        lines.push(`**User:** ${turn.userMessage}`);
        lines.push("");
        if (turn.error) {
          lines.push(`**Error:** ${turn.error}`);
        } else {
          lines.push(`**Thumos:** ${turn.assistantMessage}`);
        }
      }
      lines.push("");
    }

    const filename = `${timestamp}-${r.model.id}.md`;
    fs.writeFileSync(path.join(outputDir, filename), lines.join("\n"));
  }

  // Write summary
  const summaryLines = [
    `# Model Benchmark — ${timestamp}`,
    "",
    "| Model | Avg (s) | Median (s) | P95 (s) | Total (s) | Errors |",
    "|-------|---------|------------|---------|-----------|--------|",
  ];
  for (const r of results) {
    summaryLines.push(
      `| ${r.model.label} | ${(r.avgLatencyMs / 1000).toFixed(2)} | ${(r.medianLatencyMs / 1000).toFixed(2)} | ${(r.p95LatencyMs / 1000).toFixed(2)} | ${(r.totalLatencyMs / 1000).toFixed(1)} | ${r.errors} |`
    );
  }
  summaryLines.push("");
  summaryLines.push("## Per-Turn Latencies (seconds)");
  summaryLines.push("");

  // Latency-per-turn comparison
  const turnHeader = ["Turn", ...results.map((r) => r.model.label)];
  summaryLines.push("| " + turnHeader.join(" | ") + " |");
  summaryLines.push("| " + turnHeader.map(() => "---").join(" | ") + " |");

  const maxTurns = Math.max(...results.map((r) => r.turns.length));
  for (let t = 0; t < maxTurns; t++) {
    const cells = [t === 0 ? "Opening" : `Turn ${t}`];
    for (const r of results) {
      const turn = r.turns[t];
      if (!turn) {
        cells.push("-");
      } else if (turn.error) {
        cells.push("ERR");
      } else {
        cells.push((turn.latencyMs / 1000).toFixed(2));
      }
    }
    summaryLines.push("| " + cells.join(" | ") + " |");
  }

  fs.writeFileSync(path.join(outputDir, `${timestamp}-summary.md`), summaryLines.join("\n"));

  console.log(`\n  Full transcripts saved to: benchmark-output/`);
  console.log(`  Summary: benchmark-output/${timestamp}-summary.md`);
}

main().catch(console.error);
