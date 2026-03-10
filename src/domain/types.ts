export type UUID = string;

export type AgentState = "wandering" | "approaching" | "chatting" | "cooldown";

export interface SoulProfile {
  personality: string;
  interests: string[];
  values: string[];
  avoid_topics: string[];
  raw_input: string;
  guessed_fields: string[];
}

export interface ImpressionEvaluation {
  score: number;
  summary: string;
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
  state: AgentState;
  active_message: string | null;
  conversation_id: UUID | null;
  cooldown_until: string | null;
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
}
