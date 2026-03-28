// Soul Mirror constants
export const REFLECTION_INTERVAL = 8;    // Run reflection + light extraction every N exchanges
export const STALE_SESSION_HOURS = 72;    // Sessions stay open longer (3 days)
export const SESSION_MAX_EXCHANGES = 15;  // Auto-trigger synthesis after N exchanges
export const SOFT_SESSION_GAP_MS = 60 * 60 * 1000; // 1 hour gap = soft session boundary
