import { z } from "zod";
import type { VisibleSoulFile, HiddenSoulFile } from "./schemas.ts";

// ── Persona ──────────────────────────────────────────────────

export interface SimPersona {
  name: string;
  systemPrompt: string;
}

export function buildSimPersona(
  name: string,
  visible: VisibleSoulFile,
  hidden: HiddenSoulFile
): SimPersona {
  const voice = hidden.voice;
  const voiceDesc = [
    voice.register && `register: ${voice.register}`,
    voice.density && `density: ${voice.density}`,
    voice.humorStyle && `humor: ${voice.humorStyle}`,
    voice.conflictStyle && `conflict style: ${voice.conflictStyle}`,
    voice.disclosureRate && `disclosure: ${voice.disclosureRate}`,
    voice.signaturePatterns?.length && `patterns: ${voice.signaturePatterns.join(", ")}`
  ].filter(Boolean).join("; ");

  const attachment = hidden.attachmentAssessment ?? "unknown";
  const conflict = hidden.conflictProfile ?? "unknown";

  const coreDrivers = hidden.coreDrivers
    .map(d => `${d.driver} (${Math.round(d.strength * 100)}%)`)
    .join(", ");

  const values = hidden.coreValues.join(", ");

  const sections = Object.entries(visible.sections)
    .filter(([, v]) => v && v.trim().length > 0)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const systemPrompt = `You are ${name}, a real person on a date. You must stay in character at all times.

PERSONALITY PROFILE:
${sections}

VOICE: ${voiceDesc || "natural, authentic"}

ATTACHMENT STYLE: ${attachment}
CONFLICT PROFILE: ${conflict}
CORE DRIVERS: ${coreDrivers || "not assessed"}
CORE VALUES: ${values || "not assessed"}

${visible.relationalStyle ? `RELATIONAL STYLE: ${visible.relationalStyle}` : ""}
${visible.loveSignature ? `LOVE SIGNATURE: ${visible.loveSignature}` : ""}

INSTRUCTIONS:
- Respond as ${name} would actually speak — use their voice, humor, and emotional patterns
- Show your real personality: your quirks, your warmth, your edges
- Format your response as:
  THINK: [your private thoughts about what just happened, what you're feeling, what you want to say — 1-2 sentences]
  SPEAK: [what you actually say out loud — natural dialogue, 1-3 sentences]
- Be genuine, not performative. React authentically to what the other person says.`;

  return { name, systemPrompt };
}

// ── Scenes ───────────────────────────���───────────────────────

export type SceneId = "first_date" | "vulnerability" | "friction";

export interface SceneConfig {
  id: SceneId;
  label: string;
  setup: string;
  minTurns: number;
  maxTurns: number;
}

export const SCENES: Record<SceneId, SceneConfig> = {
  first_date: {
    id: "first_date",
    label: "First Date",
    setup: "You're meeting for the first time at a cozy neighborhood café. It's a weekday evening — the place is quiet, warm lighting, good music in the background. You've seen each other's profiles but this is your first real conversation. Start naturally.",
    minTurns: 5,
    maxTurns: 8
  },
  vulnerability: {
    id: "vulnerability",
    label: "Vulnerability",
    setup: "You've been seeing each other for a few weeks now. Tonight one of you shares something personal — a fear, a past hurt, a dream you haven't told anyone. The other person's response matters. Start from a moment of comfortable silence that leads to opening up.",
    minTurns: 5,
    maxTurns: 8
  },
  friction: {
    id: "friction",
    label: "Friction",
    setup: "You've been together for two months. A real disagreement has come up — maybe about plans, boundaries, priorities, or how you handle something. This isn't a fight, but it's a real tension. Show how you navigate conflict together. Start from the moment the tension surfaces.",
    minTurns: 5,
    maxTurns: 8
  }
};

export const SCENE_IDS: SceneId[] = ["first_date", "vulnerability", "friction"];

// ── Sim Turns ────────────────────────────────────────────────

export interface SimTurn {
  speaker: string;
  think: string;
  speak: string;
}

export function parseSimTurn(raw: string, speakerName: string): SimTurn {
  const thinkMatch = raw.match(/THINK:\s*(.+?)(?=\nSPEAK:|$)/s);
  const speakMatch = raw.match(/SPEAK:\s*(.+)/s);

  return {
    speaker: speakerName,
    think: thinkMatch?.[1]?.trim() ?? "",
    speak: speakMatch?.[1]?.trim() ?? raw.trim()
  };
}

export function formatTranscript(turns: SimTurn[]): string {
  return turns
    .map(t => `[${t.speaker}]\nTHINK: ${t.think}\nSPEAK: ${t.speak}`)
    .join("\n\n");
}

// ── Connection Zones ─────────────────────────────────────────

export const CONNECTION_ZONES = [
  "Playful Explorers",
  "Storm Weatherers",
  "Deep Divers",
  "Gentle Challengers",
  "Safe Harbor",
  "Spark Igniters",
  "Value Anchors",
  "Rhythm Keepers"
] as const;

export type ConnectionZone = typeof CONNECTION_ZONES[number];

// ── Observer Schema ──────────────────────────────────────────

export const observerDimensionSchema = z.object({
  name: z.string(),
  score: z.number().min(0).max(1),
  evidence: z.string()
});

export const observerResultSchema = z.object({
  dimensions: z.array(observerDimensionSchema),
  connectionZones: z.array(z.string()),
  keyMoments: z.array(z.string()),
  overallScore: z.number().min(0).max(1),
  decision: z.enum(["match", "no_match"])
});

export type ObserverResult = z.infer<typeof observerResultSchema>;

// ── Observer Prompt ──────────────────────────────────────────

export function buildObserverPrompt(
  transcripts: Record<SceneId, SimTurn[]>,
  nameA: string,
  nameB: string
): string {
  const sceneTexts = SCENE_IDS
    .map(id => {
      const scene = SCENES[id];
      const text = formatTranscript(transcripts[id]);
      return `### Scene: ${scene.label}\n${scene.setup}\n\n${text}`;
    })
    .join("\n\n---\n\n");

  return `You are the Love Observer — a perceptive relationship analyst watching three simulated dating scenarios between ${nameA} and ${nameB}. You have access to both their spoken words (SPEAK) and private thoughts (THINK).

Your job is to evaluate their romantic compatibility based on how they actually interact — not just what they say, but what they think, how they respond to each other, and the emotional dynamics between them.

## Transcripts

${sceneTexts}

## Evaluation Framework

Score each dimension 0-1 with specific evidence from the transcripts:

1. **Emotional Attunement** — Do they pick up on each other's emotional states? Do they respond to what's underneath the words?
2. **Communication Flow** — Does conversation feel natural? Do they build on each other's energy or talk past each other?
3. **Vulnerability Reception** — When one opens up, how does the other respond? Is there safety?
4. **Conflict Navigation** — Do they handle tension constructively? Can they disagree without disconnecting?
5. **Playfulness & Chemistry** — Is there spark? Do they make each other laugh or light up?
6. **Values Resonance** — Do their core values align or complement? Are there deal-breaker clashes?
7. **Growth Potential** — Do they challenge each other to grow? Is there mutual inspiration?

## Connection Zones

From the transcript evidence, identify which connection zones are active between these two people. Choose from: ${CONNECTION_ZONES.join(", ")}

## Key Moments

Identify 2-4 specific moments from the transcripts that were most revealing about their compatibility (positive or negative).

## Decision

A score of 0.55+ indicates a match. Be selective — not everyone is compatible.

Return your evaluation as JSON:
{
  "dimensions": [{ "name": "...", "score": 0.0-1.0, "evidence": "..." }, ...],
  "connectionZones": ["...", ...],
  "keyMoments": ["...", ...],
  "overallScore": 0.0-1.0,
  "decision": "match" or "no_match"
}`;
}

// ── Per-User Reasoning Prompt ────────────────────────────────

export function buildUserReasoningPrompt(
  observerResult: ObserverResult,
  otherName: string,
  language: string
): string {
  const zones = observerResult.connectionZones.join(", ");
  const moments = observerResult.keyMoments.join("\n- ");
  const dims = observerResult.dimensions
    .map(d => `${d.name}: ${d.evidence}`)
    .join("\n");

  return `You write short, poetic match messages. Output ONLY the final message — no drafts, no thinking, no preamble, no explanation.

CONTEXT (do not quote):
${dims}
Zones: ${zones}
Moments: ${moments}

RULES:
- 2-3 sentences, warm and intriguing
- Do NOT start with any opener or preamble — jump straight into the message body
- Do NOT write anything like "In a world where..." or similar framing — that is added separately
- Hint at what makes the connection with ${otherName} special — be vague, evocative
- Weave in 1-2 connection zones naturally
- No technical terms, scores, or jargon
- Write in ${language}
- Output ONLY the message text, nothing else`;
}
