import type { LifeDomain, ReflectionNote, UserOpenness, VisibleSoulFile } from "./schemas.ts";
import { LIFE_DOMAINS, PHASE_CONFIGS, getConversationPhase } from "./schemas.ts";
import { getPrompts, getLanguageDirective } from "./i18n/index.ts";

export type OpeningKind = "first_ever" | "returning";

export interface SoulConversationContext {
  visibleSoulFile: VisibleSoulFile | null;
  reflectionNote: ReflectionNote | null;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  openingKind?: OpeningKind | null;
  language?: string | null;
}

function buildVisibleSoulFileContext(visible: VisibleSoulFile): string {
  const parts: string[] = [];

  if (visible.portrait) {
    parts.push(`Portrait: ${visible.portrait}`);
  }

  const sections = visible.sections;
  if (sections.howYouLightUp) parts.push(`How they light up: ${sections.howYouLightUp}`);
  if (sections.howYouShowUp) parts.push(`How they show up: ${sections.howYouShowUp}`);
  if (sections.howYouLove) parts.push(`How they love: ${sections.howYouLove}`);
  if (sections.howYouWeatherStorms) parts.push(`How they weather storms: ${sections.howYouWeatherStorms}`);
  if (sections.whatYoureLookingFor) parts.push(`What they're looking for: ${sections.whatYoureLookingFor}`);
  if (sections.yourGrowingEdges) parts.push(`Their growing edges: ${sections.yourGrowingEdges}`);
  if (sections.yourWarmth) parts.push(`Their warmth: ${sections.yourWarmth}`);

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

  if (visible.attachmentStyle) {
    parts.push(`Attachment style: ${visible.attachmentStyle}`);
  }

  if (visible.loveSignature) {
    parts.push(`Love signature: ${visible.loveSignature}`);
  }

  if (visible.topValues.length > 0) {
    parts.push(`Top values: ${visible.topValues.map((value) => `${value.value} (${value.description})`).join("; ")}`);
  }

  const nonNullSpectrum = Object.values(visible.personalitySpectrum ?? {}).filter((entry) => entry !== null);
  if (nonNullSpectrum.length > 0) {
    parts.push(`Personality spectrum: ${JSON.stringify(visible.personalitySpectrum)}`);
  }

  return parts.length > 0 ? parts.join("\n") : "No portrait yet.";
}

export function buildDefaultReflectionNote(): ReflectionNote {
  return {
    updatedAt: "",
    conversationPhase: "spark",
    domainCoverage: LIFE_DOMAINS.map(domain => ({
      domain,
      depth: "untouched" as const,
      evidence: ""
    })),
    currentThreads: [],
    avoidPastObservations: [],
    avoidPastQuestions: [],
    steerToTopics: [
      "Daily Rhythm — where do they live, what does their everyday life look like?",
      "Play & Joy — are they seeing anyone right now, and what does fun look like for them?",
      "Daily Rhythm — where did they grow up, and what's their story so far?"
    ],
    steeringPressure: "gentle",
    steeringReasoning: "First conversation — learn the basics (where from, single/not, love history) through natural conversation before going deeper.",
    userOpenness: "warming",
    opennessEvidence: "First conversation — no data yet.",
    summary: ""
  };
}

function buildSummarySection(note: ReflectionNote): string {
  if (!note.summary) return "";
  return `\nCONVERSATION SUMMARY (from last reflection):\n${note.summary}`;
}

const DEPTH_GUIDANCE: Record<UserOpenness, string> = {
  guarded: "DEPTH GUIDANCE: Keep it light and warm. One concrete, easy question. No probing.",
  warming: "DEPTH GUIDANCE: Match their pace. You can lean in a little, but don't push past where they've gone.",
  open: "DEPTH GUIDANCE: They're ready for depth. Explore tensions, contradictions, the real stuff.",
  deep: "DEPTH GUIDANCE: Go as deep as they're going. Mine the rich material."
};

export function buildDepthGuidance(note: ReflectionNote | null): string {
  if (!note) return "";
  const openness = note.userOpenness ?? "warming";
  return `\n${DEPTH_GUIDANCE[openness]}`;
}

function buildPhaseSection(
  note: ReflectionNote,
  messageCount: number
): string {
  const phase = note.conversationPhase ?? getConversationPhase(messageCount);
  const config = PHASE_CONFIGS[phase];
  const allowedDomainList = config.allowedDomains.join(", ");
  const lockedDomains = LIFE_DOMAINS.filter(
    (d) => !config.allowedDomains.includes(d)
  );
  const lockedList = lockedDomains.length > 0
    ? lockedDomains.join(", ")
    : "none";

  return `\nCONVERSATION PHASE: ${config.name} (messages ${config.messageRange[0]}-${config.messageRange[1] ?? "∞"})
Tone: ${config.tone}
Allowed domains: ${allowedDomainList}
Locked domains (DO NOT steer here yet): ${lockedList}`;
}

function buildNavigationSection(
  note: ReflectionNote,
  recentQuestions: string[],
  messageCount: number,
  language?: string | null
): string {
  const prompts = getPrompts(language);
  const nav = prompts.navigation;
  const domainLabels = prompts.domains.labels;

  const phase = note.conversationPhase ?? getConversationPhase(messageCount);
  const config = PHASE_CONFIGS[phase];

  const lines: string[] = [nav.header];

  // Phase info
  lines.push(buildPhaseSection(note, messageCount));

  // Territory map
  if (note.domainCoverage.length > 0) {
    const coverageMap = new Map(note.domainCoverage.map((entry) => [entry.domain, entry]));
    lines.push("");
    lines.push(nav.territoryMapHeader);
    for (const domain of LIFE_DOMAINS) {
      const entry = coverageMap.get(domain);
      const depth = entry?.depth ?? "untouched";
      const label = domainLabels[domain];
      const isLocked = !config.allowedDomains.includes(domain);
      const locked = isLocked ? " [LOCKED]" : "";
      const marker = !isLocked && (depth === "untouched" || depth === "mentioned") ? nav.exploreMarker : "";
      const saturated = depth === "deep" ? nav.saturatedMarker : "";
      lines.push(`- ${label}: ${depth}${saturated}${marker}${locked}`);
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
    : "No portrait yet.";

  const note = context.reflectionNote ?? buildDefaultReflectionNote();

  const summarySection = buildSummarySection(note);

  const recentQuestions = extractRecentAssistantQuestions(context.messages);
  const messageCount = context.messages.length;

  const navigationSection = buildNavigationSection(note, recentQuestions, messageCount, context.language);

  const depthGuidanceSection = buildDepthGuidance(note);

  const openingSection = buildOpeningSection(context);

  const phase = note.conversationPhase ?? getConversationPhase(messageCount);
  const curiositySection = phase !== "spark" && soul.productCuriosity
    ? `\n\n${soul.productCuriosity}`
    : "";
  const matchingSection = phase !== "spark" && soul.matchingAwareness
    ? `\n\n${soul.matchingAwareness}`
    : "";

  const languageDirective = getLanguageDirective(context.language);

  return `${soul.preamble}

${soul.principles}

THEIR PORTRAIT:
${soulFileSection}
${summarySection}
${navigationSection}
${depthGuidanceSection}
${openingSection}

${soul.pacing}

${soul.difficultMoments}

${soul.goodResponse}${curiositySection}${matchingSection}${languageDirective}`;
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
