import { z } from "zod";
import {
  WORLD_GRID_COLUMNS,
  WORLD_GRID_ROWS
} from "./constants.ts";

export const soulValuesSchema = z.object({
  self_transcendence: z.number().min(0).max(1),
  self_enhancement: z.number().min(0).max(1),
  openness_to_change: z.number().min(0).max(1),
  conservation: z.number().min(0).max(1),
  expressed: z.array(z.string())
});

export const soulNarrativeSchema = z.object({
  formative_stories: z.array(z.string()),
  self_defining_memories: z.array(z.string()),
  narrative_themes: z.array(z.string())
});

export const soulProfileSchema = z.object({
  personality: z.string().min(1),
  interests: z.array(z.string()).min(1),
  values: soulValuesSchema,
  narrative: soulNarrativeSchema,
  avoid_topics: z.array(z.string()),
  raw_input: z.string(),
  guessed_fields: z.array(z.string()).default([])
});

export const impressionEvaluationSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string().min(1).max(500),
  responsiveness: z.number().min(0).max(100).optional(),
  values_alignment: z.number().min(0).max(100).optional(),
  conversation_quality: z.number().min(0).max(100).optional(),
  interest_overlap: z.number().min(0).max(100).optional(),
  novelty: z.number().min(0).max(100).optional()
});

export const impressionFactorsSchema = z.object({
  responsiveness: z.number().min(0).max(100),
  values_alignment: z.number().min(0).max(100),
  conversation_quality: z.number().min(0).max(100),
  interest_overlap: z.number().min(0).max(100),
  novelty: z.number().min(0).max(100)
});

export const cellCoordSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0)
});

export const agentPositionSchema = z.object({
  user_id: z.string().uuid(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  target_x: z.number().min(0).max(1),
  target_y: z.number().min(0).max(1),
  cell_x: z.number().int().min(0).max(WORLD_GRID_COLUMNS - 1).optional(),
  cell_y: z.number().int().min(0).max(WORLD_GRID_ROWS - 1).optional(),
  target_cell_x: z.number().int().min(0).max(WORLD_GRID_COLUMNS - 1).optional(),
  target_cell_y: z.number().int().min(0).max(WORLD_GRID_ROWS - 1).optional(),
  path: z.array(cellCoordSchema).default([]),
  move_speed: z.number().nonnegative().default(1.8),
  state: z.enum(["wandering", "idle", "approaching", "chatting", "cooldown", "user_moving"]),
  behavior: z.enum(["wander", "idle", "drift_social", "drift_poi", "retreat"]).optional(),
  behavior_ticks_remaining: z.number().int().nonnegative().optional(),
  heading: z.number().int().min(0).max(7).optional(),
  user_target_cell_x: z.number().int().min(0).max(WORLD_GRID_COLUMNS - 1).nullable().optional(),
  user_target_cell_y: z.number().int().min(0).max(WORLD_GRID_ROWS - 1).nullable().optional(),
  user_directed: z.boolean().nullable().optional(),
  active_message: z.string().nullable(),
  conversation_id: z.string().uuid().nullable(),
  cooldown_until: z.string().datetime({ offset: true }).nullable()
});

export const worldMovementEventSchema = z.object({
  user_id: z.string().uuid(),
  from_cell_x: z.number().int().min(0).max(WORLD_GRID_COLUMNS - 1),
  from_cell_y: z.number().int().min(0).max(WORLD_GRID_ROWS - 1),
  to_cell_x: z.number().int().min(0).max(WORLD_GRID_COLUMNS - 1),
  to_cell_y: z.number().int().min(0).max(WORLD_GRID_ROWS - 1)
});

export const conversationMessageSchema = z.object({
  user_id: z.string().uuid(),
  type: z.enum(["ka_generated", "human_typed"]),
  content: z.string().min(1),
  created_at: z.string().datetime({ offset: true }).optional()
});

export const avatarConfigSchema = z.object({
  sprite_id: z.string().min(1),
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

export const worldConfigSchema = z.object({
  grid_columns: z.number().int().positive(),
  grid_rows: z.number().int().positive(),
  world_tick_ms: z.number().int().positive(),
  move_animation_ms: z.number().int().positive(),
  bubble_reading_wps: z.number().positive(),
  conversation_speaking_wps: z.number().positive(),
  conversation_turn_gap_ms: z.number().int().nonnegative(),
  min_bubble_display_ms: z.number().int().nonnegative(),
  min_reply_delay_ms: z.number().int().nonnegative(),
  camera_visible_columns: z.number().int().positive(),
  camera_visible_rows: z.number().int().positive(),
  agent_move_speed: z.number().positive().default(1.8)
});
