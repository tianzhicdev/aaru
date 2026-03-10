import { soulProfileSchema } from "./schemas.ts";
import type { SoulProfile } from "./types.ts";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "this",
  "have",
  "from",
  "about",
  "your",
  "just",
  "like"
]);

function uniqueWords(input: string): string[] {
  return [...new Set(
    input
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !STOP_WORDS.has(word))
  )];
}

export function generateFallbackSoulProfile(rawInput: string): SoulProfile {
  const words = uniqueWords(rawInput);
  const interests = words.slice(0, 4);
  const values = words.slice(4, 7);
  const guessedFields: string[] = [];

  if (interests.length === 0) {
    interests.push("curiosity", "art", "travel");
    guessedFields.push("interests");
  }

  if (values.length === 0) {
    values.push("honesty", "warmth", "growth");
    guessedFields.push("values");
  }

  const profile: SoulProfile = {
    personality: words.length >= 6
      ? `Thoughtful, curious, and drawn to ${interests.slice(0, 2).join(" and ")}.`
      : "Warm, curious, and open to meaningful conversation.",
    interests,
    values,
    avoid_topics: ["cruelty", "bad-faith arguments"],
    raw_input: rawInput,
    guessed_fields: guessedFields
  };

  return soulProfileSchema.parse(profile);
}

export function mergeGeneratedSoulProfile(
  rawInput: string,
  generated: Partial<SoulProfile>
): SoulProfile {
  const fallback = generateFallbackSoulProfile(rawInput);
  const guessedFields = new Set<string>(fallback.guessed_fields);

  for (const field of ["personality", "interests", "values", "avoid_topics"] as const) {
    const value = generated[field];
    if (
      value === undefined ||
      (typeof value === "string" && value.trim().length === 0) ||
      (Array.isArray(value) && value.length === 0)
    ) {
      guessedFields.add(field);
    }
  }

  return soulProfileSchema.parse({
    personality: generated.personality?.trim() || fallback.personality,
    interests: generated.interests?.length ? generated.interests : fallback.interests,
    values: generated.values?.length ? generated.values : fallback.values,
    avoid_topics: generated.avoid_topics?.length ? generated.avoid_topics : fallback.avoid_topics,
    raw_input: rawInput,
    guessed_fields: [...guessedFields]
  });
}
