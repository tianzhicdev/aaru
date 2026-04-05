import { toJSONSchema } from "zod";
import type {
  DomainCoverageEntry,
  HiddenSoulFile,
  VisibleSoulFile
} from "./schemas.ts";
import {
  LIFE_DOMAINS,
  hiddenSoulFileSchema,
  visibleSoulFileSchema
} from "./schemas.ts";
import { computeSoulFileCompleteness } from "./matching.ts";

const SPECTRUM_KEYS = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "emotionalSensitivity"
] as const;

const COMPASS_AXES = [
  "openness",
  "vitality",
  "warmth",
  "depth",
  "purpose",
  "resilience",
  "autonomy",
  "connection"
] as const;

type JsonObject = Record<string, unknown>;

export function emptyVisibleSoulFile(): VisibleSoulFile {
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    portrait: null,
    sections: {
      howYouMove: "",
      howYouThink: "",
      howYouConnect: "",
      whatYouCarry: "",
      whatLightsYouUp: "",
      yourTensions: "",
      yourVoice: ""
    },
    crystallizedMoments: [],
    openThreads: [],
    compassScores: {},
    personalitySpectrum: {
      openness: null,
      conscientiousness: null,
      extraversion: null,
      agreeableness: null,
      emotionalSensitivity: null
    },
    topValues: [],
    relationalStyle: null,
    completeness: 0
  };
}

export function emptyHiddenSoulFile(): HiddenSoulFile {
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    confidence: "low",
    expertReflections: {
      psychologist: [],
      sociologist: [],
      linguist: [],
      narrativeAnalyst: []
    },
    coreDrivers: [],
    coreValues: [],
    voice: {
      register: "casual",
      density: "moderate",
      humorStyle: "",
      conflictStyle: "",
      disclosureRate: "gradual",
      signaturePatterns: [],
      voiceExamples: []
    },
    depthMap: {
      domainCoverage: []
    },
    analystNotes: [],
    honestInsights: []
  };
}

export function buildVisibleNarrativePrompt(
  messages: Array<{ role: string; content: string }>
): string {
  const transcript = buildTranscript(messages);

  return `You are writing the visible soul file for a person. It should feel accurate, warm, honest, and grounded in their own words.

Transcript:
${transcript}

Output ONE valid JSON object with these fields:
{
  "version": 1,
  "lastUpdated": "${new Date().toISOString()}",
  "portrait": "2-4 sentences in second person" | null,
  "sections": {
    "howYouMove": "...",
    "howYouThink": "...",
    "howYouConnect": "...",
    "whatYouCarry": "...",
    "whatLightsYouUp": "...",
    "yourTensions": "...",
    "yourVoice": "..."
  },
  "crystallizedMoments": [{"quote": "exact quote", "reflection": "1-sentence observation"}],
  "openThreads": ["unresolved thread"],
  "compassScores": {
    "openness": 0-100 or null,
    "vitality": 0-100 or null,
    "warmth": 0-100 or null,
    "depth": 0-100 or null,
    "purpose": 0-100 or null,
    "resilience": 0-100 or null,
    "autonomy": 0-100 or null,
    "connection": 0-100 or null
  },
  "personalitySpectrum": {
    "openness": { "position": 0-100, "label": "...", "evidence": "..." } | null,
    "conscientiousness": { "position": 0-100, "label": "...", "evidence": "..." } | null,
    "extraversion": { "position": 0-100, "label": "...", "evidence": "..." } | null,
    "agreeableness": { "position": 0-100, "label": "...", "evidence": "..." } | null,
    "emotionalSensitivity": { "position": 0-100, "label": "...", "evidence": "..." } | null
  },
  "topValues": [{"value": "value", "description": "warm 1-sentence description"}],
  "relationalStyle": "2-3 sentence narrative" | null
}

Rules:
- Use second person throughout: "you" and "your".
- "yourTensions" should name growth edges, contradictions, or honest tensions directly but compassionately.
- Derive personality spectrum, values, and relational style independently from the transcript.
- Keep sections short, specific, and non-clinical.
- Use exact quotes for crystallized moments.
- Prefer null over guessing.
- Respond with ONLY valid JSON.`;
}

export function buildHiddenClinicalPrompt(
  messages: Array<{ role: string; content: string }>
): string {
  const transcript = buildTranscript(messages);
  const userMessageCount = messages.filter((message) => message.role === "user").length;
  const confidenceHint = userMessageCount < 10 ? "low" : userMessageCount < 30 ? "medium" : "high";
  const domainCoverageSpec = LIFE_DOMAINS.map((domain) =>
    `    {"domain": "${domain}", "depth": "untouched|mentioned|explored|deep", "evidence": "brief factual note"}`
  ).join(",\n");

  return `You are writing the hidden clinical soul file for Thumos. This is private process guidance, not user-facing prose.

Transcript:
${transcript}

Output ONE valid JSON object:
{
  "version": 1,
  "lastUpdated": "${new Date().toISOString()}",
  "confidence": "${confidenceHint}",
  "expertReflections": {
    "psychologist": ["distinct insight"],
    "sociologist": ["distinct insight"],
    "linguist": ["distinct insight"],
    "narrativeAnalyst": ["distinct insight"]
  },
  "coreDrivers": [{"driver": "name", "strength": 0.0-1.0, "inferred": true, "evidence": "..."}],
  "coreValues": ["value"],
  "voice": {
    "register": "formal|casual|chameleon",
    "density": "sparse|moderate|dense",
    "humorStyle": "description",
    "conflictStyle": "description",
    "disclosureRate": "guarded|gradual|open|floods",
    "signaturePatterns": ["pattern"],
    "voiceExamples": [{"trigger": "context", "response": "pattern"}]
  },
  "depthMap": {
    "domainCoverage": [
${domainCoverageSpec}
    ]
  },
  "analystNotes": ["meta observation"],
  "honestInsights": ["clear, blunt but grounded observation"]
}

Rules:
- No psychometric score fields. Those belong in the visible file only.
- Each expert reflection must be genuinely distinct. Max 6 per lens.
- Rate all 7 domains in depthMap.domainCoverage.
- honestInsights should surface the most useful hard truths. Max 3.
- Keep this clinically useful, concrete, and non-redundant.
- Respond with ONLY valid JSON.`;
}

export function parseVisibleNarrative(raw: string): VisibleSoulFile | null {
  const parsed = parseJsonObject(raw);
  if (!parsed) return null;

  const base = emptyVisibleSoulFile();
  const candidate: VisibleSoulFile = {
    version: parsePositiveInt(parsed.version) ?? base.version,
    lastUpdated: safeString(parsed.lastUpdated, 64) || new Date().toISOString(),
    portrait: parseNullableString(parsed.portrait, 1000),
    sections: {
      howYouMove: safeNestedString(parsed, ["sections", "howYouMove"], 800),
      howYouThink: safeNestedString(parsed, ["sections", "howYouThink"], 800),
      howYouConnect: safeNestedString(parsed, ["sections", "howYouConnect"], 800),
      whatYouCarry: safeNestedString(parsed, ["sections", "whatYouCarry"], 800),
      whatLightsYouUp: safeNestedString(parsed, ["sections", "whatLightsYouUp"], 800),
      yourTensions: safeNestedString(parsed, ["sections", "yourTensions"], 800),
      yourVoice: safeNestedString(parsed, ["sections", "yourVoice"], 800)
    },
    crystallizedMoments: parseCrystallizedMoments(parsed.crystallizedMoments),
    openThreads: safeStringArray(parsed.openThreads, 5, 240),
    compassScores: parseCompassScores(parsed.compassScores),
    personalitySpectrum: parsePersonalitySpectrum(parsed.personalitySpectrum),
    topValues: parseTopValues(parsed.topValues),
    relationalStyle: parseNullableString(parsed.relationalStyle, 600),
    completeness: 0
  };

  candidate.completeness = computeSoulFileCompleteness(candidate);

  const result = visibleSoulFileSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

export function parseHiddenClinical(raw: string): HiddenSoulFile | null {
  const parsed = parseJsonObject(raw);
  if (!parsed) return null;

  const base = emptyHiddenSoulFile();
  const candidate: HiddenSoulFile = {
    version: parsePositiveInt(parsed.version) ?? base.version,
    lastUpdated: safeString(parsed.lastUpdated, 64) || new Date().toISOString(),
    confidence: parseEnumValue(parsed.confidence, ["low", "medium", "high"] as const) ?? "low",
    expertReflections: {
      psychologist: safeNestedStringArray(parsed, ["expertReflections", "psychologist"], 6, 400),
      sociologist: safeNestedStringArray(parsed, ["expertReflections", "sociologist"], 6, 400),
      linguist: safeNestedStringArray(parsed, ["expertReflections", "linguist"], 6, 400),
      narrativeAnalyst: safeNestedStringArray(parsed, ["expertReflections", "narrativeAnalyst"], 6, 400)
    },
    coreDrivers: parseCoreDrivers(parsed.coreDrivers, 6),
    coreValues: safeStringArray(parsed.coreValues, 6, 120),
    voice: {
      register: parseEnumValue(getNested(parsed, "voice", "register"), ["formal", "casual", "chameleon"] as const) ?? "casual",
      density: parseEnumValue(getNested(parsed, "voice", "density"), ["sparse", "moderate", "dense"] as const) ?? "moderate",
      humorStyle: safeNestedString(parsed, ["voice", "humorStyle"], 240),
      conflictStyle: safeNestedString(parsed, ["voice", "conflictStyle"], 240),
      disclosureRate: parseEnumValue(getNested(parsed, "voice", "disclosureRate"), ["guarded", "gradual", "open", "floods"] as const) ?? "gradual",
      signaturePatterns: safeNestedStringArray(parsed, ["voice", "signaturePatterns"], 6, 200),
      voiceExamples: parseVoiceExamples(getNested(parsed, "voice", "voiceExamples"))
    },
    depthMap: {
      domainCoverage: parseDomainCoverage(getNested(parsed, "depthMap", "domainCoverage"))
    },
    analystNotes: safeStringArray(parsed.analystNotes, 6, 400),
    honestInsights: safeStringArray(parsed.honestInsights, 3, 400)
  };

  const result = hiddenSoulFileSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

export function getVisibleSoulFileJsonSchema(): Record<string, unknown> {
  return schemaObject(toJSONSchema(visibleSoulFileSchema));
}

export function getHiddenSoulFileJsonSchema(): Record<string, unknown> {
  return schemaObject(toJSONSchema(hiddenSoulFileSchema));
}

function schemaObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function buildTranscript(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map((message) => `${message.role === "assistant" ? "Thumos" : "User"}: ${message.content}`)
    .join("\n");
}

function parseCrystallizedMoments(value: unknown): VisibleSoulFile["crystallizedMoments"] {
  return safeArray(value)
    .filter((item): item is { quote: string; reflection: string } =>
      typeof item.quote === "string" && typeof item.reflection === "string"
    )
    .slice(0, 10)
    .map((item) => ({
      quote: item.quote.slice(0, 240),
      reflection: item.reflection.slice(0, 300)
    }));
}

function parseCompassScores(value: unknown): VisibleSoulFile["compassScores"] {
  const parsed = isRecord(value) ? value : {};
  const scores: Record<string, number | null> = {};

  for (const axis of COMPASS_AXES) {
    const axisValue = parsed[axis];
    if (typeof axisValue === "number") {
      scores[axis] = clamp(axisValue, 0, 100);
    } else {
      scores[axis] = null;
    }
  }

  return scores;
}

function parsePersonalitySpectrum(value: unknown): VisibleSoulFile["personalitySpectrum"] {
  const parsed = isRecord(value) ? value : {};

  return {
    openness: parseSpectrumEntry(parsed.openness),
    conscientiousness: parseSpectrumEntry(parsed.conscientiousness),
    extraversion: parseSpectrumEntry(parsed.extraversion),
    agreeableness: parseSpectrumEntry(parsed.agreeableness),
    emotionalSensitivity: parseSpectrumEntry(parsed.emotionalSensitivity)
  };
}

function parseSpectrumEntry(
  value: unknown
): VisibleSoulFile["personalitySpectrum"][typeof SPECTRUM_KEYS[number]] {
  if (!isRecord(value) || typeof value.position !== "number") {
    return null;
  }

  return {
    position: clamp(value.position, 0, 100),
    label: safeString(value.label, 200),
    evidence: safeString(value.evidence, 240)
  };
}

function parseTopValues(value: unknown): VisibleSoulFile["topValues"] {
  return safeArray(value)
    .filter((item): item is { value: string; description: string } =>
      typeof item.value === "string" && typeof item.description === "string"
    )
    .slice(0, 3)
    .map((item) => ({
      value: item.value.slice(0, 100),
      description: item.description.slice(0, 240)
    }));
}

function parseCoreDrivers(
  value: unknown,
  maxItems: number
): HiddenSoulFile["coreDrivers"] {
  return safeArray(value)
    .filter((item): item is { driver: string; strength: number; inferred?: boolean; evidence?: unknown } =>
      typeof item.driver === "string" && typeof item.strength === "number"
    )
    .slice(0, maxItems)
    .map((item) => ({
      driver: item.driver.slice(0, 120),
      strength: clamp(item.strength, 0, 1),
      inferred: typeof item.inferred === "boolean" ? item.inferred : true,
      evidence: safeString(item.evidence, 300)
    }));
}

function parseVoiceExamples(value: unknown): HiddenSoulFile["voice"]["voiceExamples"] {
  return safeArray(value)
    .filter((item): item is { trigger: string; response: string } =>
      typeof item.trigger === "string" && typeof item.response === "string"
    )
    .slice(0, 4)
    .map((item) => ({
      trigger: item.trigger.slice(0, 200),
      response: item.response.slice(0, 240)
    }));
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

function parseJsonObject(raw: string): JsonObject | null {
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getNested(value: JsonObject, ...keys: string[]): unknown {
  let current: unknown = value;

  for (const key of keys) {
    if (!isRecord(current) || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

function safeNestedString(value: JsonObject, path: string[], maxLen: number): string {
  return safeString(getNested(value, ...path), maxLen);
}

function safeNestedStringArray(
  value: JsonObject,
  path: string[],
  maxItems: number,
  maxLen: number
): string[] {
  return safeStringArray(getNested(value, ...path), maxItems, maxLen);
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(1, Math.round(value));
}

function parseNullableString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLen) : null;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function parseEnumValue<const T extends readonly string[]>(
  value: unknown,
  options: T
): T[number] | null {
  return typeof value === "string" && (options as readonly string[]).includes(value)
    ? value as T[number]
    : null;
}
