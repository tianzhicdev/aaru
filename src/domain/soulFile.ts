import type { SoulFile, SoulMessage } from "./schemas.ts";

export interface SoulFileUpdate {
  essence?: string;
  tensions?: Array<{ left: string; right: string; position?: number }>;
  comes_alive?: string;
  running_from?: string;
  your_words?: string[];
  evolution_insight?: string;
}

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

export function parseSoulFileUpdate(raw: string): SoulFileUpdate | null {
  try {
    // Strip potential markdown code fences
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
    // Merge tensions: replace existing by left/right match, add new ones
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
    // Deduplicate quotes
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
