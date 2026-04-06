import type { VisibleSoulFile } from "./schemas.ts";

export const COMPLETENESS_THRESHOLD = 0.7;

const COMPASS_AXES = [
  "openness", "vitality", "warmth", "depth",
  "purpose", "resilience", "autonomy", "connection"
] as const;

const PERSONALITY_TRAITS = [
  "openness", "conscientiousness", "extraversion",
  "agreeableness", "emotionalSensitivity"
] as const;

const SECTION_KEYS = [
  "howYouMove", "howYouThink", "howYouConnect",
  "whatYouCarry", "whatLightsYouUp", "yourTensions", "yourVoice"
] as const;

/**
 * Computes soul file completeness as a ratio of filled slots.
 *
 * 24 total slots:
 *  - portrait (1)
 *  - 7 sections
 *  - crystallizedMoments has any (1)
 *  - openThreads has any (1)
 *  - 8 compass axes
 *  - 5 personality traits
 *  - relationalStyle (1)
 */
export function computeSoulFileCompleteness(file: VisibleSoulFile): number {
  const TOTAL_SLOTS = 24;
  let filled = 0;

  // portrait
  if (file.portrait && file.portrait.trim().length > 0) filled++;

  // 7 sections
  for (const key of SECTION_KEYS) {
    if (file.sections[key] && file.sections[key].trim().length > 0) filled++;
  }

  // crystallizedMoments
  if (file.crystallizedMoments && file.crystallizedMoments.length > 0) filled++;

  // openThreads
  if (file.openThreads && file.openThreads.length > 0) filled++;

  // 8 compass axes
  const scores = file.compassScores ?? {};
  for (const axis of COMPASS_AXES) {
    if (typeof scores[axis] === "number" && scores[axis] !== null) filled++;
  }

  // 5 personality traits
  const spectrum = file.personalitySpectrum ?? {};
  for (const trait of PERSONALITY_TRAITS) {
    const entry = (spectrum as Record<string, unknown>)[trait];
    if (entry && typeof entry === "object" && "position" in (entry as Record<string, unknown>)) filled++;
  }

  // relationalStyle
  if (file.relationalStyle && file.relationalStyle.trim().length > 0) filled++;

  return Math.round((filled / TOTAL_SLOTS) * 100) / 100;
}
