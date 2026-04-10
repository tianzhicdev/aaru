import { z } from "zod";
import type { VisibleSoulFile } from "./schemas.ts";

// ── Match Evaluation Schema ──────────────────────────────────

export const matchEvaluationResultSchema = z.object({
  decision: z.enum(["match", "no_match"]),
  score: z.number().min(0).max(1),
  reasoning: z.string()
});

export type MatchEvaluationResult = z.infer<typeof matchEvaluationResultSchema>;

// ── Soul Summary for Matching ────────────────────────────────

export interface SoulSummary {
  sections: Record<string, string>;
  compassScores: Record<string, number | null>;
  personalityHighlights: string[];
  topValues: string[];
  relationalStyle: string | null;
  attachmentStyle: string | null;
  loveSignature: string | null;
}

/**
 * Extracts the key dimensions of a soul file for match evaluation.
 * Strips raw quotes/moments to keep token count low.
 */
export function summarizeSoulForMatching(file: VisibleSoulFile): SoulSummary {
  const sections: Record<string, string> = {};
  for (const [key, value] of Object.entries(file.sections)) {
    if (value && value.trim().length > 0) {
      sections[key] = value.trim();
    }
  }

  const compassScores: Record<string, number | null> = {};
  if (file.compassScores) {
    for (const [key, value] of Object.entries(file.compassScores)) {
      if (typeof value === "number") {
        compassScores[key] = value;
      }
    }
  }

  const personalityHighlights: string[] = [];
  const spectrum = file.personalitySpectrum;
  if (spectrum) {
    const traits = ["openness", "conscientiousness", "extraversion", "agreeableness", "emotionalSensitivity"] as const;
    for (const trait of traits) {
      const entry = spectrum[trait];
      if (entry) {
        personalityHighlights.push(`${trait}: ${entry.label} (${entry.position}/100)`);
      }
    }
  }

  const topValues = (file.topValues ?? []).map(v => v.value);

  return {
    sections,
    compassScores,
    personalityHighlights,
    topValues,
    relationalStyle: file.relationalStyle ?? null,
    attachmentStyle: file.attachmentStyle ?? null,
    loveSignature: file.loveSignature ?? null
  };
}

/**
 * Formats a soul summary as text for insertion into the LLM prompt.
 */
export function formatSoulSummary(label: string, summary: SoulSummary): string {
  const parts: string[] = [`## ${label}`];

  for (const [key, value] of Object.entries(summary.sections)) {
    parts.push(`**${key}**: ${value}`);
  }

  if (Object.keys(summary.compassScores).length > 0) {
    const axes = Object.entries(summary.compassScores)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    parts.push(`**Compass**: ${axes}`);
  }

  if (summary.personalityHighlights.length > 0) {
    parts.push(`**Personality**: ${summary.personalityHighlights.join("; ")}`);
  }

  if (summary.topValues.length > 0) {
    parts.push(`**Top Values**: ${summary.topValues.join(", ")}`);
  }

  if (summary.relationalStyle) {
    parts.push(`**Relational Style**: ${summary.relationalStyle}`);
  }

  if (summary.attachmentStyle) {
    parts.push(`**Attachment Style**: ${summary.attachmentStyle}`);
  }

  if (summary.loveSignature) {
    parts.push(`**Love Signature**: ${summary.loveSignature}`);
  }

  return parts.join("\n");
}

// ── Match Evaluation Prompt ──────────────────────────────────

export function buildMatchEvaluationPrompt(
  summaryA: SoulSummary,
  summaryB: SoulSummary,
  nameA: string,
  nameB: string
): string {
  const personA = formatSoulSummary(nameA, summaryA);
  const personB = formatSoulSummary(nameB, summaryB);

  return `You are a romantic compatibility evaluator. You are given two soul portraits and must determine whether these two people would be a good match for a deep, lasting romantic connection.

Evaluate compatibility across these seven dimensions:
1. **Attachment fit** — Are their attachment styles compatible? Can they meet each other's needs for closeness and space?
2. **Conflict compatibility** — Do their conflict and repair styles mesh? Can they fight fair and reconnect?
3. **Love language resonance** — Do they express and receive care in compatible ways?
4. **Lifestyle alignment** — Do their daily rhythms, energy levels, and lifestyle preferences fit together?
5. **Shared emotional depth** — Do they both engage at similar emotional depths? Can they hold space for each other?
6. **Values alignment** — Do they share core values or have values that enrich rather than clash?
7. **Play compatibility** — Do they have compatible senses of humor, fun, and spontaneity?

Be selective — not everyone is a match. Only return "match" when there's genuine compatibility signal across multiple dimensions. A score of 0.6+ indicates a match.

${personA}

${personB}

Return your evaluation as a JSON object with:
- decision: "match" or "no_match"
- score: a number between 0 and 1 (0.6+ = match)
- reasoning: 2-3 sentences written warmly and naturally, as if describing to a friend why these two people clicked (or didn't). Use their names (${nameA} and ${nameB}), not "Person A/B". IMPORTANT: Do not reveal or quote any raw soul file content — no specific quotes, section text, trait labels, compass axes, values lists, or personality details. Keep it vague and evocative. Describe the *feeling* of why they connect, not the data behind it. No jargon, no numeric scores, no percentages, no dimension labels, no technical terms. Pure prose only.`;
}
