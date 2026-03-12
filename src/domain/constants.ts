export const WORLD_GRID_COLUMNS = 64;
export const WORLD_GRID_ROWS = 64;
export const WORLD_COOLDOWN_SECONDS = 10;
export const IMPRESSION_UNLOCK_THRESHOLD = 72;
export const IMPRESSION_EVALUATION_INTERVAL = 5;
export const KA_MESSAGES_PER_CONVERSATION = 10;
export const OFFLINE_MAX_CONVERSATIONS_PER_DAY = 10;
export const OFFLINE_MAX_MESSAGES_PER_CONVERSATION = 20;
export const WORLD_TICK_INTERVAL_MS = 1_000;
export const MOVE_ANIMATION_MS = 900;
export const AGENT_MOVE_SPEED = 1.8;
export const WANDER_PATH_MIN = 1;
export const WANDER_PATH_MAX = 15;
export const BUBBLE_READING_WORDS_PER_SECOND = 4;
export const CONVERSATION_SPEAKING_WORDS_PER_SECOND = 2.7;
export const CONVERSATION_TURN_GAP_MS = 300;
export const MIN_BUBBLE_DISPLAY_MS = 1_500;
export const MIN_REPLY_DELAY_MS = 2_000;
export const CAMERA_VISIBLE_COLUMNS = 28;
export const CAMERA_VISIBLE_ROWS = 36;

// ── Behavior system (Phase 1) ──
export const BEHAVIOR_TICK_MIN = 5;
export const BEHAVIOR_TICK_MAX = 10;
export const IDLE_DURATION_MIN = 3;
export const IDLE_DURATION_MAX = 10;
export const HEADING_CONTINUE_PROB = 0.70;
export const HEADING_DEVIATE_1_PROB = 0.20;
// remaining 0.10 = deviate ±2
export const DIRECTIONAL_PATH_MIN = 3;
export const DIRECTIONAL_PATH_MAX = 12;
export const WANDER_WEIGHT = 35;
export const IDLE_WEIGHT = 25;

// ── Behavior system (Phase 2) ──
export const DRIFT_SOCIAL_WEIGHT = 20;
export const DRIFT_POI_WEIGHT = 15;
export const RETREAT_WEIGHT = 5;
export const CLUSTER_RANGE = 8;
export const CLUSTER_MIN_SIZE = 2;
export const RETREAT_RANGE = 3;
export const RETREAT_MIN_CROWD = 3;
export const GREEDY_PATH_MIN = 3;
export const GREEDY_PATH_MAX = 8;
export const GREEDY_JITTER_PROB = 0.20;

// ── Points of Interest (Sunset Beach) ──
import type { POI } from "./types.ts";
export const WORLD_POIS: POI[] = [
  { label: "Boardwalk Center", x: 32, y: 4, radius: 3, capacity: 6 },
  { label: "Forest Clearing", x: 32, y: 12, radius: 2, capacity: 4 },
  { label: "Palm Grove East", x: 48, y: 26, radius: 2, capacity: 4 },
  { label: "Beach Center", x: 30, y: 35, radius: 3, capacity: 6 },
  { label: "Tide Pool Overlook", x: 20, y: 42, radius: 2, capacity: 3 },
];
