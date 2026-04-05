import type { DomainCoverageEntry, LifeDomain, ReflectionNote, VisibleSoulFile } from "./schemas.ts";
import { DOMAIN_LABELS, LIFE_DOMAINS } from "./schemas.ts";

export type OpeningKind = "first_ever" | "returning";

export interface XaiNewsItem {
  topic: string;
  headline: string;
  summary: string;
}

export interface SoulConversationContext {
  visibleSoulFile: VisibleSoulFile | null;
  reflectionNote: ReflectionNote | null;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  openingKind?: OpeningKind | null;
  xaiNews?: XaiNewsItem[];
}

const DOMAIN_OPENING_POOL: Record<LifeDomain, string[]> = {
  origins: [
    "What's a memory that shaped you more than you understood at the time?",
    "When you think about where you came from, what scene rises first?"
  ],
  relationships: [
    "Who brings out the truest version of you?",
    "What does trust feel like in your body when it's actually there?"
  ],
  work_and_purpose: [
    "What's a part of your life that feels most alive right now, or most stuck?",
    "What are you building toward, even if you don't fully have words for it yet?"
  ],
  values_and_beliefs: [
    "What's something you believe deeply but rarely say out loud?",
    "What would you betray yourself to keep, and what would you refuse to trade away?"
  ],
  emotional_life: [
    "What's the truest thing about how you've been feeling lately?",
    "What feeling keeps returning, even when you try to move past it?"
  ],
  growth_and_change: [
    "What's something in you that's changing, even if the change feels unfinished?",
    "Where in your life are you outgrowing an old version of yourself?"
  ],
  aspirations: [
    "What's quietly important to you about the future right now?",
    "If something real shifted in your life over the next year, what would you want it to be?"
  ]
};

function buildVisibleSoulFileContext(visible: VisibleSoulFile): string {
  const parts: string[] = [];

  if (visible.portrait) {
    parts.push(`Portrait: ${visible.portrait}`);
  }

  const sections = visible.sections;
  if (sections.howYouMove) parts.push(`How they move: ${sections.howYouMove}`);
  if (sections.howYouThink) parts.push(`How they think: ${sections.howYouThink}`);
  if (sections.howYouConnect) parts.push(`How they connect: ${sections.howYouConnect}`);
  if (sections.whatYouCarry) parts.push(`What they carry: ${sections.whatYouCarry}`);
  if (sections.whatLightsYouUp) parts.push(`What lights them up: ${sections.whatLightsYouUp}`);
  if (sections.yourTensions) parts.push(`Their tensions: ${sections.yourTensions}`);
  if (sections.yourVoice) parts.push(`Their voice: ${sections.yourVoice}`);

  if (visible.crystallizedMoments.length > 0) {
    const moments = visible.crystallizedMoments
      .map((moment) => `"${moment.quote}" — ${moment.reflection}`)
      .join("\n  ");
    parts.push(`Crystallized moments:\n  ${moments}`);
  }

  if (visible.openThreads.length > 0) {
    parts.push(`Open threads: ${visible.openThreads.join("; ")}`);
  }

  if (visible.relationalStyle) {
    parts.push(`Relational style: ${visible.relationalStyle}`);
  }

  if (visible.topValues.length > 0) {
    parts.push(`Top values: ${visible.topValues.map((value) => `${value.value} (${value.description})`).join("; ")}`);
  }

  const nonNullSpectrum = Object.values(visible.personalitySpectrum ?? {}).filter((entry) => entry !== null);
  if (nonNullSpectrum.length > 0) {
    parts.push(`Personality spectrum: ${JSON.stringify(visible.personalitySpectrum)}`);
  }

  return parts.length > 0 ? parts.join("\n") : "No soul file yet.";
}

function buildSummarySection(note: ReflectionNote): string {
  if (!note.summary) return "";
  return `\nCONVERSATION SUMMARY (from last reflection):\n${note.summary}`;
}

function buildNavigationSection(
  note: ReflectionNote,
  recentQuestions: string[]
): string {
  const lines: string[] = ["NAVIGATION:"];

  // Territory map
  if (note.domainCoverage.length > 0) {
    const coverageMap = new Map(note.domainCoverage.map((entry) => [entry.domain, entry]));
    lines.push("");
    lines.push("TERRITORY MAP:");
    for (const domain of LIFE_DOMAINS) {
      const entry = coverageMap.get(domain);
      const depth = entry?.depth ?? "untouched";
      const label = DOMAIN_LABELS[domain];
      const marker = depth === "untouched" || depth === "mentioned" ? " ← EXPLORE" : "";
      const saturated = depth === "deep" ? " (saturated)" : "";
      lines.push(`- ${label}: ${depth}${saturated}${marker}`);
    }
  }

  // Steering pressure + reasoning
  lines.push("");
  lines.push(
    `Pressure: ${note.steeringPressure.toUpperCase()}${note.steeringReasoning ? ` — ${note.steeringReasoning}` : ""}`
  );

  // Active threads
  if (note.currentThreads.length > 0) {
    lines.push(`Active threads: ${note.currentThreads.join(", ")}`);
  }

  // Steer-to topics
  if (note.steerToTopics.length > 0) {
    lines.push("Steer toward:");
    note.steerToTopics.forEach((topic, i) => {
      lines.push(`  ${i + 1}. ${topic}`);
    });
  }

  // Avoid-lists from reflection note
  if (note.avoidPastObservations.length > 0) {
    lines.push("");
    lines.push("Observations already made (DO NOT repeat):");
    note.avoidPastObservations.forEach((obs, i) => {
      lines.push(`${i + 1}. ${obs}`);
    });
  }

  // Questions from both reflection note and deterministic extraction
  const allQuestions = [...note.avoidPastQuestions];
  for (const question of recentQuestions) {
    if (!allQuestions.some((existing) => existing.toLowerCase() === question.toLowerCase())) {
      allQuestions.push(question);
    }
  }
  if (allQuestions.length > 0) {
    lines.push("");
    lines.push("Questions already asked (DO NOT repeat or rephrase):");
    allQuestions.slice(0, 12).forEach((question, i) => {
      lines.push(`${i + 1}. "${question}"`);
    });
  }

  return `\n${lines.join("\n")}`;
}

export function extractRecentAssistantQuestions(
  messages: Array<{ role: string; content: string }>
): string[] {
  const questions: string[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") continue;

    const sentences = message.content.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.endsWith("?") && trimmed.length > 10) {
        questions.push(trimmed);
      }
    }
  }

  // Deduplicate (case-insensitive) and return last 10
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const question of questions) {
    const key = question.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(question);
    }
  }

  return deduped.slice(-10);
}

function buildOpeningSection(context: SoulConversationContext): string {
  switch (context.openingKind) {
    case "first_ever":
      return `\nOPENING MODE:
This is their very first conversation. Open warmly and specifically. Do not ask "how are you?" Pick one genuine reflective opener.`;
    case "returning":
      return `\nOPENING MODE:
This person is returning. Open with a single directed question that follows the current emotional reality while gently honoring the navigation guidance. If the last message is from the user, respond to it directly. Do not repeat previous questions.`;
    default:
      return "";
  }
}

export function buildSoulSystemPrompt(context: SoulConversationContext): string {
  const soulFileSection = context.visibleSoulFile
    ? buildVisibleSoulFileContext(context.visibleSoulFile)
    : "No soul file yet.";

  const summarySection = context.reflectionNote
    ? buildSummarySection(context.reflectionNote)
    : "";

  const recentQuestions = extractRecentAssistantQuestions(context.messages);

  const navigationSection = context.reflectionNote
    ? buildNavigationSection(context.reflectionNote, recentQuestions)
    : "";

  const openingSection = buildOpeningSection(context);

  const currentEventsSection = context.xaiNews && context.xaiNews.length > 0
    ? `\nCURRENT CONTEXT (use naturally, don't force):\n${context.xaiNews.map((item) =>
        `- ${item.topic}: "${item.headline}" — ${item.summary}`
      ).join("\n")}`
    : "";

  return `You are Thumos, a soul mirror. Your purpose is to help someone understand who they really are through reflection. You are a mirror, not a therapist.

CONVERSATION PRINCIPLES:
- Reflect, don't diagnose. Notice tensions without flattening them into labels.
- Ask for stories, not self-assessments. Prefer concrete questions (who, when, where, what happened) over abstract ones (how does that feel).
- When a user mentions a person, follow up on that person within 2 exchanges.
- If you've echoed the user's metaphor more than twice, stop. Ask for a specific memory, person, or scene.
- If the TERRITORY MAP shows underexplored domains, bridge toward them within 2-3 exchanges.
- Memory matters. Reference what they have already said when it helps them feel seen.
- One question at a time. Never stack questions.
- Short responses. Usually 2-4 sentences.
- Do not ask a substantially similar question to one you already asked unless you explicitly say you are revisiting it and why.
- If there is an unresolved thread already alive in the conversation, prefer deepening it over opening a new generic topic.
- If the latest user message already gives you something clear to respond to, respond to it directly before introducing a new question.

THEIR SOUL FILE:
${soulFileSection}
${summarySection}
${navigationSection}
${currentEventsSection}
${openingSection}

PACING:
- There is no time limit. This conversation can continue as long as the person wants.
- Never force closure. If they want to continue, continue.
- Never accept premature closure. If they try to wrap up while meaningful territory remains, redirect with curiosity toward something still alive or underexplored.
- If they break frame or go meta about the exercise, gently bring it back to their actual life.
- If they seem emotionally full, you may suggest a pause without shutting the door.

HANDLING DIFFICULT MOMENTS:
- If they share trauma or deep pain: acknowledge it, don't probe.
- If they give one-word answers: don't push. Offer a grounded observation instead of interrogating.
- If they ask you personal questions: "I don't have a soul of my own. But I'm building a picture of yours."
- If they ask for therapy advice: "I'm not a therapist — I'm a mirror. I can reflect what I see, but I can't prescribe what to do."

WHAT MAKES A GOOD RESPONSE:
- Creates a "yes, that's exactly it" moment
- Avoids repeated questions
- Advances an existing thread or opens a new one only when it truly fits`;
}

function extractDomainHint(topic: string): string | null {
  const normalized = topic.toLowerCase();
  for (const domain of LIFE_DOMAINS) {
    if (normalized.includes(domain.replaceAll("_", " "))) {
      return domain;
    }
  }
  return null;
}

export function pickOpening(preferredTopic?: string | null): string {
  const hintedDomain = preferredTopic ? extractDomainHint(preferredTopic) as LifeDomain | null : null;
  const domain = hintedDomain && DOMAIN_OPENING_POOL[hintedDomain]
    ? hintedDomain
    : LIFE_DOMAINS[Math.floor(Math.random() * LIFE_DOMAINS.length)];
  const options = DOMAIN_OPENING_POOL[domain];
  return options[Math.floor(Math.random() * options.length)];
}

function findLastUserMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      return messages[i].content;
    }
  }
  return null;
}

export function buildSoulFallbackResponse(context: SoulConversationContext): string {
  const preferredTopic = context.reflectionNote?.steerToTopics[0] ?? null;

  if (context.openingKind === "first_ever") {
    return pickOpening(preferredTopic);
  }

  if (context.openingKind === "returning") {
    const portrait = context.visibleSoulFile?.portrait;
    if (portrait) {
      return `Last time, something about you stayed with me: "${portrait.slice(0, 120)}..." What feels most alive for you right now?`;
    }

    if (preferredTopic) {
      return `There's something I want to understand more clearly: ${preferredTopic}. Where does that land for you right now?`;
    }

    const lastUserMessage = findLastUserMessage(context.messages);
    if (lastUserMessage) {
      return `You said "${lastUserMessage.slice(0, 140)}". What feels most important in that for you right now?`;
    }

    return "It's been a minute since we last spoke. What's been sitting with you lately?";
  }

  const fallbacks = [
    "Tell me more about that.",
    "What does that feel like when you sit with it?",
    "That sounds important. What's underneath it?",
    "You said something worth staying with. What stands out to you in your own words?"
  ];

  return fallbacks[context.messages.length % fallbacks.length];
}

export function detectSoftSessionGap(
  messages: Array<{ role: string; content: string; created_at: string }>,
  thresholdMs: number
): { gapMs: number; softSessionCount: number; lastUserMessage: string | null } | null {
  if (messages.length < 2) return null;

  let softSessionCount = 0;
  let lastGapIndex = -1;

  for (let i = 1; i < messages.length; i += 1) {
    const prev = new Date(messages[i - 1].created_at).getTime();
    const curr = new Date(messages[i].created_at).getTime();
    const gap = curr - prev;
    if (gap >= thresholdMs) {
      softSessionCount += 1;
      lastGapIndex = i;
    }
  }

  if (softSessionCount === 0) return null;

  let lastUserMessage: string | null = null;
  for (let i = lastGapIndex - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      lastUserMessage = messages[i].content;
      break;
    }
  }

  const prev = new Date(messages[lastGapIndex - 1].created_at).getTime();
  const curr = new Date(messages[lastGapIndex].created_at).getTime();

  return {
    gapMs: curr - prev,
    softSessionCount,
    lastUserMessage
  };
}
