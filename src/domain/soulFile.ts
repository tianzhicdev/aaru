import type {
  VisibleSoulFile,
  HiddenSoulFile,
  ReflectionNote,
  DomainCoverageEntry
} from "./schemas.ts";
import { LIFE_DOMAINS, DOMAIN_LABELS } from "./schemas.ts";

// ── Visible Soul File Update ──

export interface VisibleSoulFileUpdate {
  portrait?: string;
  sections?: Partial<VisibleSoulFile["sections"]>;
  crystallizedMoments?: Array<{ quote: string; reflection: string }>;
  openThreads?: string[];
  compassScores?: Record<string, number | null>;
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
    compassScores: {}
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
    analystNotes: []
  };
}


// ── Reflection Prompt (runs mid-conversation at REFLECTION_INTERVAL) ──

export function buildReflectionPrompt(
  messages: Array<{ role: string; content: string }>,
  existingNote: ReflectionNote | null,
  exchangeCount: number
): string {
  const transcript = messages
    .map((m) => `${m.role === "assistant" ? "Thumos" : "User"}: ${m.content}`)
    .join("\n");

  const existingContext = existingNote
    ? `\nPrevious reflection note:\n${JSON.stringify(existingNote, null, 2)}`
    : "\nNo previous reflection note — this is the first reflection.";

  return `You are analyzing a soul mirror conversation in progress. Create a running synthesis of what you've observed so far.

Current exchange count: ${exchangeCount}
${existingContext}

Transcript:
${transcript}

Output a JSON object with these fields:
- "updatedAtExchange": ${exchangeCount}
- "factualAnchors": object of key→verbatim quote pairs. Things they stated as facts about themselves (job, location, relationships, experiences). Use their exact words as values.
- "tensions": array of strings. Observed contradictions or pulls in different directions. E.g. "Says they love solitude but their happiest memory involves a crowd."
- "recurringThemes": array of strings. Topics or patterns that keep resurfacing.
- "notableAbsences": array of strings. Things a person like this would usually mention but hasn't. Significant silences.
- "emotionalArc": string. How their emotional state has shifted across the conversation so far. One or two sentences.

Rules:
- If updating an existing note, EVOLVE it — don't start over. Add new anchors, note new tensions, track theme evolution.
- Keep factualAnchors to verbatim quotes, not paraphrases.
- Maximum 5 tensions, 5 themes, 3 absences.
- Respond with ONLY valid JSON, no markdown, no explanation.`;
}

// ── Light Visible Extraction (runs alongside reflection, updates portrait + moments) ──

export function buildLightVisiblePrompt(
  messages: Array<{ role: string; content: string }>,
  existingVisible: VisibleSoulFile | null,
  reflectionNote: ReflectionNote | null,
  sessionNumber: number
): string {
  const transcript = messages
    .map((m) => `${m.role === "assistant" ? "Thumos" : "User"}: ${m.content}`)
    .join("\n");

  const existingContext = existingVisible
    ? `\nExisting portrait: ${existingVisible.portrait ?? "(none)"}
Existing crystallized moments: ${JSON.stringify(existingVisible.crystallizedMoments)}`
    : "\nNo existing soul file — this is the first session.";

  const reflectionContext = reflectionNote
    ? `\nCurrent reflection note: ${JSON.stringify(reflectionNote)}`
    : "";

  return `You are updating a soul file during an active conversation (session ${sessionNumber}).
${existingContext}
${reflectionContext}

Transcript:
${transcript}

Output a JSON object with these fields (include only fields with new information):
- "portrait": A 2-4 sentence novel-like portrait of who this person is. Written in second person (you/your), using their own metaphors and language. Not a diagnosis — a mirror. Evocative, not clinical.
- "crystallizedMoments": Array of {quote, reflection} pairs. Quote is their exact words (verbatim). Reflection is a 1-sentence observation about what that quote reveals. Max 2 new moments.
- "openThreads": Array of strings. Curiosity threads — things left unexplored, questions left hanging, topics they circled but didn't enter. Max 3.

Rules:
- Use their EXACT words for quotes.
- Portrait should be lyrical but grounded. Think novel character description, not personality test.
- If updating an existing portrait, evolve it — integrate new understanding without losing what was already captured.
- Keep portrait under 400 characters.
- Respond with ONLY valid JSON, no markdown, no explanation.`;
}

// ── Soul Synthesis Prompt (full synthesis, user-triggered) ──

export function buildSoulSynthesisPrompt(
  messages: Array<{ role: string; content: string }>,
  reflectionNote: ReflectionNote | null,
  existingVisible: VisibleSoulFile | null,
  existingHidden: HiddenSoulFile | null
): string {
  const transcript = messages
    .map((m) => `${m.role === "assistant" ? "Thumos" : "User"}: ${m.content}`)
    .join("\n");

  const reflectionContext = reflectionNote
    ? `\nCurrent reflection note (rolling memory):\n${JSON.stringify(reflectionNote, null, 2)}`
    : "\nNo reflection note yet.";

  const existingVisibleContext = existingVisible
    ? `\nExisting visible soul file:\n${JSON.stringify(existingVisible, null, 2)}`
    : "\nNo existing visible soul file.";

  const existingHiddenContext = existingHidden
    ? `\nExisting hidden soul file:\n${JSON.stringify(existingHidden, null, 2)}`
    : "\nNo existing hidden soul file.";

  const domainCoverageSpec = LIFE_DOMAINS.map(d =>
    `    {"domain": "${d}", "depth": "untouched|mentioned|explored|deep", "evidence": "brief factual note"}`
  ).join(",\n");

  const messageCount = messages.filter(m => m.role === "user").length;
  const confidenceHint = messageCount < 10 ? "low" : messageCount < 30 ? "medium" : "high";

  return `You are conducting a deep analysis of soul mirror conversations to build a comprehensive soul file. This covers ALL conversations this person has had.

You will analyze the transcript through 4 expert lenses, then synthesize into two outputs.
${reflectionContext}
${existingVisibleContext}
${existingHiddenContext}

Transcript (${messages.length} messages):
${transcript}

## ANALYSIS PROCEDURE

### Pass 1: Psychologist
Analyze emotional patterns, defense mechanisms, attachment style, core fears, desires, and emotional regulation. What are they protecting? What do they crave?

### Pass 2: Sociologist
Analyze identity construction, group positioning, status negotiations, cultural references, and how they position themselves relative to others. Where do they belong? Where do they feel like outsiders?

### Pass 3: Linguist
Analyze metaphor usage, vocabulary density, sentence structure, hedging patterns, humor style, and signature phrases. What does their language reveal about their inner world?

### Pass 4: Narrative Analyst
Analyze the story arc they're constructing. What role are they casting themselves in? What's the protagonist's journey? Where are the turning points? What narrative are they building?

## OUTPUT FORMAT

After your 4-pass analysis, output TWO JSON objects separated by <<<SPLIT>>>.

### FIRST: VisibleSoulFile (user-facing, poetic)
{
  "version": ${(existingVisible?.version ?? 0) + 1},
  "lastUpdated": "${new Date().toISOString()}",
  "portrait": "2-4 sentences. Novel-like. MUST use second person (you/your, never he/she/they). Uses their metaphors.",
  "sections": {
    "howYouMove": "How you move through the world — your energy, pace, relationship to space and time.",
    "howYouThink": "How your mind works — patterns, associations, what catches your attention.",
    "howYouConnect": "How you relate to others — attachment, trust, vulnerability, boundaries.",
    "whatYouCarry": "What weight you bear — responsibilities, past, fears, inherited patterns.",
    "whatLightsYouUp": "What ignites you — flow states, passions, moments of aliveness.",
    "yourContradictions": "Where you pull in two directions at once. Written as prose, not labels.",
    "yourVoice": "How you sound — your register, rhythm, humor, the shape of your sentences."
  },
  "crystallizedMoments": [{"quote": "exact verbatim quote", "reflection": "1-sentence observation"}],
  "openThreads": ["curiosity threads left unexplored"],
  "compassScores": {
    "openness": 0-100 or null,
    "vitality": 0-100 or null,
    "warmth": 0-100 or null,
    "depth": 0-100 or null,
    "purpose": 0-100 or null,
    "resilience": 0-100 or null,
    "autonomy": 0-100 or null,
    "connection": 0-100 or null
  }
}

### SECOND: HiddenSoulFile (agent-facing, clinical)
{
  "version": ${(existingHidden?.version ?? 0) + 1},
  "lastUpdated": "${new Date().toISOString()}",
  "confidence": "${confidenceHint}",
  "expertReflections": {
    "psychologist": ["key insight 1", "key insight 2"],
    "sociologist": ["key insight 1"],
    "linguist": ["key insight 1"],
    "narrativeAnalyst": ["key insight 1"]
  },
  "coreDrivers": [{"driver": "name", "strength": 0.0-1.0, "inferred": true/false, "evidence": "quote or observation"}],
  "coreValues": ["value1", "value2"],
  "voice": {
    "register": "formal|casual|chameleon",
    "density": "sparse|moderate|dense",
    "humorStyle": "description",
    "conflictStyle": "description",
    "disclosureRate": "guarded|gradual|open|floods",
    "signaturePatterns": ["pattern1"],
    "voiceExamples": [{"trigger": "context", "response": "their typical response pattern"}]
  },
  "depthMap": {
    "safeEntryPoints": ["topics they open up about easily"],
    "unlockTopics": ["topics that lead to deeper disclosure"],
    "avoidEarly": ["topics to approach carefully"],
    "currentlyLiveTopics": ["what's active in their mind right now"],
    "domainCoverage": [
${domainCoverageSpec}
    ]
  },
  "analystNotes": ["meta-observations about the analysis itself"]
}

## COMPASS SCORING
Score each dimension 0-100 based on evidence from the transcript and soul file.
Use null if insufficient evidence (prefer null over guessing).
- openness: intellectual curiosity, receptivity to new ideas, willingness to explore
- vitality: energy, engagement with life, enthusiasm, aliveness
- warmth: empathy, care for others, emotional generosity
- depth: reflective capacity, comfort with complexity, philosophical tendency
- purpose: sense of direction, meaning-making, values clarity
- resilience: adaptability, recovery from setbacks, emotional regulation
- autonomy: self-direction, independent thinking, personal agency
- connection: desire for belonging, relational investment, community orientation
With few messages, most scores should be null — only score what you have clear evidence for.

## RULES
- CRITICAL: The VisibleSoulFile MUST use second person throughout. Write "you" and "your", NEVER "he/she/they/him/her/his". The reader IS the person. "You move through the world like..." not "He moves through..."
- Use their EXACT words for all quotes.
- Each section should be 1-3 sentences, evocative not clinical.
- If evolving existing files, integrate new understanding — don't discard previous insights.
- Rate ALL 7 domains in domainCoverage. Prioritize factual evidence over tonal observations.
- Max 5 core drivers, 5 core values, 5 expert reflections per lens.
- Output ONLY the two JSON objects separated by <<<SPLIT>>>. No other text.`;
}

// ── Compass Score Helpers ────────────────────────────────────────

const COMPASS_AXES = ["openness", "vitality", "warmth", "depth", "purpose", "resilience", "autonomy", "connection"] as const;

function parseCompassScores(raw: unknown): Record<string, number | null> {
  const scores: Record<string, number | null> = {};
  if (typeof raw !== "object" || raw === null) return scores;
  for (const axis of COMPASS_AXES) {
    const val = (raw as Record<string, unknown>)[axis];
    if (val === null || val === undefined) {
      scores[axis] = null;
    } else if (typeof val === "number" && val >= 0 && val <= 100) {
      scores[axis] = Math.round(val);
    } else {
      scores[axis] = null;
    }
  }
  return scores;
}

// ── Parsers ────────────────────────────────────────────────────

export function parseSoulSynthesis(raw: string): { visible: VisibleSoulFile; hidden: HiddenSoulFile } | null {
  try {
    const parts = raw.split("<<<SPLIT>>>");
    if (parts.length < 2) return null;

    const visibleRaw = parts[0].replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const hiddenRaw = parts[1].replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    const visibleParsed = JSON.parse(visibleRaw);
    const hiddenParsed = JSON.parse(hiddenRaw);

    // Validate and construct VisibleSoulFile
    const visible: VisibleSoulFile = {
      version: typeof visibleParsed.version === "number" ? visibleParsed.version : 1,
      lastUpdated: typeof visibleParsed.lastUpdated === "string" ? visibleParsed.lastUpdated : new Date().toISOString(),
      portrait: typeof visibleParsed.portrait === "string" ? visibleParsed.portrait.slice(0, 500) : null,
      sections: {
        howYouMove: safeString(visibleParsed.sections?.howYouMove, 500),
        howYouThink: safeString(visibleParsed.sections?.howYouThink, 500),
        howYouConnect: safeString(visibleParsed.sections?.howYouConnect, 500),
        whatYouCarry: safeString(visibleParsed.sections?.whatYouCarry, 500),
        whatLightsYouUp: safeString(visibleParsed.sections?.whatLightsYouUp, 500),
        yourContradictions: safeString(visibleParsed.sections?.yourContradictions, 500),
        yourVoice: safeString(visibleParsed.sections?.yourVoice, 500)
      },
      crystallizedMoments: safeArray(visibleParsed.crystallizedMoments)
        .filter((m) => typeof m.quote === "string" && typeof m.reflection === "string")
        .slice(0, 10)
        .map((m) => ({ quote: m.quote.slice(0, 200), reflection: m.reflection.slice(0, 200) })),
      openThreads: safeStringArray(visibleParsed.openThreads, 5, 200),
      compassScores: parseCompassScores(visibleParsed.compassScores)
    };

    // Validate and construct HiddenSoulFile
    const hidden: HiddenSoulFile = {
      version: typeof hiddenParsed.version === "number" ? hiddenParsed.version : 1,
      lastUpdated: typeof hiddenParsed.lastUpdated === "string" ? hiddenParsed.lastUpdated : new Date().toISOString(),
      confidence: ["low", "medium", "high"].includes(hiddenParsed.confidence) ? hiddenParsed.confidence : "low",
      expertReflections: {
        psychologist: safeStringArray(hiddenParsed.expertReflections?.psychologist, 5, 300),
        sociologist: safeStringArray(hiddenParsed.expertReflections?.sociologist, 5, 300),
        linguist: safeStringArray(hiddenParsed.expertReflections?.linguist, 5, 300),
        narrativeAnalyst: safeStringArray(hiddenParsed.expertReflections?.narrativeAnalyst, 5, 300)
      },
      coreDrivers: safeArray(hiddenParsed.coreDrivers)
        .filter((d) => typeof d.driver === "string" && typeof d.strength === "number")
        .slice(0, 5)
        .map((d) => ({
          driver: d.driver.slice(0, 100),
          strength: Math.max(0, Math.min(1, d.strength)),
          inferred: typeof d.inferred === "boolean" ? d.inferred : true,
          evidence: safeString(d.evidence, 300)
        })),
      coreValues: safeStringArray(hiddenParsed.coreValues, 5, 100),
      voice: {
        register: ["formal", "casual", "chameleon"].includes(hiddenParsed.voice?.register) ? hiddenParsed.voice.register : "casual",
        density: ["sparse", "moderate", "dense"].includes(hiddenParsed.voice?.density) ? hiddenParsed.voice.density : "moderate",
        humorStyle: safeString(hiddenParsed.voice?.humorStyle, 200),
        conflictStyle: safeString(hiddenParsed.voice?.conflictStyle, 200),
        disclosureRate: ["guarded", "gradual", "open", "floods"].includes(hiddenParsed.voice?.disclosureRate) ? hiddenParsed.voice.disclosureRate : "gradual",
        signaturePatterns: safeStringArray(hiddenParsed.voice?.signaturePatterns, 5, 200),
        voiceExamples: safeArray(hiddenParsed.voice?.voiceExamples)
          .filter((v) => typeof v.trigger === "string" && typeof v.response === "string")
          .slice(0, 3)
          .map((v) => ({ trigger: v.trigger.slice(0, 200), response: v.response.slice(0, 200) }))
      },
      depthMap: {
        safeEntryPoints: safeStringArray(hiddenParsed.depthMap?.safeEntryPoints, 5, 200),
        unlockTopics: safeStringArray(hiddenParsed.depthMap?.unlockTopics, 5, 200),
        avoidEarly: safeStringArray(hiddenParsed.depthMap?.avoidEarly, 5, 200),
        currentlyLiveTopics: safeStringArray(hiddenParsed.depthMap?.currentlyLiveTopics, 5, 200),
        domainCoverage: parseDomainCoverage(hiddenParsed.depthMap?.domainCoverage)
      },
      analystNotes: safeStringArray(hiddenParsed.analystNotes, 5, 300)
    };

    return { visible, hidden };
  } catch {
    return null;
  }
}

// ── Reflection Parsers ───────────────────────────────────────

export function parseReflectionNote(raw: string): ReflectionNote | null {
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const note: ReflectionNote = {
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      factualAnchors: {},
      tensions: [],
      recurringThemes: [],
      notableAbsences: [],
      emotionalArc: "",
      domainCoverage: []
    };

    if (typeof parsed.factualAnchors === "object" && parsed.factualAnchors !== null && !Array.isArray(parsed.factualAnchors)) {
      for (const [key, val] of Object.entries(parsed.factualAnchors)) {
        if (typeof val === "string") {
          note.factualAnchors[key] = val.slice(0, 300);
        }
      }
    }

    if (Array.isArray(parsed.tensions)) {
      note.tensions = parsed.tensions
        .filter((t: unknown) => typeof t === "string")
        .slice(0, 5)
        .map((t: string) => t.slice(0, 300));
    }

    if (Array.isArray(parsed.recurringThemes)) {
      note.recurringThemes = parsed.recurringThemes
        .filter((t: unknown) => typeof t === "string")
        .slice(0, 5)
        .map((t: string) => t.slice(0, 200));
    }

    if (Array.isArray(parsed.notableAbsences)) {
      note.notableAbsences = parsed.notableAbsences
        .filter((t: unknown) => typeof t === "string")
        .slice(0, 3)
        .map((t: string) => t.slice(0, 200));
    }

    if (typeof parsed.emotionalArc === "string") {
      note.emotionalArc = parsed.emotionalArc.slice(0, 500);
    }

    note.domainCoverage = parseDomainCoverage(parsed.domainCoverage);

    return note;
  } catch {
    return null;
  }
}

export function parseLightVisibleUpdate(raw: string): VisibleSoulFileUpdate | null {
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const update: VisibleSoulFileUpdate = {};

    if (typeof parsed.portrait === "string" && parsed.portrait.length > 0) {
      update.portrait = parsed.portrait.slice(0, 500);
    }

    if (Array.isArray(parsed.crystallizedMoments)) {
      update.crystallizedMoments = parsed.crystallizedMoments
        .filter((m: unknown) =>
          typeof m === "object" && m !== null &&
          "quote" in m && "reflection" in m &&
          typeof (m as { quote: unknown }).quote === "string" &&
          typeof (m as { reflection: unknown }).reflection === "string"
        )
        .slice(0, 2)
        .map((m: { quote: string; reflection: string }) => ({
          quote: m.quote.slice(0, 200),
          reflection: m.reflection.slice(0, 200)
        }));
    }

    if (Array.isArray(parsed.openThreads)) {
      update.openThreads = parsed.openThreads
        .filter((t: unknown) => typeof t === "string")
        .slice(0, 3)
        .map((t: string) => t.slice(0, 200));
    }

    return update;
  } catch {
    return null;
  }
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
        Object.entries(update.sections).filter(([, v]) => v && v.length > 0)
      )
    } as VisibleSoulFile["sections"];
  }

  if (update.crystallizedMoments && update.crystallizedMoments.length > 0) {
    const existingQuotes = new Set(base.crystallizedMoments.map((m) => m.quote.toLowerCase().trim()));
    const newMoments = update.crystallizedMoments.filter(
      (m) => !existingQuotes.has(m.quote.toLowerCase().trim())
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
      // null from update doesn't overwrite existing non-null score
    }
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
    analystNotes: [...base.analystNotes, ...update.analystNotes].slice(-10)
  };
}

// ── Helpers ────────────────────────────────────────────────────

function safeString(val: unknown, maxLen: number): string {
  return typeof val === "string" ? val.slice(0, maxLen) : "";
}

function safeStringArray(val: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((item: unknown) => typeof item === "string")
    .slice(0, maxItems)
    .map((item: string) => item.slice(0, maxLen));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeArray(val: unknown): Array<any> {
  if (!Array.isArray(val)) return [];
  return val.filter((item: unknown) => typeof item === "object" && item !== null);
}

function parseDomainCoverage(val: unknown): DomainCoverageEntry[] {
  if (!Array.isArray(val)) return [];
  const validDepths = ["untouched", "mentioned", "explored", "deep"];
  return val
    .filter((item: unknown) =>
      typeof item === "object" && item !== null &&
      "domain" in item && typeof (item as { domain: unknown }).domain === "string" &&
      "depth" in item && validDepths.includes((item as { depth: string }).depth)
    )
    .slice(0, 7)
    .map((item: { domain: string; depth: string; evidence?: string }) => ({
      domain: item.domain.slice(0, 50),
      depth: item.depth as DomainCoverageEntry["depth"],
      evidence: typeof item.evidence === "string" ? item.evidence.slice(0, 200) : ""
    }));
}

function mergeStringArrays(existing: string[], incoming: string[], max: number): string[] {
  const set = new Set(existing.map((s) => s.toLowerCase().trim()));
  const newItems = incoming.filter((s) => !set.has(s.toLowerCase().trim()));
  return [...existing, ...newItems].slice(-max);
}

function mergeCoreDrivers(
  existing: HiddenSoulFile["coreDrivers"],
  incoming: HiddenSoulFile["coreDrivers"]
): HiddenSoulFile["coreDrivers"] {
  const driverMap = new Map(existing.map((d) => [d.driver.toLowerCase(), d]));
  for (const d of incoming) {
    driverMap.set(d.driver.toLowerCase(), d);
  }
  return [...driverMap.values()].slice(0, 10);
}
