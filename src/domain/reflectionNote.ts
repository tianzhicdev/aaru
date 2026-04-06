import { toJSONSchema } from "zod";
import type { DomainCoverageEntry, ReflectionNote } from "./schemas.ts";
import {
  DOMAIN_LABELS,
  LIFE_DOMAINS,
  reflectionNoteSchema
} from "./schemas.ts";

type JsonObject = Record<string, unknown>;

export function emptyReflectionNote(): ReflectionNote {
  return {
    updatedAt: new Date().toISOString(),
    domainCoverage: [],
    currentThreads: [],
    avoidPastObservations: [],
    avoidPastQuestions: [],
    steerToTopics: [],
    steeringPressure: "minimal",
    steeringReasoning: "",
    summary: ""
  };
}

export function buildReflectionPrompt(
  messages: Array<{ role: string; content: string }>,
  messageCount: number
): string {
  const transcript = buildTranscript(messages);
  const domainChecklist = LIFE_DOMAINS
    .map((domain) => `  - ${domain}: ${DOMAIN_LABELS[domain]}`)
    .join("\n");

  return `You are Thumos's conversation-state tracker. Read the full transcript and produce a clean-slate reflection note.

Total messages: ${messageCount}

Transcript:
${transcript}

Output ONE valid JSON object:

== STEERING (fill these carefully — they drive the next conversation) ==

"domainCoverage": Rate ALL 7 domains below. For each, how deeply has the conversation explored it?
${domainChecklist}
  Rate each:
  - "untouched": never discussed
  - "mentioned": referenced briefly, no depth
  - "explored": some real discussion
  - "deep": thoroughly covered, multiple exchanges
  Format: [{"domain": "origins", "depth": "untouched", "evidence": "brief note"}, ...]

"steerToTopics": max 4 strings. Format: "Domain Label — concrete question".
  PICK FROM DOMAINS RATED "untouched" OR "mentioned".
  Bad: "Relationships". Good: "Relationships — who do they turn to when things get hard? Any romantic life?"

"steeringPressure": "minimal" | "gentle" | "moderate" | "strong"
  - minimal: fresh material flowing across multiple domains
  - gentle: current thread cooling, natural bridge would help
  - moderate: conversation narrowing to 1-2 domains, others untouched
  - strong: circling same topic, user signaling closure

"steeringReasoning": 1-2 sentences on why this pressure level

"avoidPastObservations": max 6 observations Thumos already made
  (scan assistant messages for reflections it repeated)

"avoidPastQuestions": max 8 questions Thumos already asked
  (scan assistant messages for questions — exact or near-exact)

"currentThreads": max 4 topics alive right now

== SUMMARY (300-500 words, plain text) ==

"summary": Write a narrative summary of the conversation so far. Cover: who this person is (facts, background), what they care about, what emotional territory has surfaced, what tensions or contradictions you notice, and what remains unexplored. Use their own words where powerful. This is Thumos's memory — it should read like a therapist's session notes, not a data dump.

"updatedAt": ISO timestamp

Rules:
- Respond with ONLY valid JSON.`;
}

export function parseReflectionNote(raw: string): ReflectionNote | null {
  const parsed = parseJsonObject(raw);
  if (!parsed) return null;

  const note = emptyReflectionNote();
  note.updatedAt = safeString(parsed.updatedAt, 64) || new Date().toISOString();
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
    .map((message) => `${message.role === "assistant" ? "Thumos" : "User"}: ${message.content}`)
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
