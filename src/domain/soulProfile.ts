import { soulProfileSchema } from "./schemas.ts";
import type { SoulProfile, SoulValues, SoulNarrative } from "./types.ts";

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
  const expressedValues = words.slice(4, 7);
  const guessedFields: string[] = [];

  if (interests.length === 0) {
    interests.push("curiosity", "art", "travel");
    guessedFields.push("interests");
  }

  if (expressedValues.length === 0) {
    expressedValues.push("honesty", "warmth", "growth");
    guessedFields.push("values");
  }

  const values: SoulValues = {
    self_transcendence: 0.5,
    self_enhancement: 0.5,
    openness_to_change: 0.5,
    conservation: 0.5,
    expressed: expressedValues
  };

  const narrative: SoulNarrative = {
    formative_stories: [],
    self_defining_memories: [],
    narrative_themes: []
  };

  const profile: SoulProfile = {
    personality: words.length >= 6
      ? `Thoughtful, curious, and drawn to ${interests.slice(0, 2).join(" and ")}.`
      : "Warm, curious, and open to meaningful conversation.",
    interests,
    values,
    narrative,
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

  // Check simple fields
  for (const field of ["personality", "interests", "avoid_topics"] as const) {
    const value = generated[field];
    if (
      value === undefined ||
      (typeof value === "string" && value.trim().length === 0) ||
      (Array.isArray(value) && value.length === 0)
    ) {
      guessedFields.add(field);
    }
  }

  // Check values (now an object)
  if (!generated.values || !generated.values.expressed?.length) {
    guessedFields.add("values");
  }

  // Check narrative
  if (!generated.narrative) {
    guessedFields.add("narrative");
  }

  const mergedValues: SoulValues = generated.values && generated.values.expressed?.length
    ? generated.values
    : fallback.values;

  const mergedNarrative: SoulNarrative = generated.narrative
    ? {
        formative_stories: generated.narrative.formative_stories?.length
          ? generated.narrative.formative_stories
          : fallback.narrative.formative_stories,
        self_defining_memories: generated.narrative.self_defining_memories?.length
          ? generated.narrative.self_defining_memories
          : fallback.narrative.self_defining_memories,
        narrative_themes: generated.narrative.narrative_themes?.length
          ? generated.narrative.narrative_themes
          : fallback.narrative.narrative_themes
      }
    : fallback.narrative;

  return soulProfileSchema.parse({
    personality: generated.personality?.trim() || fallback.personality,
    interests: generated.interests?.length ? generated.interests : fallback.interests,
    values: mergedValues,
    narrative: mergedNarrative,
    avoid_topics: generated.avoid_topics?.length ? generated.avoid_topics : fallback.avoid_topics,
    raw_input: rawInput,
    guessed_fields: [...guessedFields]
  });
}
