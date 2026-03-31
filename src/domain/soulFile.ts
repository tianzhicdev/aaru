import type {
  DomainCoverageEntry,
  HiddenSoulFile,
  ReflectionNote,
  VisibleSoulFile
} from "./schemas.ts";
import { DOMAIN_LABELS, LIFE_DOMAINS } from "./schemas.ts";

type TraitKey =
  | "openness"
  | "conscientiousness"
  | "extraversion"
  | "agreeableness"
  | "neuroticism";

type SpectrumKey =
  | "openness"
  | "conscientiousness"
  | "extraversion"
  | "agreeableness"
  | "emotionalSensitivity";

type MoralFoundationKey = "care" | "fairness" | "loyalty" | "authority" | "purity";
type ReflectionSignalConfidence = "low" | "medium" | "high";
type AttachmentStrength = "weak" | "moderate" | "strong";
type AttachmentDimension = "anxiety" | "avoidance";
type ValueSignalDirection = "high_priority" | "low_priority";

const TRAIT_KEYS: TraitKey[] = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "neuroticism"
];

const SPECTRUM_KEYS: SpectrumKey[] = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "emotionalSensitivity"
];

const MORAL_FOUNDATION_KEYS: MoralFoundationKey[] = [
  "care",
  "fairness",
  "loyalty",
  "authority",
  "purity"
];

const REFLECTION_CONFIDENCE_VALUES = ["low", "medium", "high"] as const;
const ATTACHMENT_STYLES = ["secure", "preoccupied", "dismissive", "fearful"] as const;
const MEANING_ORIENTATIONS = [
  "meaning_present",
  "meaning_seeking",
  "meaning_ambivalent",
  "meaning_skeptical"
] as const;

export interface VisibleSoulFileUpdate {
  portrait?: string;
  sections?: Partial<VisibleSoulFile["sections"]>;
  crystallizedMoments?: VisibleSoulFile["crystallizedMoments"];
  openThreads?: string[];
  compassScores?: Record<string, number | null>;
  personalitySpectrum?: VisibleSoulFile["personalitySpectrum"];
  topValues?: VisibleSoulFile["topValues"];
  relationalStyle?: string | null;
}

export interface SoulAssessment {
  bigFive: HiddenSoulFile["bigFiveScores"];
  schwartzValues: HiddenSoulFile["schwartzProfile"];
  attachment: HiddenSoulFile["attachmentScores"];
  moralFoundations: HiddenSoulFile["moralFoundations"];
  meaningOrientation: HiddenSoulFile["meaningOrientation"];
  conflictStyle: string;
  coreDrivers: HiddenSoulFile["coreDrivers"];
  coreValues: HiddenSoulFile["coreValues"];
}

// ── Empty constructors ─────────────────────────────────────────

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
      yourContradictions: "",
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
    relationalStyle: null
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
      safeEntryPoints: [],
      unlockTopics: [],
      avoidEarly: [],
      currentlyLiveTopics: [],
      domainCoverage: []
    },
    analystNotes: [],
    bigFiveScores: emptyHiddenBigFiveScores(),
    schwartzProfile: [],
    attachmentScores: { anxiety: null, avoidance: null, style: null, evidence: "" },
    moralFoundations: emptyMoralFoundations(),
    meaningOrientation: null
  };
}

function emptyReflectionNote(): ReflectionNote {
  return {
    updatedAt: new Date().toISOString(),
    factualAnchors: {},
    tensions: [],
    recurringThemes: [],
    notableAbsences: [],
    emotionalArc: "",
    domainCoverage: [],
    recentAssistantQuestions: [],
    openLoops: [],
    inferredBigFive: emptyInferredBigFive(),
    attachmentSignals: [],
    valueSignals: [],
    moralFoundationSignals: [],
    conflictStyle: "",
    meaningOrientation: ""
  };
}

function emptyInferredBigFive(): ReflectionNote["inferredBigFive"] {
  return {
    openness: null,
    conscientiousness: null,
    extraversion: null,
    agreeableness: null,
    neuroticism: null
  };
}

function emptyHiddenBigFiveScores(): HiddenSoulFile["bigFiveScores"] {
  return {
    openness: null,
    conscientiousness: null,
    extraversion: null,
    agreeableness: null,
    neuroticism: null
  };
}

function emptyMoralFoundations(): HiddenSoulFile["moralFoundations"] {
  return {
    care: null,
    fairness: null,
    loyalty: null,
    authority: null,
    purity: null
  };
}

// ── Reflection Prompt (runs async from the full transcript) ──

export function buildReflectionPrompt(
  messages: Array<{ role: string; content: string }>,
  existingNote: ReflectionNote | null,
  messageCount: number
): string {
  const transcript = buildTranscript(messages);
  const existingContext = existingNote
    ? `\nPrevious reflection snapshot:\n${JSON.stringify(existingNote, null, 2)}`
    : "\nNo previous reflection note — this is the first reflection.";

  return `You are analyzing the full transcript of a soul mirror conversation history. Create a concise reflection snapshot grounded in the raw transcript. The transcript is the source of truth.

Current message count: ${messageCount}
${existingContext}

Transcript:
${transcript}

Output a JSON object with these fields:
- "updatedAt": "${new Date().toISOString()}"
- "factualAnchors": object of key→verbatim quote pairs. Things they stated as facts about themselves (job, location, relationships, experiences). Use their exact words as values.
- "tensions": array of strings. Observed contradictions or pulls in different directions.
- "recurringThemes": array of strings. Topics or patterns that keep resurfacing.
- "notableAbsences": array of strings. Things a person like this would usually mention but hasn't. Significant silences.
- "emotionalArc": string. How their emotional state has shifted across the conversation so far. One or two sentences.
- "domainCoverage": array with ALL 7 domains, each including domain, depth, and evidence.
- "recentAssistantQuestions": array of the last few distinct reflective questions Thumos has already asked. Keep them concise and deduplicated.
- "openLoops": array of unresolved threads that would make sense to revisit without repeating yourself.

Additionally, output these psychological signal fields:
- "inferredBigFive": For each of the 5 traits (openness, conscientiousness, extraversion, agreeableness, neuroticism), provide {"score": 0-100, "confidence": "low|medium|high", "evidence": "quote or observation"} or null if insufficient evidence. These are rough running estimates that evolve as more conversation accumulates.
- "attachmentSignals": Array of {"dimension": "anxiety|avoidance", "signal": "...", "strength": "weak|moderate|strong"}.
- "valueSignals": Array of {"value": "Schwartz value name", "evidence": "...", "direction": "high_priority|low_priority"}.
- "moralFoundationSignals": Array of {"foundation": "care|fairness|loyalty|authority|purity", "signal": "..."}.
- "conflictStyle": 1-2 sentences on how they describe handling disagreements. Empty string if no evidence.
- "meaningOrientation": 1-2 sentences on their relationship with meaning or purpose. Empty string if no evidence.

Rules:
- If updating an existing note, evolve it, but correct it whenever the transcript shows it is wrong.
- Keep factualAnchors to verbatim quotes, not paraphrases.
- Maximum 5 tensions, 5 recurringThemes, 3 notableAbsences.
- Maximum 6 recentAssistantQuestions and 6 openLoops.
- Use null or empty fields when evidence is weak.
- Do not invent facts that are not in the transcript.
- Respond with ONLY valid JSON, no markdown, no explanation.`;
}

// ── Multi-call synthesis prompts ──────────────────────────────

export function buildAssessmentPrompt(
  messages: Array<{ role: string; content: string }>,
  reflectionNote: ReflectionNote | null,
  existingHidden: HiddenSoulFile | null
): string {
  const transcript = buildTranscript(messages);
  const reflectionContext = reflectionNote
    ? `Latest reflection snapshot:\n${JSON.stringify(reflectionNote, null, 2)}`
    : "No reflection snapshot yet.";
  const existingHiddenContext = existingHidden
    ? `Existing hidden soul file:\n${JSON.stringify(existingHidden, null, 2)}`
    : "No existing hidden soul file.";

  return `You are a psychometric analyst. Assess personality, values, attachment, moral foundations, and meaning orientation from conversation transcripts. Output valid JSON only.

${reflectionContext}
${existingHiddenContext}

Transcript:
${transcript}

Output JSON:
{
  "bigFive": {
    "openness": { "score": 0-100, "confidence": 0.0-1.0, "evidence": "..." } | null,
    "conscientiousness": { "score": 0-100, "confidence": 0.0-1.0, "evidence": "..." } | null,
    "extraversion": { "score": 0-100, "confidence": 0.0-1.0, "evidence": "..." } | null,
    "agreeableness": { "score": 0-100, "confidence": 0.0-1.0, "evidence": "..." } | null,
    "neuroticism": { "score": 0-100, "confidence": 0.0-1.0, "evidence": "..." } | null
  },
  "schwartzValues": [
    { "value": "Self-Direction", "priority": 1, "evidence": "..." }
  ],
  "attachment": {
    "anxiety": 0-100 | null,
    "avoidance": 0-100 | null,
    "style": "secure|preoccupied|dismissive|fearful" | null,
    "evidence": "..."
  },
  "moralFoundations": {
    "care": 0-100 | null,
    "fairness": 0-100 | null,
    "loyalty": 0-100 | null,
    "authority": 0-100 | null,
    "purity": 0-100 | null
  },
  "meaningOrientation": "meaning_present|meaning_seeking|meaning_ambivalent|meaning_skeptical" | null,
  "conflictStyle": "narrative description",
  "coreDrivers": [{"driver": "name", "strength": 0.0-1.0, "inferred": true, "evidence": "..."}],
  "coreValues": ["value1", "value2"]
}

Rules:
- Use null for any dimension with insufficient evidence.
- Cite specific quotes or behavioral patterns as evidence.
- With under 15 user messages, most scores should be null.
- Big Five: score on the trait itself (0 = low, 100 = high).
- Schwartz: rank by priority (1 = most important to this person).
- Attachment: anxiety = fear of abandonment; avoidance = discomfort with closeness.
- Keep coreDrivers to max 5 and coreValues to max 5.
- Output ONLY valid JSON.`;
}

export function buildVisibleNarrativePrompt(
  messages: Array<{ role: string; content: string }>,
  reflectionNote: ReflectionNote | null,
  assessment: SoulAssessment,
  existingVisible: VisibleSoulFile | null
): string {
  const transcript = buildTranscript(messages);
  const reflectionContext = reflectionNote
    ? `Latest reflection snapshot:\n${JSON.stringify(reflectionNote, null, 2)}`
    : "No reflection snapshot yet.";
  const assessmentContext = `Assessment JSON:\n${JSON.stringify(assessment, null, 2)}`;
  const existingVisibleContext = existingVisible
    ? `Existing visible soul file:\n${JSON.stringify(existingVisible, null, 2)}`
    : "No existing visible soul file.";

  return `You are writing the visible, user-facing soul dashboard for a person based on their conversation history and assessment. This writing must feel accurate, loving, and grounded in their own language.

${reflectionContext}
${assessmentContext}
${existingVisibleContext}

Transcript:
${transcript}

PERSONALITY SPECTRUM:
Each is a bipolar spectrum. Position the user on it (0-100) and write a 1-sentence label in their own language.
- openness: Consistency <-> Curiosity
- conscientiousness: Spontaneity <-> Structure
- extraversion: Solitude <-> Engagement
- agreeableness: Challenge <-> Harmony
- emotionalSensitivity: Calm <-> Sensitive

Output ONE JSON object:
{
  "version": ${(existingVisible?.version ?? 0) + 1},
  "lastUpdated": "${new Date().toISOString()}",
  "portrait": "2-4 sentences in second person",
  "sections": {
    "howYouMove": "...",
    "howYouThink": "...",
    "howYouConnect": "...",
    "whatYouCarry": "...",
    "whatLightsYouUp": "...",
    "yourContradictions": "...",
    "yourVoice": "..."
  },
  "crystallizedMoments": [{"quote": "exact verbatim quote", "reflection": "1-sentence observation"}],
  "openThreads": ["curiosity thread"],
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
  "topValues": [{"value": "Self-Direction", "description": "warm 1-sentence description"}],
  "relationalStyle": "2-3 sentence narrative"
}

Rules:
- CRITICAL: Use second person throughout. Write "you" and "your", never "he/she/they".
- Use their exact words for quotes.
- Keep each section 1-3 sentences, evocative not clinical.
- Only include non-null personality spectrum entries when the assessment has evidence.
- topValues should include at most 3 Schwartz values with warm, human descriptions.
- relationalStyle should be grounded in attachment + conflict style, but should still read warmly.
- Prefer null over guessing on compass scores or spectrum positions.
- Output ONLY valid JSON.`;
}

export function buildHiddenClinicalPrompt(
  messages: Array<{ role: string; content: string }>,
  reflectionNote: ReflectionNote | null,
  assessment: SoulAssessment,
  existingHidden: HiddenSoulFile | null
): string {
  const transcript = buildTranscript(messages);
  const reflectionContext = reflectionNote
    ? `Latest reflection snapshot:\n${JSON.stringify(reflectionNote, null, 2)}`
    : "No reflection snapshot yet.";
  const assessmentContext = `Assessment JSON:\n${JSON.stringify(assessment, null, 2)}`;
  const existingHiddenContext = existingHidden
    ? `Existing hidden soul file:\n${JSON.stringify(existingHidden, null, 2)}`
    : "No existing hidden soul file.";

  const domainCoverageSpec = LIFE_DOMAINS.map((domain) =>
    `    {"domain": "${domain}", "depth": "untouched|mentioned|explored|deep", "evidence": "brief factual note"}`
  ).join(",\n");

  const messageCount = messages.filter((message) => message.role === "user").length;
  const confidenceHint = messageCount < 10 ? "low" : messageCount < 30 ? "medium" : "high";

  return `You are producing the hidden clinical soul file for Thumos. The assessment JSON already did the heavy psychometric lifting. Your job is to organize the deeper private analysis and preserve good steering guidance for future conversations.

${reflectionContext}
${assessmentContext}
${existingHiddenContext}

Transcript:
${transcript}

Output ONE JSON object:
{
  "version": ${(existingHidden?.version ?? 0) + 1},
  "lastUpdated": "${new Date().toISOString()}",
  "confidence": "${confidenceHint}",
  "expertReflections": {
    "psychologist": ["key insight"],
    "sociologist": ["key insight"],
    "linguist": ["key insight"],
    "narrativeAnalyst": ["key insight"]
  },
  "coreDrivers": [{"driver": "name", "strength": 0.0-1.0, "inferred": true, "evidence": "..."}],
  "coreValues": ["value1", "value2"],
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
    "safeEntryPoints": ["topic"],
    "unlockTopics": ["topic"],
    "avoidEarly": ["topic"],
    "currentlyLiveTopics": ["topic"],
    "domainCoverage": [
${domainCoverageSpec}
    ]
  },
  "analystNotes": ["meta note"],
  "bigFiveScores": {
    "openness": { "score": 0-100, "confidence": 0.0-1.0, "evidence": "..." } | null,
    "conscientiousness": { "score": 0-100, "confidence": 0.0-1.0, "evidence": "..." } | null,
    "extraversion": { "score": 0-100, "confidence": 0.0-1.0, "evidence": "..." } | null,
    "agreeableness": { "score": 0-100, "confidence": 0.0-1.0, "evidence": "..." } | null,
    "neuroticism": { "score": 0-100, "confidence": 0.0-1.0, "evidence": "..." } | null
  },
  "schwartzProfile": [{"value": "Self-Direction", "priority": 1, "evidence": "..."}],
  "attachmentScores": {
    "anxiety": 0-100 | null,
    "avoidance": 0-100 | null,
    "style": "secure|preoccupied|dismissive|fearful" | null,
    "evidence": "..."
  },
  "moralFoundations": {
    "care": 0-100 | null,
    "fairness": 0-100 | null,
    "loyalty": 0-100 | null,
    "authority": 0-100 | null,
    "purity": 0-100 | null
  },
  "meaningOrientation": "meaning_present|meaning_seeking|meaning_ambivalent|meaning_skeptical" | null
}

Rules:
- Copy/refine psychometric findings from the assessment rather than reinventing them.
- Rate ALL 7 domains in depthMap.domainCoverage.
- Keep max 5 reflections per lens, 5 coreDrivers, 5 coreValues, 5 analystNotes.
- Prefer null over guessing.
- Output ONLY valid JSON.`;
}

// ── Parsers ────────────────────────────────────────────────────

export function parseAssessment(raw: string): SoulAssessment | null {
  const parsed = parseJsonObject(raw);
  if (!parsed) return null;

  return {
    bigFive: parseHiddenBigFiveScores(parsed.bigFive),
    schwartzValues: parseSchwartzProfile(parsed.schwartzValues),
    attachment: parseAttachmentScores(parsed.attachment),
    moralFoundations: parseMoralFoundations(parsed.moralFoundations),
    meaningOrientation: parseMeaningOrientation(parsed.meaningOrientation),
    conflictStyle: safeString(parsed.conflictStyle, 300),
    coreDrivers: parseCoreDrivers(parsed.coreDrivers, 5),
    coreValues: safeStringArray(parsed.coreValues, 5, 100)
  };
}

export function parseVisibleNarrative(raw: string): VisibleSoulFile | null {
  const parsed = parseJsonObject(raw);
  if (!parsed) return null;
  return parseVisibleSoulFileObject(parsed);
}

export function parseHiddenClinical(raw: string): HiddenSoulFile | null {
  const parsed = parseJsonObject(raw);
  if (!parsed) return null;
  return parseHiddenSoulFileObject(parsed);
}

export function parseReflectionNote(raw: string): ReflectionNote | null {
  const parsed = parseJsonObject(raw);
  if (!parsed) return null;

  const note = emptyReflectionNote();
  note.updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString();

  if (isRecord(parsed.factualAnchors)) {
    for (const [key, value] of Object.entries(parsed.factualAnchors)) {
      if (typeof value === "string") {
        note.factualAnchors[key] = value.slice(0, 300);
      }
    }
  }

  note.tensions = safeStringArray(parsed.tensions, 5, 300);
  note.recurringThemes = safeStringArray(parsed.recurringThemes, 5, 200);
  note.notableAbsences = safeStringArray(parsed.notableAbsences, 3, 200);
  note.emotionalArc = safeString(parsed.emotionalArc, 500);
  note.domainCoverage = parseDomainCoverage(parsed.domainCoverage);
  note.recentAssistantQuestions = safeStringArray(parsed.recentAssistantQuestions, 6, 300);
  note.openLoops = safeStringArray(parsed.openLoops, 6, 300);
  note.inferredBigFive = parseInferredBigFive(parsed.inferredBigFive);
  note.attachmentSignals = parseAttachmentSignals(parsed.attachmentSignals);
  note.valueSignals = parseValueSignals(parsed.valueSignals);
  note.moralFoundationSignals = parseMoralFoundationSignals(parsed.moralFoundationSignals);
  note.conflictStyle = safeString(parsed.conflictStyle, 300);
  note.meaningOrientation = safeString(parsed.meaningOrientation, 300);

  return note;
}

// ── Merge Functions ────────────────────────────────────────────

export function mergeVisibleSoulFile(
  existing: VisibleSoulFile | null,
  update: VisibleSoulFileUpdate
): VisibleSoulFile {
  const base = existing ?? emptyVisibleSoulFile();

  const merged: VisibleSoulFile = {
    ...base,
    version: base.version + 1,
    lastUpdated: new Date().toISOString()
  };

  if (update.portrait) {
    merged.portrait = update.portrait;
  }

  if (update.sections) {
    merged.sections = {
      ...base.sections,
      ...Object.fromEntries(
        Object.entries(update.sections).filter(([, value]) => typeof value === "string" && value.trim().length > 0)
      )
    } as VisibleSoulFile["sections"];
  }

  if (update.crystallizedMoments && update.crystallizedMoments.length > 0) {
    const existingQuotes = new Set(base.crystallizedMoments.map((moment) => moment.quote.toLowerCase().trim()));
    const newMoments = update.crystallizedMoments.filter(
      (moment) => !existingQuotes.has(moment.quote.toLowerCase().trim())
    );
    merged.crystallizedMoments = [...base.crystallizedMoments, ...newMoments].slice(-10);
  }

  if (update.openThreads) {
    merged.openThreads = update.openThreads.slice(0, 5);
  }

  if (update.compassScores && Object.keys(update.compassScores).length > 0) {
    const baseScores = base.compassScores ?? {};
    merged.compassScores = { ...baseScores };
    for (const [axis, score] of Object.entries(update.compassScores)) {
      if (score !== null) {
        merged.compassScores[axis] = score;
      }
    }
  }

  if (update.personalitySpectrum) {
    const nextSpectrum = { ...base.personalitySpectrum };
    for (const key of SPECTRUM_KEYS) {
      const incoming = update.personalitySpectrum[key];
      if (incoming) {
        nextSpectrum[key] = incoming;
      }
    }
    merged.personalitySpectrum = nextSpectrum;
  }

  if (update.topValues && update.topValues.length > 0) {
    merged.topValues = update.topValues.slice(0, 3);
  }

  if (update.relationalStyle !== undefined && update.relationalStyle !== null && update.relationalStyle.trim().length > 0) {
    merged.relationalStyle = update.relationalStyle;
  }

  return merged;
}

export function mergeHiddenSoulFile(
  existing: HiddenSoulFile | null,
  update: HiddenSoulFile
): HiddenSoulFile {
  const base = existing ?? emptyHiddenSoulFile();

  return {
    ...update,
    version: base.version + 1,
    lastUpdated: new Date().toISOString(),
    expertReflections: {
      psychologist: mergeStringArrays(base.expertReflections.psychologist, update.expertReflections.psychologist, 10),
      sociologist: mergeStringArrays(base.expertReflections.sociologist, update.expertReflections.sociologist, 10),
      linguist: mergeStringArrays(base.expertReflections.linguist, update.expertReflections.linguist, 10),
      narrativeAnalyst: mergeStringArrays(base.expertReflections.narrativeAnalyst, update.expertReflections.narrativeAnalyst, 10)
    },
    coreDrivers: mergeCoreDrivers(base.coreDrivers, update.coreDrivers),
    coreValues: mergeStringArrays(base.coreValues, update.coreValues, 10),
    analystNotes: mergeStringArrays(base.analystNotes, update.analystNotes, 10),
    bigFiveScores: mergeHiddenBigFiveScores(base.bigFiveScores, update.bigFiveScores),
    schwartzProfile: update.schwartzProfile.length > 0 ? update.schwartzProfile : base.schwartzProfile,
    attachmentScores: mergeAttachmentScores(base.attachmentScores, update.attachmentScores),
    moralFoundations: mergeMoralFoundations(base.moralFoundations, update.moralFoundations),
    meaningOrientation: update.meaningOrientation ?? base.meaningOrientation
  };
}

// ── Internal parsers and helpers ──────────────────────────────

function buildTranscript(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map((message) => `${message.role === "assistant" ? "Thumos" : "User"}: ${message.content}`)
    .join("\n");
}

function parseVisibleSoulFileObject(parsed: Record<string, unknown>): VisibleSoulFile {
  const base = emptyVisibleSoulFile();

  return {
    version: typeof parsed.version === "number" ? parsed.version : base.version,
    lastUpdated: typeof parsed.lastUpdated === "string" ? parsed.lastUpdated : new Date().toISOString(),
    portrait: typeof parsed.portrait === "string" ? parsed.portrait.slice(0, 500) : base.portrait,
    sections: {
      howYouMove: safeString(getNested(parsed, "sections", "howYouMove"), 500),
      howYouThink: safeString(getNested(parsed, "sections", "howYouThink"), 500),
      howYouConnect: safeString(getNested(parsed, "sections", "howYouConnect"), 500),
      whatYouCarry: safeString(getNested(parsed, "sections", "whatYouCarry"), 500),
      whatLightsYouUp: safeString(getNested(parsed, "sections", "whatLightsYouUp"), 500),
      yourContradictions: safeString(getNested(parsed, "sections", "yourContradictions"), 500),
      yourVoice: safeString(getNested(parsed, "sections", "yourVoice"), 500)
    },
    crystallizedMoments: parseCrystallizedMoments(parsed.crystallizedMoments),
    openThreads: safeStringArray(parsed.openThreads, 5, 200),
    compassScores: parseCompassScores(parsed.compassScores),
    personalitySpectrum: parsePersonalitySpectrum(parsed.personalitySpectrum),
    topValues: parseTopValues(parsed.topValues),
    relationalStyle: parseNullableString(parsed.relationalStyle, 500)
  };
}

function parseHiddenSoulFileObject(parsed: Record<string, unknown>): HiddenSoulFile {
  const base = emptyHiddenSoulFile();

  return {
    version: typeof parsed.version === "number" ? parsed.version : base.version,
    lastUpdated: typeof parsed.lastUpdated === "string" ? parsed.lastUpdated : new Date().toISOString(),
    confidence: parseConfidenceTag(parsed.confidence) ?? base.confidence,
    expertReflections: {
      psychologist: safeStringArray(getNested(parsed, "expertReflections", "psychologist"), 5, 300),
      sociologist: safeStringArray(getNested(parsed, "expertReflections", "sociologist"), 5, 300),
      linguist: safeStringArray(getNested(parsed, "expertReflections", "linguist"), 5, 300),
      narrativeAnalyst: safeStringArray(getNested(parsed, "expertReflections", "narrativeAnalyst"), 5, 300)
    },
    coreDrivers: parseCoreDrivers(parsed.coreDrivers, 5),
    coreValues: safeStringArray(parsed.coreValues, 5, 100),
    voice: {
      register: parseEnumValue(getNested(parsed, "voice", "register"), ["formal", "casual", "chameleon"]) ?? "casual",
      density: parseEnumValue(getNested(parsed, "voice", "density"), ["sparse", "moderate", "dense"]) ?? "moderate",
      humorStyle: safeString(getNested(parsed, "voice", "humorStyle"), 200),
      conflictStyle: safeString(getNested(parsed, "voice", "conflictStyle"), 200),
      disclosureRate: parseEnumValue(getNested(parsed, "voice", "disclosureRate"), ["guarded", "gradual", "open", "floods"]) ?? "gradual",
      signaturePatterns: safeStringArray(getNested(parsed, "voice", "signaturePatterns"), 5, 200),
      voiceExamples: parseVoiceExamples(getNested(parsed, "voice", "voiceExamples"))
    },
    depthMap: {
      safeEntryPoints: safeStringArray(getNested(parsed, "depthMap", "safeEntryPoints"), 5, 200),
      unlockTopics: safeStringArray(getNested(parsed, "depthMap", "unlockTopics"), 5, 200),
      avoidEarly: safeStringArray(getNested(parsed, "depthMap", "avoidEarly"), 5, 200),
      currentlyLiveTopics: safeStringArray(getNested(parsed, "depthMap", "currentlyLiveTopics"), 5, 200),
      domainCoverage: parseDomainCoverage(getNested(parsed, "depthMap", "domainCoverage"))
    },
    analystNotes: safeStringArray(parsed.analystNotes, 5, 300),
    bigFiveScores: parseHiddenBigFiveScores(parsed.bigFiveScores),
    schwartzProfile: parseSchwartzProfile(parsed.schwartzProfile),
    attachmentScores: parseAttachmentScores(parsed.attachmentScores),
    moralFoundations: parseMoralFoundations(parsed.moralFoundations),
    meaningOrientation: parseMeaningOrientation(parsed.meaningOrientation)
  };
}

function parseCrystallizedMoments(value: unknown): VisibleSoulFile["crystallizedMoments"] {
  return safeArray(value)
    .filter((item): item is { quote: string; reflection: string } =>
      typeof item.quote === "string" && typeof item.reflection === "string"
    )
    .slice(0, 10)
    .map((item) => ({
      quote: item.quote.slice(0, 200),
      reflection: item.reflection.slice(0, 200)
    }));
}

function parseVoiceExamples(value: unknown): HiddenSoulFile["voice"]["voiceExamples"] {
  return safeArray(value)
    .filter((item): item is { trigger: string; response: string } =>
      typeof item.trigger === "string" && typeof item.response === "string"
    )
    .slice(0, 3)
    .map((item) => ({
      trigger: item.trigger.slice(0, 200),
      response: item.response.slice(0, 200)
    }));
}

function parseCoreDrivers(value: unknown, maxItems: number): HiddenSoulFile["coreDrivers"] {
  return safeArray(value)
    .filter((item): item is { driver: string; strength: number; inferred?: boolean; evidence?: unknown } =>
      typeof item.driver === "string" && typeof item.strength === "number"
    )
    .slice(0, maxItems)
    .map((item) => ({
      driver: item.driver.slice(0, 100),
      strength: clamp(item.strength, 0, 1),
      inferred: typeof item.inferred === "boolean" ? item.inferred : true,
      evidence: safeString(item.evidence, 300)
    }));
}

function parseCompassScores(raw: unknown): Record<string, number | null> {
  const scores: Record<string, number | null> = {};
  if (!isRecord(raw)) return scores;

  const compassAxes = [
    "openness",
    "vitality",
    "warmth",
    "depth",
    "purpose",
    "resilience",
    "autonomy",
    "connection"
  ];

  for (const axis of compassAxes) {
    const value = raw[axis];
    if (value === null || value === undefined) {
      scores[axis] = null;
      continue;
    }
    if (typeof value === "number" && value >= 0 && value <= 100) {
      scores[axis] = Math.round(value);
      continue;
    }
    scores[axis] = null;
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

function parseSpectrumEntry(value: unknown): VisibleSoulFile["personalitySpectrum"][SpectrumKey] {
  if (!isRecord(value)) return null;
  if (typeof value.position !== "number") return null;
  return {
    position: clamp(value.position, 0, 100),
    label: safeString(value.label, 200),
    evidence: safeString(value.evidence, 200)
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
      description: item.description.slice(0, 200)
    }));
}

function parseInferredBigFive(value: unknown): ReflectionNote["inferredBigFive"] {
  const parsed = isRecord(value) ? value : {};
  return {
    openness: parseInferredTrait(parsed.openness),
    conscientiousness: parseInferredTrait(parsed.conscientiousness),
    extraversion: parseInferredTrait(parsed.extraversion),
    agreeableness: parseInferredTrait(parsed.agreeableness),
    neuroticism: parseInferredTrait(parsed.neuroticism)
  };
}

function parseInferredTrait(value: unknown): ReflectionNote["inferredBigFive"][TraitKey] {
  if (!isRecord(value) || typeof value.score !== "number") return null;
  const confidence = parseEnumValue(value.confidence, REFLECTION_CONFIDENCE_VALUES);
  if (!confidence) return null;
  return {
    score: clamp(value.score, 0, 100),
    confidence,
    evidence: safeString(value.evidence, 200)
  };
}

function parseHiddenBigFiveScores(value: unknown): HiddenSoulFile["bigFiveScores"] {
  const parsed = isRecord(value) ? value : {};
  return {
    openness: parseHiddenTrait(parsed.openness),
    conscientiousness: parseHiddenTrait(parsed.conscientiousness),
    extraversion: parseHiddenTrait(parsed.extraversion),
    agreeableness: parseHiddenTrait(parsed.agreeableness),
    neuroticism: parseHiddenTrait(parsed.neuroticism)
  };
}

function parseHiddenTrait(value: unknown): HiddenSoulFile["bigFiveScores"][TraitKey] {
  if (!isRecord(value) || typeof value.score !== "number" || typeof value.confidence !== "number") {
    return null;
  }
  return {
    score: clamp(value.score, 0, 100),
    confidence: clamp(value.confidence, 0, 1),
    evidence: safeString(value.evidence, 200)
  };
}

function parseAttachmentSignals(value: unknown): ReflectionNote["attachmentSignals"] {
  return safeArray(value)
    .filter((item): item is { dimension: AttachmentDimension; signal: string; strength: AttachmentStrength } =>
      parseEnumValue(item.dimension, ["anxiety", "avoidance"] as const) !== null
      && typeof item.signal === "string"
      && parseEnumValue(item.strength, ["weak", "moderate", "strong"] as const) !== null
    )
    .slice(0, 8)
    .map((item) => ({
      dimension: item.dimension as AttachmentDimension,
      signal: item.signal.slice(0, 200),
      strength: item.strength as AttachmentStrength
    }));
}

function parseValueSignals(value: unknown): ReflectionNote["valueSignals"] {
  return safeArray(value)
    .filter((item): item is { value: string; evidence: string; direction: ValueSignalDirection } =>
      typeof item.value === "string"
      && typeof item.evidence === "string"
      && parseEnumValue(item.direction, ["high_priority", "low_priority"] as const) !== null
    )
    .slice(0, 10)
    .map((item) => ({
      value: item.value.slice(0, 100),
      evidence: item.evidence.slice(0, 200),
      direction: item.direction as ValueSignalDirection
    }));
}

function parseMoralFoundationSignals(value: unknown): ReflectionNote["moralFoundationSignals"] {
  return safeArray(value)
    .filter((item): item is { foundation: MoralFoundationKey; signal: string } =>
      parseEnumValue(item.foundation, MORAL_FOUNDATION_KEYS) !== null
      && typeof item.signal === "string"
    )
    .slice(0, 10)
    .map((item) => ({
      foundation: item.foundation as MoralFoundationKey,
      signal: item.signal.slice(0, 200)
    }));
}

function parseSchwartzProfile(value: unknown): HiddenSoulFile["schwartzProfile"] {
  return safeArray(value)
    .filter((item): item is { value: string; priority: number; evidence?: unknown } =>
      typeof item.value === "string" && typeof item.priority === "number"
    )
    .slice(0, 10)
    .map((item) => ({
      value: item.value.slice(0, 100),
      priority: Math.max(1, Math.min(10, Math.round(item.priority))),
      evidence: safeString(item.evidence, 200)
    }))
    .sort((a, b) => a.priority - b.priority);
}

function parseAttachmentScores(value: unknown): HiddenSoulFile["attachmentScores"] {
  if (!isRecord(value)) {
    return { anxiety: null, avoidance: null, style: null, evidence: "" };
  }

  const style = parseEnumValue(value.style, ATTACHMENT_STYLES) ?? null;
  return {
    anxiety: typeof value.anxiety === "number" ? clamp(value.anxiety, 0, 100) : null,
    avoidance: typeof value.avoidance === "number" ? clamp(value.avoidance, 0, 100) : null,
    style,
    evidence: safeString(value.evidence, 300)
  };
}

function parseMoralFoundations(value: unknown): HiddenSoulFile["moralFoundations"] {
  const parsed = isRecord(value) ? value : {};
  return {
    care: parseNullableScore(parsed.care),
    fairness: parseNullableScore(parsed.fairness),
    loyalty: parseNullableScore(parsed.loyalty),
    authority: parseNullableScore(parsed.authority),
    purity: parseNullableScore(parsed.purity)
  };
}

function parseMeaningOrientation(value: unknown): HiddenSoulFile["meaningOrientation"] {
  return parseEnumValue(value, MEANING_ORIENTATIONS) ?? null;
}

function parseNullableScore(value: unknown): number | null {
  return typeof value === "number" ? clamp(value, 0, 100) : null;
}

function parseDomainCoverage(value: unknown): DomainCoverageEntry[] {
  return safeArray(value)
    .filter((item): item is { domain: string; depth: DomainCoverageEntry["depth"]; evidence?: unknown } =>
      typeof item.domain === "string"
      && parseEnumValue(item.depth, ["untouched", "mentioned", "explored", "deep"] as const) !== null
    )
    .slice(0, 7)
    .map((item) => ({
      domain: item.domain.slice(0, 50),
      depth: item.depth as DomainCoverageEntry["depth"],
      evidence: safeString(item.evidence, 200)
    }));
}

function mergeStringArrays(existing: string[], incoming: string[], maxItems: number): string[] {
  const seen = new Set(existing.map((value) => value.toLowerCase().trim()));
  const merged = [...existing];
  for (const value of incoming) {
    const normalized = value.toLowerCase().trim();
    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(value);
  }
  return merged.slice(-maxItems);
}

function mergeCoreDrivers(
  existing: HiddenSoulFile["coreDrivers"],
  incoming: HiddenSoulFile["coreDrivers"]
): HiddenSoulFile["coreDrivers"] {
  const drivers = new Map(existing.map((driver) => [driver.driver.toLowerCase(), driver]));
  for (const driver of incoming) {
    drivers.set(driver.driver.toLowerCase(), driver);
  }
  return [...drivers.values()].slice(0, 10);
}

function mergeHiddenBigFiveScores(
  existing: HiddenSoulFile["bigFiveScores"],
  incoming: HiddenSoulFile["bigFiveScores"]
): HiddenSoulFile["bigFiveScores"] {
  const merged = { ...existing };
  for (const key of TRAIT_KEYS) {
    if (incoming[key]) {
      merged[key] = incoming[key];
    }
  }
  return merged;
}

function mergeAttachmentScores(
  existing: HiddenSoulFile["attachmentScores"],
  incoming: HiddenSoulFile["attachmentScores"]
): HiddenSoulFile["attachmentScores"] {
  return {
    anxiety: incoming.anxiety ?? existing.anxiety,
    avoidance: incoming.avoidance ?? existing.avoidance,
    style: incoming.style ?? existing.style,
    evidence: incoming.evidence || existing.evidence
  };
}

function mergeMoralFoundations(
  existing: HiddenSoulFile["moralFoundations"],
  incoming: HiddenSoulFile["moralFoundations"]
): HiddenSoulFile["moralFoundations"] {
  const merged = { ...existing };
  for (const key of MORAL_FOUNDATION_KEYS) {
    if (incoming[key] !== null) {
      merged[key] = incoming[key];
    }
  }
  return merged;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getNested(value: Record<string, unknown>, ...keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    if (!isRecord(current) || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function parseConfidenceTag(value: unknown): HiddenSoulFile["confidence"] | null {
  return parseEnumValue(value, ["low", "medium", "high"] as const) ?? null;
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
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLen));
}

function safeArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => isRecord(item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseEnumValue<const T extends readonly string[]>(
  value: unknown,
  options: T
): T[number] | null {
  return typeof value === "string" && (options as readonly string[]).includes(value)
    ? value as T[number]
    : null;
}

export function buildVisibleSoulFileContext(visible: VisibleSoulFile): string {
  const parts: string[] = [];

  if (visible.portrait) {
    parts.push(`Portrait: ${visible.portrait}`);
  }

  if (visible.relationalStyle) {
    parts.push(`Relational style: ${visible.relationalStyle}`);
  }

  if (visible.topValues.length > 0) {
    parts.push(`Top values: ${visible.topValues.map((value) => `${value.value} (${value.description})`).join("; ")}`);
  }

  if (Object.values(visible.sections).some((section) => section.length > 0)) {
    parts.push(`Sections: ${JSON.stringify(visible.sections)}`);
  }

  if (visible.crystallizedMoments.length > 0) {
    parts.push(`Crystallized moments: ${visible.crystallizedMoments.map((moment) => `"${moment.quote}" — ${moment.reflection}`).join(" | ")}`);
  }

  if (visible.openThreads.length > 0) {
    parts.push(`Open threads: ${visible.openThreads.join("; ")}`);
  }

  if (Object.values(visible.compassScores ?? {}).some((score) => score !== null)) {
    parts.push(`Compass scores: ${JSON.stringify(visible.compassScores)}`);
  }

  const nonNullSpectrum = SPECTRUM_KEYS
    .map((key) => visible.personalitySpectrum[key])
    .filter((entry): entry is NonNullable<typeof visible.personalitySpectrum[SpectrumKey]> => entry !== null);
  if (nonNullSpectrum.length > 0) {
    parts.push(`Personality spectrum: ${JSON.stringify(visible.personalitySpectrum)}`);
  }

  return parts.length > 0 ? parts.join("\n") : "No soul file yet.";
}

export function describeDomainCoverage(coverage: DomainCoverageEntry[]): string {
  if (coverage.length === 0) {
    return "No domain coverage yet.";
  }

  return coverage
    .map((entry) => `${DOMAIN_LABELS[entry.domain as keyof typeof DOMAIN_LABELS] ?? entry.domain}: ${entry.depth}${entry.evidence ? ` (${entry.evidence})` : ""}`)
    .join("\n");
}
