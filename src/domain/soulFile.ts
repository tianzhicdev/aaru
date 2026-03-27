import type {
  SoulFile,
  VisibleSoulFile,
  HiddenSoulFile,
  ReflectionNote,
  SoulMessage
} from "./schemas.ts";

// ── Legacy types (kept for migration/compat) ───────────────────

export interface SoulFileUpdate {
  essence?: string;
  tensions?: Array<{ left: string; right: string; position?: number }>;
  comes_alive?: string;
  running_from?: string;
  your_words?: string[];
  evolution_insight?: string;
}

// ── Visible Soul File Update (light extraction during conversation) ──

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

export function emptyReflectionNote(exchangeCount: number): ReflectionNote {
  return {
    updatedAtExchange: exchangeCount,
    factualAnchors: {},
    tensions: [],
    recurringThemes: [],
    notableAbsences: [],
    emotionalArc: ""
  };
}

// ── Reflection Prompt (Prompt 2 — lightweight, every 8 exchanges) ──

export function buildReflectionPrompt(
  messages: Array<{ role: string; content: string }>,
  existingNote: ReflectionNote | null,
  exchangeCount: number
): string {
  const transcript = messages
    .map((m) => `${m.role === "assistant" ? "AARU" : "User"}: ${m.content}`)
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
    .map((m) => `${m.role === "assistant" ? "AARU" : "User"}: ${m.content}`)
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
- "portrait": A 2-4 sentence novel-like portrait of who this person is. Written in third person, using their own metaphors and language. Not a diagnosis — a mirror. Evocative, not clinical.
- "crystallizedMoments": Array of {quote, reflection} pairs. Quote is their exact words (verbatim). Reflection is a 1-sentence observation about what that quote reveals. Max 2 new moments.
- "openThreads": Array of strings. Curiosity threads — things left unexplored, questions left hanging, topics they circled but didn't enter. Max 3.

Rules:
- Use their EXACT words for quotes.
- Portrait should be lyrical but grounded. Think novel character description, not personality test.
- If updating an existing portrait, evolve it — integrate new understanding without losing what was already captured.
- Keep portrait under 400 characters.
- Respond with ONLY valid JSON, no markdown, no explanation.`;
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
  "portrait": "2-4 sentences. Novel-like. Third person. Uses their metaphors.",
  "sections": {
    "howYouMove": "How they move through the world — their energy, pace, relationship to space and time.",
    "howYouThink": "How their mind works — patterns, associations, what catches their attention.",
    "howYouConnect": "How they relate to others — attachment, trust, vulnerability, boundaries.",
    "whatYouCarry": "What weight they bear — responsibilities, past, fears, inherited patterns.",
    "whatLightsYouUp": "What ignites them — flow states, passions, moments of aliveness.",
    "yourContradictions": "Where they pull in two directions at once. Written as prose, not labels.",
    "yourVoice": "How they sound — their register, rhythm, humor, the shape of their sentences."
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

// ── Legacy extraction prompt (kept for compatibility) ──────────

export function buildExtractionPrompt(
  messages: Array<{ role: string; content: string }>,
  existingSoulFile: SoulFile | null,
  sessionNumber: number
): string {
  const transcript = messages
    .map((m) => `${m.role === "assistant" ? "AARU" : "User"}: ${m.content}`)
    .join("\n");

  const existingContext = existingSoulFile
    ? `\nExisting soul file:\n${JSON.stringify({
        essence: existingSoulFile.essence,
        tensions: existingSoulFile.tensions,
        comes_alive: existingSoulFile.comes_alive,
        running_from: existingSoulFile.running_from,
        your_words: existingSoulFile.your_words
      }, null, 2)}`
    : "\nNo existing soul file — this is the first session.";

  return `You are analyzing a soul mirror conversation to update a person's soul file.
This is session ${sessionNumber}.
${existingContext}

Transcript:
${transcript}

Extract a JSON object with these fields (include only fields that have new information):
- "essence": A 1-2 sentence portrait of who this person is, using their own words and metaphors. Not a diagnosis — a mirror.
- "tensions": Array of {left, right} pairs representing core tensions in their personality (e.g., {left: "Solitude", right: "Connection"}).
- "comes_alive": What makes them come alive, in their language.
- "running_from": What they're running from or avoiding.
- "your_words": Array of their most striking verbatim quotes (max 3 new ones).
- "evolution_insight": One sentence about what emerged or changed in this session.

Rules:
- Use their EXACT words where possible, not paraphrases.
- For returning sessions, EVOLVE the existing file — don't replace unless something genuinely changed.
- Keep essence under 200 characters.
- Keep quotes under 100 characters each.
- Respond with ONLY valid JSON, no markdown, no explanation.`;
}

// ── Parsers ────────────────────────────────────────────────────

export function parseReflectionNote(raw: string): ReflectionNote | null {
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const note: ReflectionNote = {
      updatedAtExchange: typeof parsed.updatedAtExchange === "number" ? parsed.updatedAtExchange : 0,
      factualAnchors: {},
      tensions: [],
      recurringThemes: [],
      notableAbsences: [],
      emotionalArc: ""
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

// ── Legacy parser (kept for compatibility) ─────────────────────

export function parseSoulFileUpdate(raw: string): SoulFileUpdate | null {
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const update: SoulFileUpdate = {};

    if (typeof parsed.essence === "string" && parsed.essence.length > 0) {
      update.essence = parsed.essence.slice(0, 500);
    }

    if (Array.isArray(parsed.tensions)) {
      update.tensions = parsed.tensions
        .filter((t: unknown) =>
          typeof t === "object" && t !== null &&
          "left" in t && "right" in t &&
          typeof (t as { left: unknown }).left === "string" &&
          typeof (t as { right: unknown }).right === "string"
        )
        .slice(0, 5)
        .map((t: { left: string; right: string; position?: number }) => ({
          left: t.left,
          right: t.right,
          ...(typeof t.position === "number" ? { position: t.position } : {})
        }));
    }

    if (typeof parsed.comes_alive === "string" && parsed.comes_alive.length > 0) {
      update.comes_alive = parsed.comes_alive.slice(0, 500);
    }

    if (typeof parsed.running_from === "string" && parsed.running_from.length > 0) {
      update.running_from = parsed.running_from.slice(0, 500);
    }

    if (Array.isArray(parsed.your_words)) {
      update.your_words = parsed.your_words
        .filter((w: unknown) => typeof w === "string" && w.length > 0)
        .slice(0, 3)
        .map((w: string) => w.slice(0, 200));
    }

    if (typeof parsed.evolution_insight === "string" && parsed.evolution_insight.length > 0) {
      update.evolution_insight = parsed.evolution_insight.slice(0, 300);
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
