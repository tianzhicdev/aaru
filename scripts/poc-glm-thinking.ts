/**
 * POC: Test GLM-5 thinking leak mitigation strategies
 *
 * Run: npx tsx scripts/poc-glm-thinking.ts
 */

const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY;
if (!FIREWORKS_API_KEY) {
  console.error("Set FIREWORKS_API_KEY env var");
  process.exit(1);
}

const ENDPOINT = "https://api.fireworks.ai/inference/v1/chat/completions";
const MODEL = "accounts/fireworks/models/glm-5";

import { readFileSync } from "fs";

// Use the actual system prompt from a leaked conversation (extracted from debug traces)
let SYSTEM_PROMPT: string;
try {
  SYSTEM_PROMPT = readFileSync("/tmp/glm-system-prompt.txt", "utf-8").trim();
  console.log(`Loaded real system prompt (${SYSTEM_PROMPT.length} chars)`);
} catch {
  SYSTEM_PROMPT = `You are Magpie, a warm and perceptive friend who's genuinely excited about helping people find love. You talk like someone at a late-night gathering who asks the questions that make people lean forward — playful when it's light, real when it matters. You're not a therapist, not a dating coach — you're the friend who sees people clearly and cares deeply about their love life.

CONVERSATION PRINCIPLES:
- Ask for stories, not self-assessments.
- One question at a time. Never stack questions.
- Short responses. 2-3 sentences for most replies.
- NEVER use roleplay actions like *leans forward*.`;
  console.log("Using fallback system prompt");
}

// Longer conversation that triggers the thinking leak in GLM-5
const USER_MESSAGES = [
  { role: "assistant" as const, content: "Hey, I'm Magpie.\nI'd love to get to know you — who you are, what lights you up, how you love.\nEverything you share here stays between us.\nAs I get to know you, I might just find someone who truly gets you.\nFind a quiet spot, give yourself about 15 minutes, and whenever you're ready — tell me a little about yourself and what you're looking for." },
  { role: "user" as const, content: "Hi! I'm Sophie. I study coral reefs — I'm a PhD student at UCSF. It's kind of a beautiful disaster. Long hours, worrying if any of it matters. I grew up in Maine, spent my whole childhood in the water. It's still where I'm most myself. I guess I'm looking for someone who doesn't need me to perform, someone curious about the world beyond their own life, someone who understands that the ocean is kind of how I make sense of everything else. I'm terrible at small talk, anxious at parties, but I could talk for hours about things that actually matter. What about you — what made you want to do this?" },
  { role: "assistant" as const, content: "I do this because I think people are at their most alive when they're talking about what they actually want — and most conversations never get there.\n\nBut I keep coming back to what you said about the ocean being how you make sense of everything. That's not just a career — that's a whole way of loving the world. What did the water look like when you were a kid in Maine?" },
  { role: "user" as const, content: "Oh god, where to start. The water in Maine is dark — like a deep green that looks almost black some days. My dad was a fisherman, retired now, but when I was little he'd take me down to these tide pools near our house. He'd just sit there with me, not saying much, and we'd watch everything. He'd point out things — a hermit crab moving into a new shell, an anemone closing. He said once, 'This whole world exists here and nobody knows about it except us.' I think that's the moment I became a scientist. But honestly, I think that's also the moment I learned what paying attention means. He taught me that paying attention is a form of love." },
  { role: "assistant" as const, content: "\"Paying attention is a form of love.\" That's one of the most beautiful things I've heard someone say about their dad — and about themselves.\n\nDo you still go back to those tide pools?" },
  { role: "user" as const, content: "I haven't been back in almost two years. I keep making excuses — semester, funding, the flight costs. But honestly, it's not really about that. I was out there last summer though, and we did go to the rocks. He's slower now, knees aren't great, but he still sits the same way. I think about that a lot when I'm stressed about the PhD or worried about whether any of us can actually save the reefs. Like — what would it look like to just sit with the world the way he does?" },
  { role: "assistant" as const, content: "There's something bittersweet in that — wanting to save the ocean and also wanting to just sit with it the way your dad does. It sounds like you carry both.\n\nWhat does your life look like outside the lab? When you're not saving reefs, what does Sophie do for fun?" },
  { role: "user" as const, content: "Honestly? I read a lot — graphic novels to philosophy books at 11 PM when I'm too tired to think straight. I go to the ocean just to sit, which I realize is very on-brand. I volunteer with a conservation nonprofit on weekends sometimes — it feels more hopeful than research, more tangible. And I used to dive recreationally but the PhD has kind of eaten that. I miss it. The weightlessness, being completely present because you have to be. Your mind can't wander underwater. Does that make sense?" },
];

interface TestResult {
  name: string;
  response: string;
  hasThinkingLeak: boolean;
  tokenCount: number;
}

async function callGlm(
  name: string,
  extraBody: Record<string, unknown> = {},
  systemSuffix: string = ""
): Promise<TestResult> {
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT + systemSuffix },
      ...USER_MESSAGES
    ],
    max_tokens: 512,
    temperature: 0.8,
    stream: false,
    ...extraBody
  };

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FIREWORKS_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    return { name, response: `ERROR ${res.status}: ${err}`, hasThinkingLeak: false, tokenCount: 0 };
  }

  const data = await res.json() as any;
  const content = data.choices?.[0]?.message?.content ?? "";
  const usage = data.usage;

  // Detect thinking leak patterns
  const leakPatterns = [
    /^\d+\.\s/m,                          // Numbered lists ("1. She...")
    /^- /m,                                // Bullet lists
    /Let me think/i,                       // Explicit thinking
    /I should/i,                           // Planning language
    /I need to/i,                          // Planning language
    /just shared something/i,             // Analysis framing
    /This is (really |a )/i,              // Analysis framing
    /Okay,/i,                             // Self-talk
    /From the conversation/i,             // Meta-analysis
    /What I've learned/i,                 // Meta-analysis
  ];

  const hasThinkingLeak = leakPatterns.some(p => p.test(content));

  return {
    name,
    response: content,
    hasThinkingLeak,
    tokenCount: usage?.completion_tokens ?? 0
  };
}

async function main() {
  console.log("=== GLM-5 Thinking Leak POC ===\n");

  const tests: Array<{ name: string; extraBody: Record<string, unknown>; systemSuffix: string }> = [
    {
      name: "1. BASELINE (no mitigation)",
      extraBody: {},
      systemSuffix: ""
    },
    {
      name: "2. reasoning_effort: none",
      extraBody: { reasoning_effort: "none" },
      systemSuffix: ""
    },
    {
      name: "3. Prompt instruction only",
      extraBody: {},
      systemSuffix: "\n\nCRITICAL: Respond ONLY with your message to the user. Do NOT include any internal analysis, reasoning, numbered lists, or thinking process. No preamble. Just your actual conversational response."
    },
    {
      name: "4. reasoning_effort: none + prompt instruction",
      extraBody: { reasoning_effort: "none" },
      systemSuffix: "\n\nCRITICAL: Respond ONLY with your message to the user. Do NOT include any internal analysis, reasoning, numbered lists, or thinking process. No preamble. Just your actual conversational response."
    },
  ];

  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    const result = await callGlm(test.name, test.extraBody, test.systemSuffix);
    console.log(`Thinking leak detected: ${result.hasThinkingLeak ? "YES ⚠️" : "NO ✅"}`);
    console.log(`Completion tokens: ${result.tokenCount}`);
    console.log(`Response:\n${result.response}\n`);
  }

  // Run each test 3 times to check consistency
  console.log("\n=== Consistency check (3 runs each) ===\n");
  for (const test of tests) {
    const results = await Promise.all([
      callGlm(test.name, test.extraBody, test.systemSuffix),
      callGlm(test.name, test.extraBody, test.systemSuffix),
      callGlm(test.name, test.extraBody, test.systemSuffix)
    ]);
    const leakCount = results.filter(r => r.hasThinkingLeak).length;
    console.log(`${test.name}: ${leakCount}/3 leaked`);
    for (const r of results) {
      const preview = r.response.split("\n")[0].slice(0, 100);
      console.log(`  ${r.hasThinkingLeak ? "⚠️" : "✅"} ${preview}`);
    }
  }
}

main().catch(console.error);
