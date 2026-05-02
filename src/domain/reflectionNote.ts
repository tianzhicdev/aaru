import { toJSONSchema } from "zod";
import type { ConversationPhase, DomainCoverageEntry, ReflectionNote } from "./schemas.ts";
import {
  CONVERSATION_PHASES,
  DOMAIN_LABELS,
  LIFE_DOMAINS,
  getConversationPhase,
  reflectionNoteSchema
} from "./schemas.ts";
import { getPrompts, getLanguageDirective } from "./i18n/index.ts";

type JsonObject = Record<string, unknown>;

export function emptyReflectionNote(): ReflectionNote {
  return {
    updatedAt: new Date().toISOString(),
    conversationPhase: "spark",
    domainCoverage: [],
    currentThreads: [],
    avoidPastObservations: [],
    avoidPastQuestions: [],
    steerToTopics: [],
    steeringPressure: "minimal",
    steeringReasoning: "",
    userOpenness: "warming",
    opennessEvidence: "",
    summary: ""
  };
}

export function buildReflectionPrompt(
  messages: Array<{ role: string; content: string }>,
  messageCount: number,
  language?: string | null
): string {
  const prompts = getPrompts(language);
  const ref = prompts.reflection;
  const domainLabels = prompts.domains.labels;
  const transcript = buildTranscript(messages);
  const domainChecklist = LIFE_DOMAINS
    .map((domain) => `  - ${domain}: ${domainLabels[domain]}`)
    .join("\n");

  const phase = getConversationPhase(messageCount);
  const phaseInstruction = `\n"conversationPhase": Assess which phase this conversation is in based on message count (${messageCount} messages).
  - "spark" (1-15 messages): Light, fun — daily_rhythm and play_and_joy only
  - "kindling" (15-35 messages): Warmer — adds values_and_worldview, love_language
  - "flame" (35-60 messages): Real talk — adds conflict_and_repair, vulnerability_and_trust
  - "hearth" (60+ messages): Deep — all domains including partnership_vision
  Current phase based on count: "${phase}"`;

  const steeringWithDomains = ref.steeringSection.replace("{domainChecklist}", domainChecklist);
  const languageDirective = getLanguageDirective(language);

  return `${ref.preamble}

Total messages: ${messageCount}

Transcript:
${transcript}

Output ONE valid JSON object:

${phaseInstruction}

${steeringWithDomains}

${ref.summarySection}

${ref.rules}${languageDirective}`;
}

export function parseReflectionNote(raw: string): ReflectionNote | null {
  const parsed = parseJsonObject(raw);
  if (!parsed) return null;

  const note = emptyReflectionNote();
  note.updatedAt = safeString(parsed.updatedAt, 64) || new Date().toISOString();
  note.conversationPhase = parseEnumValue(
    parsed.conversationPhase,
    CONVERSATION_PHASES
  ) as ConversationPhase ?? "spark";
  note.domainCoverage = parseDomainCoverage(parsed.domainCoverage);
  note.currentThreads = safeStringArray(parsed.currentThreads, 4, 200);
  note.avoidPastObservations = safeStringArray(parsed.avoidPastObservations, 6, 240);
  note.avoidPastQuestions = safeStringArray(parsed.avoidPastQuestions, 8, 240);
  note.steerToTopics = parseSteerToTopics(parsed.steerToTopics);
  note.steeringPressure = parseEnumValue(
    parsed.steeringPressure,
    ["minimal", "gentle", "moderate", "strong"] as const
  ) ?? "minimal";
  note.steeringReasoning = safeString(parsed.steeringReasoning, 500);
  note.summary = safeString(parsed.summary, 3000);

  const result = reflectionNoteSchema.safeParse(note);
  return result.success ? result.data : null;
}

export function getReflectionNoteJsonSchema(): Record<string, unknown> {
  return schemaObject(toJSONSchema(reflectionNoteSchema));
}

// ── Internal helpers ─────────────────────────────────────────

function buildTranscript(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map((message) => `${message.role === "assistant" ? "Magpie" : "User"}: ${message.content}`)
    .join("\n");
}

function parseDomainCoverage(value: unknown): DomainCoverageEntry[] {
  return safeArray(value)
    .filter((item): item is { domain: string; depth: DomainCoverageEntry["depth"]; evidence?: unknown } =>
      typeof item.domain === "string"
      && parseEnumValue(item.domain, LIFE_DOMAINS) !== null
      && parseEnumValue(item.depth, ["untouched", "mentioned", "explored", "deep"] as const) !== null
    )
    .slice(0, LIFE_DOMAINS.length)
    .map((item) => ({
      domain: item.domain as DomainCoverageEntry["domain"],
      depth: item.depth,
      evidence: safeString(item.evidence, 240)
    }));
}

function parseSteerToTopics(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return (value as unknown[])
    .map((item) => {
      if (typeof item === "string") {
        const trimmed = item.trim();
        return trimmed.length > 0 ? trimmed.slice(0, 240) : null;
      }

      if (!isRecord(item)) {
        return null;
      }

      const domain = parseEnumValue(item.domain, LIFE_DOMAINS);
      const angle = safeString(item.angle, 200)
        || safeString(item.topic, 200)
        || safeString(item.focus, 200)
        || safeString(item.prompt, 200);

      if (!angle) {
        return null;
      }

      if (!domain) {
        return angle.slice(0, 240);
      }

      return `${DOMAIN_LABELS[domain]} — ${angle}`.slice(0, 240);
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 4);
}

function parseJsonObject(raw: string): JsonObject | null {
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function schemaObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function safeString(value: unknown, maxLen: number): string {
  return typeof value === "string" ? value.slice(0, maxLen) : "";
}

function safeStringArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLen));
}

function safeArray(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is JsonObject => isRecord(item));
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEnumValue<const T extends readonly string[]>(
  value: unknown,
  options: T
): T[number] | null {
  return typeof value === "string" && (options as readonly string[]).includes(value)
    ? value as T[number]
    : null;
}
