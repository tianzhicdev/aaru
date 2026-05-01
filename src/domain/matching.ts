import { LIFE_DOMAINS, type DomainCoverageEntry, type LifeDomain, type VisibleSoulFile } from "./schemas.ts";

export const COMPLETENESS_THRESHOLD = 0.7;

export type CoverageDepth = "untouched" | "mentioned" | "explored" | "deep";

export const REQUIRED_COVERAGE_DEPTHS: ReadonlySet<CoverageDepth> = new Set(["explored", "deep"]);

export interface CoverageProgress {
  unlocked: boolean;
  exploredCount: number;
  totalDomains: number;
  perDomain: Record<LifeDomain, CoverageDepth>;
}

export function computeCoverageProgress(
  domainCoverage: readonly DomainCoverageEntry[] | null | undefined
): CoverageProgress {
  const perDomain = {} as Record<LifeDomain, CoverageDepth>;
  for (const domain of LIFE_DOMAINS) {
    perDomain[domain] = "untouched";
  }

  if (domainCoverage) {
    const allowed = new Set<string>(LIFE_DOMAINS);
    for (const entry of domainCoverage) {
      if (allowed.has(entry.domain)) {
        perDomain[entry.domain as LifeDomain] = entry.depth as CoverageDepth;
      }
    }
  }

  const exploredCount = LIFE_DOMAINS.reduce(
    (count, domain) => (REQUIRED_COVERAGE_DEPTHS.has(perDomain[domain]) ? count + 1 : count),
    0
  );

  return {
    unlocked: exploredCount === LIFE_DOMAINS.length,
    exploredCount,
    totalDomains: LIFE_DOMAINS.length,
    perDomain
  };
}

const COMPASS_AXES = [
  "openness", "playfulness", "warmth", "emotional_depth",
  "devotion", "resilience", "independence", "passion"
] as const;

const PERSONALITY_TRAITS = [
  "openness", "conscientiousness", "extraversion",
  "agreeableness", "emotionalSensitivity"
] as const;

const SECTION_KEYS = [
  "howYouLightUp", "howYouShowUp", "howYouLove",
  "howYouWeatherStorms", "whatYoureLookingFor", "yourGrowingEdges", "yourWarmth"
] as const;

/**
 * Computes soul file completeness as a ratio of filled slots.
 *
 * 26 total slots:
 *  - portrait (1)
 *  - 7 sections
 *  - crystallizedMoments has any (1)
 *  - openThreads has any (1)
 *  - 8 compass axes
 *  - 5 personality traits
 *  - relationalStyle (1)
 *  - attachmentStyle (1)
 *  - loveSignature (1)
 */
export function computeSoulFileCompleteness(file: VisibleSoulFile): number {
  const TOTAL_SLOTS = 26;
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

  // attachmentStyle
  if (file.attachmentStyle && file.attachmentStyle.trim().length > 0) filled++;

  // loveSignature
  if (file.loveSignature && file.loveSignature.trim().length > 0) filled++;

  return Math.round((filled / TOTAL_SLOTS) * 100) / 100;
}
