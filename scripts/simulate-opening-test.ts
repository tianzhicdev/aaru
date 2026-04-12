#!/usr/bin/env npx tsx
/**
 * Simulate conversations against dev API using Fireworks kimi-k2p5-turbo for user messages.
 * Usage: FIREWORKS_API_KEY=... npx tsx scripts/simulate-opening-test.ts [--lang en] [--exchanges 10] [--long]
 */

const BASE_URL = "https://thumos-api-dev.tianzhic-dev.workers.dev";
const FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions";
const FIREWORKS_MODEL = "accounts/fireworks/models/deepseek-v3p1";
const DEBUG_TOKEN = process.env.DEBUG_API_TOKEN_DEV || process.env.DEBUG_API_TOKEN || "";
const FIREWORKS_KEY = process.env.FIREWORKS_API_KEY_DEV || process.env.FIREWORKS_API_KEY || "";

const ALL_LANGS = ["en", "zh-CN", "ja", "fr", "es", "ko", "pt-BR", "de"];

interface SimConfig {
  lang: string;
  exchanges: number;
  label: string;
}

const PERSONAS: Record<string, string> = {
  en: `You are Sarah, a 28-year-old graphic designer from Portland. You love cooking Italian food, hiking with your dog, and reading sci-fi novels. You're warm, a bit nerdy, and genuinely looking for a meaningful relationship. You had a 3-year relationship that ended 8 months ago — you've grown from it but still think about what went wrong. You're funny, sometimes sarcastic, and you open up gradually. Answer naturally in 1-4 sentences. Be genuine, not performative.`,
  "zh-CN": `你是小雨，一个26岁的上海插画师。你喜欢逛菜市场、看日落、养猫。你温柔但有主见，对感情认真但不急躁。你上一段感情是大学时期的，已经过去三年了。用自然的中文回答，1-4句话，像真人聊天一样。`,
  ja: `あなたは美咲、27歳の京都のカフェ店員です。抹茶と古本が好きで、週末は鴨川沿いを散歩します。穏やかで少し内向的ですが、心を許した人には素直になれます。2年前に別れた彼のことをまだ時々考えます。自然な日本語で1-4文で答えてください。`,
  fr: `Tu es Camille, 29 ans, institutrice à Lyon. Tu adores le cinéma d'auteur, faire du pain maison et te promener le long du Rhône. Tu es chaleureuse, un peu rêveuse, et tu cherches quelqu'un qui partage ta vision de la vie. Ta dernière relation s'est terminée il y a un an. Réponds naturellement en 1-4 phrases, comme dans une vraie conversation.`,
  es: `Eres Lucía, 27 años, fotógrafa freelance en Barcelona. Te encanta el mar, cocinar paella con tu abuela los domingos y leer a García Márquez. Eres apasionada pero también un poco reservada al principio. Tu última relación fue intensa pero corta. Responde naturalmente en 1-4 frases, como en una conversación real.`,
  ko: `너는 수진, 25살 서울의 UX 디자이너야. 빈티지 카페 찾아다니는 거 좋아하고, 주말에는 한강에서 자전거 타. 밝고 유머 있지만 감정적으로는 조심스러운 편이야. 1년 전 헤어진 전 남자친구가 아직 가끔 생각나. 자연스러운 한국어로 1-4문장으로 대답해. 실제 대화처럼.`,
  "pt-BR": `Você é Ana, 26 anos, arquiteta em São Paulo. Adora música ao vivo, cozinhar pra amigos e assistir documentários. É calorosa e expressiva, mas demora pra confiar totalmente. Seu último relacionamento foi de 2 anos e terminou há 6 meses. Responda naturalmente em 1-4 frases, como numa conversa real.`,
  de: `Du bist Lena, 28 Jahre alt, Buchhändlerin in Berlin. Du liebst Flohmärkte, Fahrradfahren und spontane Reisen. Du bist warmherzig und direkt, aber brauchst Zeit, um dich emotional zu öffnen. Deine letzte Beziehung endete vor einem Jahr. Antworte natürlich in 1-4 Sätzen, wie in einem echten Gespräch.`
};

async function callFireworks(persona: string, conversationSoFar: Array<{role: string; content: string}>): Promise<string> {
  const systemContent = `You are roleplaying in a dating app conversation. ${persona}

Reply in character in 1-4 sentences. Output ONLY your reply, nothing else.`;

  // Build messages: Thumos = user, character = assistant
  const messages: Array<{role: string; content: string}> = [
    { role: "system", content: systemContent }
  ];
  for (const msg of conversationSoFar) {
    messages.push({
      role: msg.role === "assistant" ? "user" : "assistant",
      content: msg.content
    });
  }

  const resp = await fetch(FIREWORKS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${FIREWORKS_KEY}`
    },
    body: JSON.stringify({
      model: FIREWORKS_MODEL,
      messages,
      temperature: 0.5,
      max_tokens: 400
    })
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Fireworks error ${resp.status}: ${text}`);
  }

  const data = await resp.json() as any;
  let content = (data.choices?.[0]?.message?.content || "").trim();

  // Strip think tags
  content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // Extract content after >>> marker
  const markerIdx = content.indexOf(">>>");
  if (markerIdx >= 0) {
    content = content.slice(markerIdx + 3).trim();
    // Remove trailing >>> if present
    content = content.replace(/\n*>>>[\s\S]*$/, "").trim();
  } else {
    // No marker found — use aggressive reasoning stripping
    content = stripKimiReasoning(content);
  }

  // Final cleanup: remove quotes wrapping the entire response
  if (content.startsWith('"') && content.endsWith('"')) {
    content = content.slice(1, -1).trim();
  }

  if (!content || content.length < 5) {
    content = "Hmm, that's a really good question. I need to think about that for a second.";
  }

  return content;
}

function stripKimiReasoning(raw: string): string {
  // Split into lines and classify each as reasoning or response
  const lines = raw.split("\n");

  // Patterns that indicate meta-reasoning, not in-character speech
  const reasoningLine = (line: string): boolean => {
    const t = line.trim();
    if (!t) return false; // blank lines are neutral
    // Numbered/bulleted lists
    if (/^\d+[\.\)]\s/.test(t)) return true;
    // Bullet points
    if (/^[-•*]\s/.test(t)) return true;
    // Meta labels
    if (/^(Draft|Alternative|Option|Or:|Wait,|Actually,|Let me|Looking at|I think|I need|I should|Hmm,? (?:let|maybe|I)|Possible|The (?:question|user|prompt|character|persona)|Context:|Note:|Analysis:)/i.test(t)) return true;
    // Character name analysis (mentioning persona by name in 3rd person)
    if (/^(Sarah|小雨|美咲|Camille|Lucía|수진|Ana|Lena)(?:'s| would| is| might| should| has| was| could)/i.test(t)) return true;
    // Trait analysis
    if (/(?:trait|personality|vulnerability|breakup|persona|in.character|roleplay|respond|angle)/i.test(t)) return true;
    // Self-referential reasoning
    if (/(?:too (?:much|heavy|light)|keep it|go with|that's a bit|that works|this captures)/i.test(t)) return true;
    return false;
  };

  // Strategy: find the longest contiguous block of non-reasoning lines
  // that looks like actual speech
  const blocks: Array<{start: number; end: number; text: string}> = [];
  let blockStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isReasoning = reasoningLine(line);
    const isBlank = !line;

    if (!isReasoning && !isBlank) {
      if (blockStart === -1) blockStart = i;
    } else if (isReasoning) {
      if (blockStart >= 0) {
        const text = lines.slice(blockStart, i).join("\n").trim();
        if (text) blocks.push({ start: blockStart, end: i, text });
        blockStart = -1;
      }
    }
    // blank lines don't break blocks
  }
  // Close final block
  if (blockStart >= 0) {
    const text = lines.slice(blockStart).join("\n").trim();
    if (text) blocks.push({ start: blockStart, end: lines.length, text });
  }

  if (blocks.length === 0) return raw;

  // Prefer the first block that's >= 20 chars (actual speech), otherwise take the longest
  const goodBlock = blocks.find(b => b.text.length >= 20) || blocks.reduce((a, b) => a.text.length >= b.text.length ? a : b);

  let result = goodBlock.text;

  // Strip "Or keep it lighter..." trailing alternatives
  result = result.replace(/\n\n(?:Or |Alternative|Draft|Wait,|Actually,)[\s\S]*$/i, "").trim();

  // Strip leading quote marks if the response was wrapped
  if (result.startsWith('"') && !result.endsWith('"')) {
    result = result.slice(1).trim();
  }

  return result;
}

async function bootstrapUser(lang: string): Promise<{ token: string; userId: string }> {
  const deviceId = `sim-${lang}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const resp = await fetch(`${BASE_URL}/bootstrap-soul`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId })
  });
  const data = await resp.json() as any;
  if (!data.token) throw new Error(`Bootstrap failed: ${JSON.stringify(data)}`);
  return { token: data.token, userId: data.user_id };
}

async function setLanguage(token: string, lang: string): Promise<void> {
  await fetch(`${BASE_URL}/update-language`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-thumos-session": token },
    body: JSON.stringify({ language: lang })
  });
}

async function soulConverse(token: string, mode: "opening" | "reply", message?: string): Promise<string> {
  const body: any = { mode };
  if (mode === "reply" && message) body.message = message;

  const resp = await fetch(`${BASE_URL}/soul-converse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-thumos-session": token,
      "Accept": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await resp.json() as any;
  return data.content || data.error || "(no content)";
}

async function fetchDebugDump(token: string): Promise<any> {
  if (!DEBUG_TOKEN) return null;
  const resp = await fetch(`${BASE_URL}/debug-dump`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-thumos-session": token,
      "x-thumos-debug-token": DEBUG_TOKEN
    },
    body: JSON.stringify({})
  });
  return resp.json();
}

async function runSimulation(config: SimConfig): Promise<void> {
  const { lang, exchanges, label } = config;
  const dir = `dry-run-output/opening-test/${label}`;
  const fs = await import("fs");
  fs.mkdirSync(dir, { recursive: true });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`SIMULATION: ${label} (${lang}, ${exchanges} exchanges)`);
  console.log(`${"=".repeat(60)}`);

  // Bootstrap
  const { token, userId } = await bootstrapUser(lang);
  console.log(`  user_id: ${userId}`);

  // Set language
  if (lang !== "en") {
    await setLanguage(token, lang);
    console.log(`  language: ${lang}`);
  }

  // Opening message
  const opening = await soulConverse(token, "opening");
  console.log(`\n  [THUMOS OPENING]:`);
  console.log(`  ${opening.slice(0, 300)}`);

  let conversation = `# Simulation: ${label}\n\n## Opening\n**Thumos:** ${opening}\n\n`;

  // Build conversation history for Fireworks context
  const chatHistory: Array<{role: string; content: string}> = [
    { role: "assistant", content: opening }
  ];

  const persona = PERSONAS[lang] || PERSONAS.en;

  for (let i = 0; i < exchanges; i++) {
    // Generate user reply via Fireworks kimi-k2p5-turbo (free)
    const userMsg = await callFireworks(persona, chatHistory);
    console.log(`\n  [USER ${i + 1}/${exchanges}]: ${userMsg.slice(0, 150)}${userMsg.length > 150 ? "..." : ""}`);
    conversation += `\n**User (${i + 1}):** ${userMsg}\n`;

    // Send to Thumos
    const thumosReply = await soulConverse(token, "reply", userMsg);
    console.log(`  [THUMOS]: ${thumosReply.slice(0, 150)}${thumosReply.length > 150 ? "..." : ""}`);
    conversation += `\n**Thumos:** ${thumosReply}\n`;

    chatHistory.push({ role: "user", content: userMsg });
    chatHistory.push({ role: "assistant", content: thumosReply });

    // Small delay to avoid hammering
    await new Promise(r => setTimeout(r, 500));
  }

  // Save conversation
  fs.writeFileSync(`${dir}/conversation.md`, conversation);

  // Fetch debug dump
  const debugDump = await fetchDebugDump(token);
  if (debugDump) {
    fs.writeFileSync(`${dir}/debug-dump.json`, JSON.stringify(debugDump, null, 2));
  }

  // Fetch soul file
  const soulFileResp = await fetch(`${BASE_URL}/get-soul-file`, {
    headers: { "x-thumos-session": token }
  });
  const soulFile = await soulFileResp.json();
  fs.writeFileSync(`${dir}/soul-file.json`, JSON.stringify(soulFile, null, 2));

  console.log(`\n  Saved to: ${dir}/`);
  console.log(`${"=".repeat(60)}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const isLong = args.includes("--long");
  const langIdx = args.indexOf("--lang");
  const exchangeIdx = args.indexOf("--exchanges");

  if (!FIREWORKS_KEY) {
    console.error("ERROR: FIREWORKS_API_KEY or FIREWORKS_API_KEY_DEV must be set");
    process.exit(1);
  }

  const configs: SimConfig[] = [];

  if (isLong) {
    // 80-message English simulation
    configs.push({ lang: "en", exchanges: 40, label: "en-long-80msg" });
  } else if (langIdx >= 0 && args[langIdx + 1]) {
    const lang = args[langIdx + 1];
    const ex = exchangeIdx >= 0 ? parseInt(args[exchangeIdx + 1]) : 10;
    configs.push({ lang, exchanges: ex, label: `${lang}-${ex * 2}msg` });
  } else {
    // All 8 languages, 10 exchanges each (20 messages)
    for (const lang of ALL_LANGS) {
      configs.push({ lang, exchanges: 10, label: `${lang}-20msg` });
    }
  }

  console.log(`Running ${configs.length} simulation(s)...`);
  console.log(`Using Fireworks model: ${FIREWORKS_MODEL}`);
  console.log(`Target: ${BASE_URL}\n`);

  for (const config of configs) {
    await runSimulation(config);
  }

  console.log("\nAll simulations complete!");
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
