export const WORLD_GRID_COLUMNS = 10;
export const WORLD_GRID_ROWS = 14;
export const WORLD_COOLDOWN_SECONDS = 10;
export const IMPRESSION_UNLOCK_THRESHOLD = 72;
export const IMPRESSION_EVALUATION_INTERVAL = 5;
export const KA_MESSAGES_PER_CONVERSATION = 10;
export const OFFLINE_MAX_CONVERSATIONS_PER_DAY = 10;
export const OFFLINE_MAX_MESSAGES_PER_CONVERSATION = 20;

// Soul Mirror constants
export const REFLECTION_INTERVAL = 8;   // Run reflection + light extraction every N exchanges
export const STALE_SESSION_HOURS = 72;   // Sessions stay open longer (3 days)

/** @deprecated Use REFLECTION_INTERVAL instead */
export const EXTRACTION_INTERVAL = REFLECTION_INTERVAL;
