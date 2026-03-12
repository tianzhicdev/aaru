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

const INTEREST_KEYWORDS: Array<{ interest: string; keywords: string[] }> = [
  { interest: "documentary film", keywords: ["documentary", "documentaries", "film", "cinema", "camera"] },
  { interest: "oral history", keywords: ["oral", "history", "histories", "archive", "archives"] },
  { interest: "night walks", keywords: ["night", "walk", "walks", "coastal"] },
  { interest: "urban memory", keywords: ["city", "cities", "migration", "memory"] },
  { interest: "music scenes", keywords: ["music", "songs", "concert"] },
  { interest: "writing", keywords: ["write", "writing", "essay", "poetry"] },
  { interest: "design", keywords: ["design", "architecture", "space"] },
  { interest: "care work", keywords: ["care", "tenderness", "healing"] }
];

const VALUE_KEYWORDS = {
  self_transcendence: ["care", "kindness", "tenderness", "community", "family", "empathy", "justice"],
  self_enhancement: ["ambition", "mastery", "recognition", "success", "drive"],
  openness_to_change: ["curiosity", "novelty", "wandering", "explore", "change", "migration", "questions"],
  conservation: ["memory", "tradition", "belonging", "home", "ritual", "history"]
} as const;

const VALUE_WORD_SUGGESTIONS = ["tenderness", "curiosity", "memory", "craft", "honesty", "care", "restlessness"];

function splitSentences(input: string) {
  return input
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function uniqueWords(input: string): string[] {
  return [...new Set(
    input
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !STOP_WORDS.has(word))
  )];
}

function sentenceFragments(input: string): string[] {
  return splitSentences(input)
    .flatMap((sentence) => sentence.split(/[,;:]/))
    .map((part) => part.trim())
    .filter((part) => part.length >= 12);
}

function inferInterests(rawInput: string, words: string[]) {
  const found = INTEREST_KEYWORDS
    .filter(({ keywords }) => keywords.some((keyword) => rawInput.toLowerCase().includes(keyword)))
    .map(({ interest }) => interest);
  return [...new Set([...found, ...words.slice(0, 6)])].slice(0, 5);
}

function scoreDimension(rawInput: string, keywords: readonly string[]) {
  const hits = keywords.filter((keyword) => rawInput.toLowerCase().includes(keyword)).length;
  return Math.min(0.95, 0.35 + hits * 0.12);
}

function clamp1(value: number) {
  return Math.max(0.05, Math.min(0.95, Math.round(value * 100) / 100));
}

function inferNarrative(rawInput: string, interests: string[]) {
  const fragments = sentenceFragments(rawInput);
  const stories = fragments.slice(0, 2).map((fragment) =>
    fragment.endsWith(".") ? fragment : `${fragment}.`
  );
  const memories = fragments.slice(1, 3).map((fragment) =>
    fragment.endsWith(".") ? fragment : `${fragment}.`
  );

  if (stories.length === 0) {
    stories.push(
      `They keep returning to ${interests[0] ?? "small human details"} as a way of making sense of the world around them.`
    );
  }
  if (stories.length === 1) {
    stories.push(
      `They notice how ${interests[1] ?? interests[0] ?? "people"} carry history inside ordinary moments, and that attention shapes how they move through the world.`
    );
  }
  if (memories.length === 0) {
    memories.push(
      `A quiet moment around ${interests[0] ?? "something familiar"} still feels like a private landmark in their life.`
    );
  }

  const themes = [...new Set([
    rawInput.toLowerCase().includes("memory") ? "memory" : "",
    rawInput.toLowerCase().includes("migration") ? "migration" : "",
    rawInput.toLowerCase().includes("city") || rawInput.toLowerCase().includes("cities") ? "place and belonging" : "",
    rawInput.toLowerCase().includes("family") ? "inheritance" : "",
    "careful observation",
    "searching for meaning"
  ].filter(Boolean))].slice(0, 5);

  return {
    formative_stories: stories.slice(0, 3),
    self_defining_memories: memories.slice(0, 3),
    narrative_themes: themes
  };
}

function inferPersonality(interests: string[], values: SoulValues) {
  type ValueDimension = "self_transcendence" | "self_enhancement" | "openness_to_change" | "conservation";
  const leadingDimension = ([
    ["self_transcendence", values.self_transcendence],
    ["self_enhancement", values.self_enhancement],
    ["openness_to_change", values.openness_to_change],
    ["conservation", values.conservation]
  ] as Array<[ValueDimension, number]>).sort((a, b) => b[1] - a[1])[0][0];

  const dimensionLine = {
    self_transcendence: "They are relational, attentive, and usually orient toward care before performance.",
    self_enhancement: "They are ambitious in a quiet way, with a strong instinct to sharpen their craft until it becomes unmistakably theirs.",
    openness_to_change: "They are exploratory, idea-driven, and most alive when something unfamiliar rearranges their perspective.",
    conservation: "They are anchored by memory, ritual, and a desire to preserve what feels meaningful before it disappears."
  }[leadingDimension];

  return [
    `They move through life with a sensibility shaped by ${interests.slice(0, 2).join(" and ") || "curiosity and attention"}.`,
    dimensionLine,
    "In conversation they tend to sound reflective, concrete, and emotionally literate rather than performative."
  ].join(" ");
}

export function suggestDisplayName(rawInput: string): string {
  const lower = rawInput.toLowerCase();
  const adjective =
    lower.includes("tender") ? "Tender" :
    lower.includes("night") ? "Night" :
    lower.includes("quiet") ? "Quiet" :
    lower.includes("memory") ? "Memory" :
    lower.includes("coastal") ? "Coastal" :
    "Wandering";
  const noun =
    lower.includes("documentary") || lower.includes("film") ? "Filmmaker" :
    lower.includes("history") || lower.includes("archive") ? "Archivist" :
    lower.includes("city") || lower.includes("cities") ? "Cartographer" :
    lower.includes("walk") ? "Walker" :
    lower.includes("music") ? "Listener" :
    "Soul";
  return `${adjective} ${noun}`;
}

export function generateFallbackSoulProfile(rawInput: string): SoulProfile {
  const words = uniqueWords(rawInput);
  const interests = inferInterests(rawInput, words);
  const expressedValues = [...new Set([
    ...words.filter((word) => VALUE_WORD_SUGGESTIONS.includes(word)).slice(0, 4),
    ...VALUE_WORD_SUGGESTIONS.filter((word) => rawInput.toLowerCase().includes(word)).slice(0, 4)
  ])].slice(0, 5);
  const guessedFields: string[] = [];

  if (interests.length === 0) {
    interests.push("curiosity", "art", "travel");
    guessedFields.push("interests");
  }

  if (expressedValues.length === 0) {
    expressedValues.push("honesty", "warmth", "growth", "care");
    guessedFields.push("values");
  }

  const values: SoulValues = {
    self_transcendence: clamp1(scoreDimension(rawInput, VALUE_KEYWORDS.self_transcendence)),
    self_enhancement: clamp1(scoreDimension(rawInput, VALUE_KEYWORDS.self_enhancement) - 0.05),
    openness_to_change: clamp1(scoreDimension(rawInput, VALUE_KEYWORDS.openness_to_change)),
    conservation: clamp1(scoreDimension(rawInput, VALUE_KEYWORDS.conservation)),
    expressed: expressedValues
  };

  const narrative: SoulNarrative = inferNarrative(rawInput, interests);
  if (narrative.formative_stories.length === 0 || narrative.self_defining_memories.length === 0) {
    guessedFields.push("narrative");
  }

  const profile: SoulProfile = {
    personality: inferPersonality(interests, values),
    interests,
    values,
    narrative,
    avoid_topics: ["cruelty", "humiliation", "bad-faith arguments"],
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
