export interface NpcSeed {
  name: string;
  personality: string;
  interests: string[];
  values: string[];
}

/**
 * Pool of 15 NPC seeds. A sliding window of 5 is active at any time,
 * rotating 1 per week.
 */
export const NPC_POOL: NpcSeed[] = [
  { name: "Amunet", personality: "Amunet is warm, nurturing, and fascinated by growth and change.", interests: ["cooking", "gardening", "meditation"], values: ["resilience", "empathy", "balance"] },
  { name: "Bastet", personality: "Bastet is bold, direct, and appreciates honesty over politeness.", interests: ["rock climbing", "stand-up comedy", "cycling"], values: ["courage", "integrity", "freedom"] },
  { name: "Djedi", personality: "Djedi is dreamy, imaginative, and finds meaning in small details.", interests: ["watercolor painting", "mythology", "astronomy"], values: ["wonder", "patience", "depth"] },
  { name: "Eshe", personality: "Eshe is analytical, curious, and connects disparate ideas easily.", interests: ["robotics", "philosophy", "podcasts"], values: ["curiosity", "clarity", "growth"] },
  { name: "Femi", personality: "Femi is calm, grounded, and provides stability in conversation.", interests: ["jazz", "ceramics", "hiking"], values: ["kindness", "balance", "warmth"] },
  { name: "Gaspar", personality: "Gaspar is witty, quick, and uses humor to build connection.", interests: ["board games", "electronic music", "street art"], values: ["humor", "sincerity", "taste"] },
  { name: "Heka", personality: "Heka is philosophical, deep, and drawn to existential questions.", interests: ["vintage books", "calligraphy", "marine biology"], values: ["depth", "wonder", "integrity"] },
  { name: "Ineni", personality: "Ineni is energetic, spontaneous, and loves trying new things.", interests: ["surfing", "travel", "cooking"], values: ["freedom", "courage", "humor"] },
  { name: "Jabari", personality: "Jabari is empathetic, intuitive, and reads between the lines.", interests: ["creative writing", "theater", "yoga"], values: ["empathy", "attention", "care"] },
  { name: "Kamilah", personality: "Kamilah is creative, unconventional, and challenges assumptions.", interests: ["street art", "fashion history", "indie cinema"], values: ["taste", "curiosity", "resilience"] },
  { name: "Lotfi", personality: "Lotfi is patient, wise, and values silence as much as words.", interests: ["meditation", "calligraphy", "astronomy"], values: ["patience", "balance", "depth"] },
  { name: "Menat", personality: "Menat is passionate, expressive, and wears her heart on her sleeve.", interests: ["theater", "music scenes", "poetry"], values: ["sincerity", "warmth", "courage"] },
  { name: "Neferu", personality: "Neferu is methodical, precise, and finds beauty in structure.", interests: ["architecture", "robotics", "urban design"], values: ["clarity", "integrity", "attention"] },
  { name: "Osei", personality: "Osei is adventurous, fearless, and always seeking the next horizon.", interests: ["rock climbing", "surfing", "travel"], values: ["courage", "freedom", "growth"] },
  { name: "Ptah", personality: "Ptah is contemplative, serene, and drawn to nature and stillness.", interests: ["gardening", "hiking", "marine biology"], values: ["balance", "wonder", "patience"] },
];

/** Epoch for week numbering: 2026-01-05 (a Monday). */
const EPOCH_MS = Date.UTC(2026, 0, 5); // 2026-01-05T00:00:00Z
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns the week number since epoch for a given date.
 */
export function getWeekNumber(date: Date): number {
  return Math.floor((date.getTime() - EPOCH_MS) / MS_PER_WEEK);
}

/**
 * Deterministic sliding window: selects `windowSize` NPCs from the pool
 * based on the current week number. Each week, the window shifts by 1.
 */
export function selectActiveNpcs(
  allSeeds: NpcSeed[],
  currentDate: Date,
  windowSize: number = 5
): NpcSeed[] {
  if (allSeeds.length === 0) return [];
  const effectiveWindow = Math.min(windowSize, allSeeds.length);
  const week = getWeekNumber(currentDate);
  const startIndex = week % allSeeds.length;
  const result: NpcSeed[] = [];
  for (let i = 0; i < effectiveWindow; i++) {
    result.push(allSeeds[(startIndex + i) % allSeeds.length]);
  }
  return result;
}

/**
 * Returns the index in the pool of the NPC being swapped OUT this week
 * (i.e., the one that was in the window last week but not this week).
 * Returns null if there's no swap (pool <= window size).
 */
export function getDepartingIndex(
  poolSize: number,
  currentDate: Date,
  windowSize: number = 5
): number | null {
  if (poolSize <= windowSize) return null;
  const week = getWeekNumber(currentDate);
  // Last week's start was (week-1) % poolSize, so last week had index (week-1) % poolSize
  // This week starts at week % poolSize, so the departing NPC is last week's start
  return ((week - 1) % poolSize + poolSize) % poolSize;
}

/**
 * Returns the index in the pool of the NPC being swapped IN this week.
 * Returns null if there's no swap (pool <= window size).
 */
export function getArrivingIndex(
  poolSize: number,
  currentDate: Date,
  windowSize: number = 5
): number | null {
  if (poolSize <= windowSize) return null;
  const week = getWeekNumber(currentDate);
  const startIndex = week % poolSize;
  // The arriving NPC is at the end of the new window
  return (startIndex + windowSize - 1) % poolSize;
}
