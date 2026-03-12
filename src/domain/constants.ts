export const WORLD_GRID_COLUMNS = 50;
export const WORLD_GRID_ROWS = 50;
export const WORLD_COOLDOWN_SECONDS = 10;
export const IMPRESSION_UNLOCK_THRESHOLD = 72;
export const IMPRESSION_EVALUATION_INTERVAL = 5;
export const KA_MESSAGES_PER_CONVERSATION = 10;
export const OFFLINE_MAX_CONVERSATIONS_PER_DAY = 10;
export const OFFLINE_MAX_MESSAGES_PER_CONVERSATION = 20;
export const WORLD_TICK_INTERVAL_MS = 1_000;
export const MOVE_ANIMATION_MS = 900;
export const AGENT_MOVE_SPEED = 1.8;
export const WANDER_PATH_MIN = 3;
export const WANDER_PATH_MAX = 6;
export const BUBBLE_READING_WORDS_PER_SECOND = 4;
export const CONVERSATION_SPEAKING_WORDS_PER_SECOND = 2.7;
export const CONVERSATION_TURN_GAP_MS = 300;
export const MIN_BUBBLE_DISPLAY_MS = 1_500;
export const MIN_REPLY_DELAY_MS = 2_000;
export const CAMERA_VISIBLE_COLUMNS = 7;
export const CAMERA_VISIBLE_ROWS = 9;
export const EARLY_PHASE_MESSAGES = 6;
export const MIDDLE_PHASE_MESSAGES = 10;
export const DEEP_PHASE_MESSAGES = 16;
export const EARLY_PHASE_MAX_ENCOUNTERS = 5;
export const MIDDLE_PHASE_MAX_ENCOUNTERS = 12;

export type ConversationPhase = "discovery" | "personal" | "depth";

export function getConversationPhase(encounterCount: number): ConversationPhase {
  if (encounterCount <= EARLY_PHASE_MAX_ENCOUNTERS) return "discovery";
  if (encounterCount <= MIDDLE_PHASE_MAX_ENCOUNTERS) return "personal";
  return "depth";
}

export function getMessagesForEncounter(encounterCount: number): number {
  const phase = getConversationPhase(encounterCount);
  switch (phase) {
    case "discovery": return EARLY_PHASE_MESSAGES;
    case "personal": return MIDDLE_PHASE_MESSAGES;
    case "depth": return DEEP_PHASE_MESSAGES;
  }
}
