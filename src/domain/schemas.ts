import { z } from "zod";

export const soulProfileSchema = z.object({
  personality: z.string().min(1),
  interests: z.array(z.string()).min(1),
  values: z.array(z.string()).min(1),
  avoid_topics: z.array(z.string()),
  raw_input: z.string(),
  guessed_fields: z.array(z.string()).default([])
});

export const impressionEvaluationSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string().min(1).max(280)
});

export const agentPositionSchema = z.object({
  user_id: z.string().uuid(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  target_x: z.number().min(0).max(1),
  target_y: z.number().min(0).max(1),
  cell_x: z.number().int().min(0).max(9).optional(),
  cell_y: z.number().int().min(0).max(13).optional(),
  target_cell_x: z.number().int().min(0).max(9).optional(),
  target_cell_y: z.number().int().min(0).max(13).optional(),
  state: z.enum(["wandering", "approaching", "chatting", "cooldown"]),
  active_message: z.string().nullable(),
  conversation_id: z.string().uuid().nullable(),
  cooldown_until: z.string().datetime({ offset: true }).nullable()
});

export const worldMovementEventSchema = z.object({
  user_id: z.string().uuid(),
  from_cell_x: z.number().int().min(0).max(9),
  from_cell_y: z.number().int().min(0).max(13),
  to_cell_x: z.number().int().min(0).max(9),
  to_cell_y: z.number().int().min(0).max(13)
});

export const conversationMessageSchema = z.object({
  user_id: z.string().uuid(),
  type: z.enum(["ka_generated", "human_typed"]),
  content: z.string().min(1),
  created_at: z.string().datetime({ offset: true }).optional()
});

// Soul Mirror schemas
export const soulFileSchema = z.object({
  user_id: z.string().uuid().optional(),
  essence: z.string().nullable().default(null),
  tensions: z.array(z.object({
    left: z.string(),
    right: z.string(),
    position: z.number().min(0).max(100).optional()
  })).default([]),
  comes_alive: z.string().nullable().default(null),
  running_from: z.string().nullable().default(null),
  your_words: z.array(z.string()).default([]),
  evolution: z.array(z.object({
    session: z.number(),
    insight: z.string(),
    date: z.string()
  })).default([]),
  session_count: z.number().int().default(0)
});

export const soulSessionSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  session_number: z.number().int().min(1),
  status: z.enum(["in_session", "extracting", "complete", "failed"]).default("in_session"),
  exchange_count: z.number().int().default(0),
  started_at: z.string().datetime({ offset: true }).optional(),
  completed_at: z.string().datetime({ offset: true }).nullable().optional(),
  next_available_at: z.string().datetime({ offset: true }).nullable().optional(),
  extraction_error: z.string().nullable().optional()
});

export const soulMessageSchema = z.object({
  id: z.string().uuid().optional(),
  session_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  created_at: z.string().datetime({ offset: true }).optional()
});

export type SoulFile = z.infer<typeof soulFileSchema>;
export type SoulSession = z.infer<typeof soulSessionSchema>;
export type SoulMessage = z.infer<typeof soulMessageSchema>;

export const avatarConfigSchema = z.object({
  body_shape: z.string().min(1),
  skin_tone: z.string().min(1),
  hair_style: z.string().min(1),
  hair_color: z.string().min(1),
  eyes: z.string().min(1),
  outfit_top: z.string().min(1),
  outfit_bottom: z.string().min(1),
  accessory: z.string().nullable().optional(),
  aura_color: z.string().min(1)
});
