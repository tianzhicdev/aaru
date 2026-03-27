import type {
  SoulFile,
  VisibleSoulFile,
  HiddenSoulFile,
  ReflectionNote,
  SoulMessage
} from "./schemas.ts";

// ── Visible Soul File Update ──

export interface VisibleSoulFileUpdate {
  portrait?: string;
  sections?: Partial<VisibleSoulFile["sections"]>;
  crystallizedMoments?: Array<{ quote: string; reflection: string }>;
  openThreads?: string[];
}

// ── Empty constructors ─────────────────────────────────────────

export function emptySoulFile(): SoulFile {
  return {
    essence: null,
    tensions: [],
    comes_alive: null,
    running_from: null,
    your_words: [],
    evolution: [],
    session_count: 0
  };
}

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
    openThreads: []
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
      currentlyLiveTopics: []
    },
    analystNotes: []
  };
}


// ── Soul Synthesis Prompt (Prompt 3 — full synthesis at session end) ──

export function buildSoulSynthesisPrompt(
  messages: Array<{ role: string; content: string }>,
  reflectionNotes: ReflectionNote[],
  existingVisible: VisibleSoulFile | null,
  existingHidden: HiddenSoulFile | null,
  sessionNumber: number
): string {
  const transcript = messages
    .map((m) => `${m.role === "assistant" ? "AARU" : "User"}: ${m.content}`)
    .join("\n");

  const reflectionsContext = reflectionNotes.length > 0
    ? `\nReflection notes from this session:\n${JSON.stringify(reflectionNotes, null, 2)}`
    : "\nNo reflection notes from this session.";

  const existingVisibleContext = existingVisible
    ? `\nExisting visible soul file:\n${JSON.stringify(existingVisible, null, 2)}`
    : "\nNo existing visible soul file.";

  const existingHiddenContext = existingHidden
    ? `\nExisting hidden soul file:\n${JSON.stringify(existingHidden, null, 2)}`
    : "\nNo existing hidden soul file.";

  return `You are conducting a deep analysis of a soul mirror conversation to build a comprehensive soul file. This is session ${sessionNumber}.

You will analyze the transcript through 4 expert lenses, then synthesize into two outputs.
${reflectionsContext}
${existingVisibleContext}
${existingHiddenContext}

Transcript:
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
  "portrait": "2-4 sentences. Novel-like. Second person (you/your). Uses their metaphors.",
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
  "openThreads": ["curiosity threads left unexplored"]
}

### SECOND: HiddenSoulFile (agent-facing, clinical)
{
  "version": ${(existingHidden?.version ?? 0) + 1},
  "lastUpdated": "${new Date().toISOString()}",
  "confidence": "low|medium|high",
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
    "currentlyLiveTopics": ["what's active in their mind right now"]
  },
  "analystNotes": ["meta-observations about the analysis itself"]
}

## RULES
- Use their EXACT words for all quotes.
- Each section should be 1-3 sentences, evocative not clinical.
- If evolving existing files, integrate new understanding — don't discard previous insights.
- Confidence: "low" for 1 session, "medium" for 2-3, "high" for 4+.
- Max 5 core drivers, 5 core values, 5 expert reflections per lens.
- Output ONLY the two JSON objects separated by <<<SPLIT>>>. No other text.`;
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
      openThreads: safeStringArray(visibleParsed.openThreads, 5, 200)
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
        currentlyLiveTopics: safeStringArray(hiddenParsed.depthMap?.currentlyLiveTopics, 5, 200)
      },
      analystNotes: safeStringArray(hiddenParsed.analystNotes, 5, 300)
    };

    return { visible, hidden };
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

/** Convert a legacy SoulFile to a VisibleSoulFile */
export function migrateToVisibleSoulFile(legacy: SoulFile): VisibleSoulFile {
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    portrait: legacy.essence,
    sections: {
      howYouMove: "",
      howYouThink: "",
      howYouConnect: "",
      whatYouCarry: legacy.running_from ?? "",
      whatLightsYouUp: legacy.comes_alive ?? "",
      yourContradictions: legacy.tensions
        .map((t) => `${t.left} — ${t.right}`)
        .join(". "),
      yourVoice: ""
    },
    crystallizedMoments: legacy.your_words.map((w) => ({
      quote: w,
      reflection: ""
    })),
    openThreads: []
  };
}

// ── Legacy merge (kept for compatibility) ──────────────────────

export interface SoulFileUpdate {
  essence?: string;
  tensions?: Array<{ left: string; right: string; position?: number }>;
  comes_alive?: string;
  running_from?: string;
  your_words?: string[];
  evolution_insight?: string;
}

export function mergeSoulFile(
  existing: SoulFile | null,
  update: SoulFileUpdate,
  sessionNumber: number
): SoulFile {
  const base: SoulFile = existing ?? {
    essence: null,
    tensions: [],
    comes_alive: null,
    running_from: null,
    your_words: [],
    evolution: [],
    session_count: 0
  };

  const merged: SoulFile = {
    ...base,
    session_count: sessionNumber
  };

  if (update.essence) {
    merged.essence = update.essence;
  }

  if (update.tensions && update.tensions.length > 0) {
    const tensionMap = new Map(
      base.tensions.map((t) => [`${t.left}:${t.right}`, t])
    );
    for (const t of update.tensions) {
      tensionMap.set(`${t.left}:${t.right}`, t);
    }
    merged.tensions = [...tensionMap.values()].slice(0, 7);
  }

  if (update.comes_alive) {
    merged.comes_alive = update.comes_alive;
  }

  if (update.running_from) {
    merged.running_from = update.running_from;
  }

  if (update.your_words && update.your_words.length > 0) {
    const existingSet = new Set(base.your_words.map((w) => w.toLowerCase().trim()));
    const newWords = update.your_words.filter(
      (w) => !existingSet.has(w.toLowerCase().trim())
    );
    merged.your_words = [...base.your_words, ...newWords].slice(-6);
  }

  if (update.evolution_insight) {
    merged.evolution = [
      ...base.evolution,
      {
        session: sessionNumber,
        insight: update.evolution_insight,
        date: new Date().toISOString()
      }
    ].slice(-10);
  }

  return merged;
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
