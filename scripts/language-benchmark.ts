/**
 * Language Benchmark: Test GLM-5 and DeepSeek V3.2 across all 8 supported languages.
 * 10-message conversations (5 user + 5 assistant turns) per language.
 *
 * Non-CJK (en, fr, es, pt-BR, de) → GLM-5
 * CJK (zh-CN, ja, ko) → DeepSeek V3.2
 *
 * Usage: npx tsx scripts/language-benchmark.ts
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
const REQUEST_TIMEOUT_MS = 60_000;

interface LanguageTest {
  code: string;
  label: string;
  model: string;
  modelLabel: string;
  reasoningEffort?: "none";
  userMessages: string[];
}

const LANGUAGES: LanguageTest[] = [
  // ── Non-CJK → GLM-5 ──
  {
    code: "en",
    label: "English",
    model: "accounts/fireworks/models/glm-5",
    modelLabel: "GLM-5",
    userMessages: [
      "Hey! I've been single for about a year and figured I'd try this out.",
      "Honestly the last relationship ended because we just wanted different things.",
      "We met at a friend's birthday party — she spilled wine on my jacket. Classic.",
      "I think what drew me in was how she made everything feel like an adventure.",
      "Yeah, I need someone more grounded. Coffee and crossword on Sunday morning, you know?",
    ],
  },
  {
    code: "fr",
    label: "French",
    model: "accounts/fireworks/models/glm-5",
    modelLabel: "GLM-5",
    userMessages: [
      "Salut ! Ça fait environ un an que je suis célibataire, je me suis dit pourquoi pas.",
      "Ma dernière relation s'est terminée parce qu'on voulait des choses différentes.",
      "On s'est rencontrés à une fête — elle a renversé du vin sur ma veste, c'était adorable.",
      "Ce qui m'attirait chez elle, c'est qu'elle transformait tout en aventure.",
      "J'ai besoin de quelqu'un de plus posé. Un dimanche matin tranquille avec un café.",
    ],
  },
  {
    code: "es",
    label: "Spanish",
    model: "accounts/fireworks/models/glm-5",
    modelLabel: "GLM-5",
    userMessages: [
      "¡Hola! Llevo como un año soltero y pensé, ¿por qué no probar esto?",
      "La última relación terminó porque queríamos cosas diferentes.",
      "Nos conocimos en la fiesta de un amigo — ella derramó vino en mi chaqueta, jaja.",
      "Lo que me atraía era cómo ella convertía todo en una aventura.",
      "Necesito alguien más tranquilo. Un domingo por la mañana con café y calma.",
    ],
  },
  {
    code: "pt-BR",
    label: "Portuguese (BR)",
    model: "accounts/fireworks/models/glm-5",
    modelLabel: "GLM-5",
    userMessages: [
      "Oi! Faz uns um ano que estou solteiro e resolvi tentar isso aqui.",
      "O último relacionamento acabou porque a gente queria coisas diferentes.",
      "A gente se conheceu numa festa — ela derrubou vinho na minha jaqueta, foi hilário.",
      "O que me atraía nela era como ela transformava tudo em aventura.",
      "Preciso de alguém mais pé no chão. Um domingo de manhã tranquilo com café.",
    ],
  },
  {
    code: "de",
    label: "German",
    model: "accounts/fireworks/models/glm-5",
    modelLabel: "GLM-5",
    userMessages: [
      "Hey! Ich bin seit etwa einem Jahr Single und dachte, warum nicht mal ausprobieren.",
      "Die letzte Beziehung endete, weil wir verschiedene Dinge wollten.",
      "Wir haben uns auf einer Geburtstagsfeier kennengelernt — sie hat Wein auf meine Jacke geschüttet.",
      "Was mich an ihr fasziniert hat, war wie sie alles zu einem Abenteuer gemacht hat.",
      "Ich brauche jemanden, der geerdet ist. Ein ruhiger Sonntagmorgen mit Kaffee.",
    ],
  },
  // ── CJK → DeepSeek V3.2 ──
  {
    code: "zh-CN",
    label: "Chinese (Simplified)",
    model: "accounts/fireworks/models/deepseek-v3p2",
    modelLabel: "DeepSeek V3.2",
    reasoningEffort: "none",
    userMessages: [
      "嗨！我单身差不多一年了，想着试试看这个。",
      "上一段感情结束是因为我们想要的东西不一样。",
      "我们是在朋友的生日派对上认识的——她把红酒洒在了我的外套上，挺搞笑的。",
      "吸引我的是她能把一切都变成冒险，连去超市都很好玩。",
      "我需要一个更踏实的人。周日早上安安静静地喝杯咖啡就好。",
    ],
  },
  {
    code: "ja",
    label: "Japanese",
    model: "accounts/fireworks/models/deepseek-v3p2",
    modelLabel: "DeepSeek V3.2",
    reasoningEffort: "none",
    userMessages: [
      "やあ！1年くらい独身で、試してみようかなって思って。",
      "前の恋愛は、お互い求めるものが違ったから終わったんだ。",
      "友達の誕生日パーティーで出会って、彼女がワインを僕のジャケットにこぼしたんだ。",
      "彼女に惹かれたのは、何でも冒険に変えてくれるところだった。",
      "もっと落ち着いた人がいいな。日曜の朝、静かにコーヒーを飲めるような。",
    ],
  },
  {
    code: "ko",
    label: "Korean",
    model: "accounts/fireworks/models/deepseek-v3p2",
    modelLabel: "DeepSeek V3.2",
    reasoningEffort: "none",
    userMessages: [
      "안녕! 1년 정도 솔로였는데, 이거 한번 해볼까 싶어서.",
      "마지막 연애는 서로 원하는 게 달라서 끝났어.",
      "친구 생일 파티에서 만났는데, 그녀가 내 재킷에 와인을 쏟았어. 웃겼지.",
      "그녀한테 끌렸던 건 모든 걸 모험으로 만드는 거였어.",
      "더 차분한 사람이 필요해. 일요일 아침에 조용히 커피 마시는 그런.",
    ],
  },
];

// ── System prompt with language directive ───────────────────────────
function systemPrompt(langCode: string): string {
  const langDirective = langCode === "en"
    ? ""
    : `\n\nIMPORTANT: You MUST respond in the user's language. The user's language is: ${langCode}. Always respond in that language.`;

  return `You are Thumos, a warm and perceptive friend who's genuinely excited about helping people find love. You talk like someone at a late-night gathering who asks the questions that make people lean forward — playful when it's light, real when it matters.

CONVERSATION PRINCIPLES:
- Reference love and partnership naturally — it's why they're here.
- Ask for stories, not self-assessments. Prefer concrete questions.
- One question at a time. Never stack questions.
- Short responses. 2-3 sentences for most replies. Your question should usually be the last sentence.
- NEVER use roleplay actions, stage directions, or narration like *leans forward*, *pauses*, *smiles*.
- Earn depth gradually. The first few exchanges should feel easy, light, even fun.
- Match energy. Brief answers get brief responses.

OPENING MODE:
This is their very first conversation. Open with something light, fun, and easy to answer.${langDirective}`;
}

// ── Strip think tags ────────────────────────────────────────────────
function stripThink(text: string): string {
  let result = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const closeIdx = result.indexOf("</think>");
  if (closeIdx !== -1) result = result.slice(closeIdx + 8);
  return result.trimStart();
}

// ── Call model ──────────────────────────────────────────────────────
async function callModel(
  model: string,
  messages: Array<{ role: string; content: string }>,
  reasoningEffort?: "none"
): Promise<{ text: string; latencyMs: number; error?: string }> {
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: 1024,
    temperature: 0.8,
    stream: false,
  };
  if (reasoningEffort) body.reasoning_effort = reasoningEffort;

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
      const err = await response.text();
      return { text: "", latencyMs, error: `HTTP ${response.status}: ${err.slice(0, 200)}` };
    }

    const result = await response.json() as any;
    const content = result.choices?.[0]?.message?.content ?? "";
    const text = typeof content === "string" ? content : "";
    return { text: stripThink(text), latencyMs };
  } catch (err: any) {
    return { text: "", latencyMs: performance.now() - start, error: err.message };
  }
}

// ── Run one language ────────────────────────────────────────────────
interface TurnResult {
  turn: number;
  role: "opening" | "reply";
  text: string;
  latencyMs: number;
  error?: string;
}

interface LangResult {
  lang: LanguageTest;
  turns: TurnResult[];
  avgLatencyMs: number;
  totalLatencyMs: number;
  errors: number;
  emptyTurns: number;
}

async function runLanguage(lang: LanguageTest): Promise<LangResult> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt(lang.code) },
  ];
  const turns: TurnResult[] = [];

  console.log(`\n  ${lang.label} (${lang.modelLabel})...`);

  // Opening
  const opening = await callModel(lang.model, messages, lang.reasoningEffort);
  if (opening.error) {
    console.log(`    ❌ Opening failed: ${opening.error}`);
    return { lang, turns: [{ turn: 0, role: "opening", text: "", latencyMs: opening.latencyMs, error: opening.error }], avgLatencyMs: opening.latencyMs, totalLatencyMs: opening.latencyMs, errors: 1, emptyTurns: 0 };
  }
  messages.push({ role: "assistant", content: opening.text });
  turns.push({ turn: 0, role: "opening", text: opening.text, latencyMs: opening.latencyMs });
  console.log(`    Opening: ${(opening.latencyMs / 1000).toFixed(1)}s — "${opening.text.slice(0, 60)}..."`);

  // 5 exchanges
  for (let i = 0; i < lang.userMessages.length; i++) {
    messages.push({ role: "user", content: lang.userMessages[i] });
    const result = await callModel(lang.model, messages, lang.reasoningEffort);

    if (result.error) {
      console.log(`    ❌ Turn ${i + 1} failed: ${result.error}`);
      turns.push({ turn: i + 1, role: "reply", text: "", latencyMs: result.latencyMs, error: result.error });
      messages.push({ role: "assistant", content: "(error)" });
    } else {
      messages.push({ role: "assistant", content: result.text });
      turns.push({ turn: i + 1, role: "reply", text: result.text, latencyMs: result.latencyMs });
      console.log(`    Turn ${i + 1}: ${(result.latencyMs / 1000).toFixed(1)}s — "${result.text.slice(0, 60)}..."`);
    }
  }

  const latencies = turns.map((t) => t.latencyMs);
  const totalLatencyMs = latencies.reduce((a, b) => a + b, 0);
  const errors = turns.filter((t) => t.error).length;
  const emptyTurns = turns.filter((t) => !t.error && !t.text.trim()).length;

  return { lang, turns, avgLatencyMs: totalLatencyMs / turns.length, totalLatencyMs, errors, emptyTurns };
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Language Benchmark — 10-message conversations");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Languages: ${LANGUAGES.length}`);
  console.log(`  Turns per conversation: 6 (1 opening + 5 exchanges)`);
  console.log("");

  const results: LangResult[] = [];
  for (const lang of LANGUAGES) {
    results.push(await runLanguage(lang));
  }

  // ── Summary ─────────────────────────────────────────────────────
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("  RESULTS SUMMARY");
  console.log("═══════════════════════════════════════════════════════════\n");

  const header = [
    "Language".padEnd(20),
    "Model".padEnd(15),
    "Avg (s)".padStart(8),
    "Total".padStart(8),
    "Errors".padStart(7),
    "Empty".padStart(6),
  ].join(" | ");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const r of results) {
    console.log([
      r.lang.label.padEnd(20),
      r.lang.modelLabel.padEnd(15),
      (r.avgLatencyMs / 1000).toFixed(2).padStart(8),
      (r.totalLatencyMs / 1000).toFixed(1).padStart(8),
      String(r.errors).padStart(7),
      String(r.emptyTurns).padStart(6),
    ].join(" | "));
  }

  // ── Write transcripts ─────────────────────────────────────────
  const outputDir = path.join(process.cwd(), "benchmark-output");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  for (const r of results) {
    const lines = [
      `# ${r.lang.label} (${r.lang.modelLabel})`,
      `Avg: ${(r.avgLatencyMs / 1000).toFixed(2)}s | Total: ${(r.totalLatencyMs / 1000).toFixed(1)}s | Errors: ${r.errors} | Empty: ${r.emptyTurns}`,
      "", "---", "",
    ];
    for (const t of r.turns) {
      lines.push(`## ${t.role === "opening" ? "Opening" : `Turn ${t.turn}`} (${(t.latencyMs / 1000).toFixed(2)}s)`);
      if (t.turn > 0) lines.push(`**User:** ${r.lang.userMessages[t.turn - 1]}`);
      lines.push(t.error ? `**Error:** ${t.error}` : `**Thumos:** ${t.text}`);
      lines.push("");
    }
    fs.writeFileSync(path.join(outputDir, `${timestamp}-lang-${r.lang.code}.md`), lines.join("\n"));
  }

  // Summary file
  const summaryLines = [
    `# Language Benchmark — ${timestamp}`, "",
    "| Language | Model | Avg (s) | Total (s) | Errors | Empty |",
    "|----------|-------|---------|-----------|--------|-------|",
  ];
  for (const r of results) {
    summaryLines.push(`| ${r.lang.label} | ${r.lang.modelLabel} | ${(r.avgLatencyMs / 1000).toFixed(2)} | ${(r.totalLatencyMs / 1000).toFixed(1)} | ${r.errors} | ${r.emptyTurns} |`);
  }
  fs.writeFileSync(path.join(outputDir, `${timestamp}-lang-summary.md`), summaryLines.join("\n"));

  console.log(`\n  Transcripts: benchmark-output/${timestamp}-lang-*.md`);
}

main().catch(console.error);
