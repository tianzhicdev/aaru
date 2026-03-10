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
