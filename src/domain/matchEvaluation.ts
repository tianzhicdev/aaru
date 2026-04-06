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
    relationalStyle: file.relationalStyle ?? null
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

  return `You are a soul compatibility evaluator. You are given two soul profiles and must determine whether these two people would be a good match for a deep, meaningful connection.

Evaluate compatibility across these dimensions:
1. **Value alignment** — Do they share core values or have complementary values?
2. **Personality complementarity** — Not just similarity, but healthy complementarity (e.g., one structured + one spontaneous can work well)
3. **Communication style** — Would their communication patterns mesh well?
4. **Shared depth** — Do they both engage at similar emotional/intellectual depths?
5. **Growth potential** — Would they help each other grow?

Be selective — not everyone is a match. Only return "match" when there's genuine compatibility signal across multiple dimensions. A score of 0.6+ indicates a match.

${personA}

${personB}

Return your evaluation as a JSON object with:
- decision: "match" or "no_match"
- score: a number between 0 and 1 (0.6+ = match)
- reasoning: 2-3 sentences written warmly and naturally, as if describing to a friend why these two people clicked (or didn't). Use their names (${nameA} and ${nameB}), not "Person A/B". Keep it readable and human — no jargon, no numeric scores, no percentages, no dimension labels, no technical terms. Pure prose only.`;
}
