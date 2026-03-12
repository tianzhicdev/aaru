export type UUID = string;

export type AgentState = "wandering" | "idle" | "approaching" | "chatting" | "cooldown";

export type AgentBehavior = "wander" | "idle" | "drift_social" | "drift_poi" | "retreat";

export interface POI {
  x: number;
  y: number;
  label: string;
  radius: number;
  capacity: number;
}

export interface SoulValues {
  self_transcendence: number;   // 0-1 (universalism, benevolence)
  self_enhancement: number;     // 0-1 (achievement, power)
  openness_to_change: number;   // 0-1 (self-direction, stimulation)
  conservation: number;         // 0-1 (security, tradition)
  expressed: string[];          // free text for Ka conversation
}

export interface SoulNarrative {
  formative_stories: string[];      // 2-3 user-provided anecdotes
  self_defining_memories: string[]; // core emotional moments
  narrative_themes: string[];       // agency, communion, redemption, etc.
}

export interface SoulProfile {
  personality: string;
  interests: string[];
  values: SoulValues;
  narrative: SoulNarrative;
  avoid_topics: string[];
  raw_input: string;
  guessed_fields: string[];
}

export interface ImpressionEvaluation {
  score: number;
  summary: string;
  responsiveness?: number;    // 0-100
  values_alignment?: number;  // 0-100
  conversation_quality?: number; // 0-100
  interest_overlap?: number;  // 0-100
  novelty?: number;           // 0-100
}

export interface CellCoord {
  x: number;
  y: number;
}

export interface AgentPosition {
  user_id: UUID;
  x: number;
  y: number;
  target_x: number;
  target_y: number;
  cell_x?: number;
  cell_y?: number;
  target_cell_x?: number;
  target_cell_y?: number;
  path: CellCoord[];
  move_speed: number;
  state: AgentState;
  active_message: string | null;
  conversation_id: UUID | null;
  cooldown_until: string | null;
  behavior?: AgentBehavior;
  behavior_ticks_remaining?: number;
  heading?: number; // 0-7 compass direction
}

export interface WorldTickResult {
  positions: AgentPosition[];
  movementEvents: Array<{
    user_id: UUID;
    from_cell_x: number;
    from_cell_y: number;
    to_cell_x: number;
    to_cell_y: number;
  }>;
  startedConversations: Array<{
    agentA: UUID;
    agentB: UUID;
    midpoint: { x: number; y: number };
  }>;
}

export interface WorldConfig {
  gridColumns: number;
  gridRows: number;
  worldTickMs: number;
  moveAnimationMs: number;
  bubbleReadingWordsPerSecond: number;
  conversationSpeakingWordsPerSecond: number;
  conversationTurnGapMs: number;
  minBubbleDisplayMs: number;
  minReplyDelayMs: number;
  cameraVisibleColumns: number;
  cameraVisibleRows: number;
  agentMoveSpeed: number;
}

export interface ConversationMessage {
  user_id: UUID;
  type: "ka_generated" | "human_typed";
  content: string;
  created_at?: string;
}

export interface KaConversationContext {
  selfUserId: UUID;
  selfName: string;
  soulProfile: SoulProfile;
  newsSnippets: string[];
  suggestedTopics?: string[];
  history: ConversationMessage[];
  previousConversationSummary?: string;
  encounterCount?: number;  // how many times this pair has met
}
