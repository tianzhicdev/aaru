import type { LifeDomain, ReflectionNote, VisibleSoulFile } from "./schemas.ts";
import { LIFE_DOMAINS } from "./schemas.ts";
import { getPrompts, getLanguageDirective } from "./i18n/index.ts";

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
  language?: string | null;
}

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
  recentQuestions: string[],
  language?: string | null
): string {
  const prompts = getPrompts(language);
  const nav = prompts.navigation;
  const domainLabels = prompts.domains.labels;

  const lines: string[] = [nav.header];

  // Territory map
  if (note.domainCoverage.length > 0) {
    const coverageMap = new Map(note.domainCoverage.map((entry) => [entry.domain, entry]));
    lines.push("");
    lines.push(nav.territoryMapHeader);
    for (const domain of LIFE_DOMAINS) {
      const entry = coverageMap.get(domain);
      const depth = entry?.depth ?? "untouched";
      const label = domainLabels[domain];
      const marker = depth === "untouched" || depth === "mentioned" ? nav.exploreMarker : "";
      const saturated = depth === "deep" ? nav.saturatedMarker : "";
      lines.push(`- ${label}: ${depth}${saturated}${marker}`);
    }
  }

  // Steering pressure + reasoning
  lines.push("");
  lines.push(
    `${nav.pressureLabel} ${note.steeringPressure.toUpperCase()}${note.steeringReasoning ? ` — ${note.steeringReasoning}` : ""}`
  );

  // Active threads
  if (note.currentThreads.length > 0) {
    lines.push(`${nav.activeThreadsLabel} ${note.currentThreads.join(", ")}`);
  }

  // Steer-to topics
  if (note.steerToTopics.length > 0) {
    lines.push(nav.steerTowardLabel);
    note.steerToTopics.forEach((topic, i) => {
      lines.push(`  ${i + 1}. ${topic}`);
    });
  }

  // Avoid-lists from reflection note
  if (note.avoidPastObservations.length > 0) {
    lines.push("");
    lines.push(nav.avoidObservationsLabel);
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
    lines.push(nav.avoidQuestionsLabel);
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

    // Split on sentence-ending punctuation (including Chinese ？)
    const sentences = message.content.split(/(?<=[.!?？。！])\s*/);
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if ((trimmed.endsWith("?") || trimmed.endsWith("？")) && trimmed.length > 10) {
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
  const prompts = getPrompts(context.language);
  switch (context.openingKind) {
    case "first_ever":
      return `\n${prompts.soul.openingFirstEver}`;
    case "returning":
      return `\n${prompts.soul.openingReturning}`;
    default:
      return "";
  }
}

export function buildSoulSystemPrompt(context: SoulConversationContext): string {
  const prompts = getPrompts(context.language);
  const soul = prompts.soul;

  const soulFileSection = context.visibleSoulFile
    ? buildVisibleSoulFileContext(context.visibleSoulFile)
    : "No soul file yet.";

  const summarySection = context.reflectionNote
    ? buildSummarySection(context.reflectionNote)
    : "";

  const recentQuestions = extractRecentAssistantQuestions(context.messages);

  const navigationSection = context.reflectionNote
    ? buildNavigationSection(context.reflectionNote, recentQuestions, context.language)
    : "";

  const openingSection = buildOpeningSection(context);

  const currentEventsSection = context.xaiNews && context.xaiNews.length > 0
    ? `\nCURRENT CONTEXT (use naturally, don't force):\n${context.xaiNews.map((item) =>
        `- ${item.topic}: "${item.headline}" — ${item.summary}`
      ).join("\n")}`
    : "";

  const languageDirective = getLanguageDirective(context.language);

  return `${soul.preamble}

${soul.principles}

THEIR SOUL FILE:
${soulFileSection}
${summarySection}
${navigationSection}
${currentEventsSection}
${openingSection}

${soul.pacing}

${soul.difficultMoments}

${soul.goodResponse}${languageDirective}`;
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

export function pickOpening(preferredTopic?: string | null, language?: string | null): string {
  const prompts = getPrompts(language);
  const pool = prompts.domains.openingPool;

  const hintedDomain = preferredTopic ? extractDomainHint(preferredTopic) as LifeDomain | null : null;
  const domain = hintedDomain && pool[hintedDomain]
    ? hintedDomain
    : LIFE_DOMAINS[Math.floor(Math.random() * LIFE_DOMAINS.length)];
  const options = pool[domain];
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
  const prompts = getPrompts(context.language);
  const fb = prompts.fallbacks;
  const preferredTopic = context.reflectionNote?.steerToTopics[0] ?? null;

  if (context.openingKind === "first_ever") {
    return pickOpening(preferredTopic, context.language);
  }

  if (context.openingKind === "returning") {
    const portrait = context.visibleSoulFile?.portrait;
    if (portrait) {
      return fb.returningWithPortrait.replace("{portrait}", portrait.slice(0, 120));
    }

    if (preferredTopic) {
      return fb.returningWithTopic.replace("{topic}", preferredTopic);
    }

    const lastUserMessage = findLastUserMessage(context.messages);
    if (lastUserMessage) {
      return fb.returningWithLastMessage.replace("{message}", lastUserMessage.slice(0, 140));
    }

    return fb.returningDefault;
  }

  return fb.generic[context.messages.length % fb.generic.length];
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
