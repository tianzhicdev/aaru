import { soulProfileSchema, impressionEvaluationSchema, impressionFactorsSchema, agentPositionSchema, conversationMessageSchema, avatarConfigSchema, worldConfigSchema, worldMovementEventSchema, cellCoordSchema } from "../../../src/domain/schemas.ts";
import { z } from "zod";

export const generateSoulProfileRequestSchema = z.object({
  raw_input: z.string().default("")
});

export const generateSoulProfileResponseSchema = z.object({
  display_name: z.string().min(1),
  soul_profile: soulProfileSchema
});

export const worldTickRequestSchema = z.object({
  positions: z.array(agentPositionSchema),
  now: z.string().datetime().optional()
});

export const worldTickResponseSchema = z.object({
  positions: z.array(agentPositionSchema),
  movementEvents: z.array(worldMovementEventSchema),
  startedConversations: z.array(
    z.object({
      agentA: z.string().uuid(),
      agentB: z.string().uuid(),
      midpoint: z.object({
        x: z.number(),
        y: z.number()
      })
    })
  )
});

export const kaConverseRequestSchema = z.object({
  selfUserId: z.string().uuid(),
  selfName: z.string(),
  soulProfile: soulProfileSchema,
  newsSnippets: z.array(z.string()).default([]),
  history: z.array(conversationMessageSchema),
  suggestedTopics: z.array(z.string()).optional(),
  previousConversationSummary: z.string().optional(),
  encounterCount: z.number().int().nonnegative().optional()
});

export const kaConverseResponseSchema = conversationMessageSchema;

export const evaluateCompatibilityRequestSchema = z.object({
  soulA: soulProfileSchema,
  soulB: soulProfileSchema,
  transcript: z.array(conversationMessageSchema),
  self_name: z.string().optional(),
  other_name: z.string().optional(),
  previousScore: z.number().min(0).max(100).default(0),
  reciprocalScore: z.number().min(0).max(100).default(0),
  encounterCount: z.number().int().nonnegative().optional()
});

export const evaluateCompatibilityResponseSchema = z.object({
  evaluation: impressionEvaluationSchema,
  accumulatedScore: z.number().min(0).max(100),
  baUnlocked: z.boolean()
});

export const bootstrapUserRequestSchema = z.object({
  device_id: z.string().min(4)
});

export const conversationSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  impression_score: z.number().min(0).max(100),
  impression_summary: z.string(),
  impression_factors: impressionFactorsSchema.optional(),
  memory_summary: z.string().optional(),
  their_impression_score: z.number().min(0).max(100),
  their_impression_summary: z.string(),
  their_impression_factors: impressionFactorsSchema.optional(),
  their_memory_summary: z.string().optional(),
  encounter_count: z.number().int().nonnegative().default(0),
  phase: z.enum(["discovery", "personal", "depth"]).default("discovery"),
  status: z.string(),
  ba_unlocked: z.boolean(),
  ba_conversation_id: z.string().uuid().nullable().optional(),
  ba_message_count: z.number().int().nonnegative().optional()
});

export const bootstrapUserResponseSchema = z.object({
  user_id: z.string().uuid(),
  device_id: z.string(),
  display_name: z.string(),
  instance_id: z.string().uuid(),
  soul_profile: soulProfileSchema.nullable(),
  avatar: avatarConfigSchema,
  conversations: z.array(conversationSummarySchema),
  world: z.object({
    count: z.number().int().nonnegative(),
    config: worldConfigSchema,
    movement_events: z.array(worldMovementEventSchema),
    agents: z.array(agentPositionSchema.extend({
      display_name: z.string(),
      avatar: avatarConfigSchema,
      is_self: z.boolean()
    }))
  })
});

export const saveSoulProfileRequestSchema = z.object({
  device_id: z.string().min(4),
  profile: soulProfileSchema,
  display_name: z.string().min(1).optional()
});

export const saveAvatarRequestSchema = z.object({
  device_id: z.string().min(4),
  avatar: avatarConfigSchema
});

export const syncWorldRequestSchema = z.object({
  device_id: z.string().min(4)
});

export const broadcastAgentSchema = z.object({
  user_id: z.string().uuid(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  target_x: z.number().min(0).max(1),
  target_y: z.number().min(0).max(1),
  cell_x: z.number().int().nullable(),
  cell_y: z.number().int().nullable(),
  path: z.array(cellCoordSchema).default([]),
  move_speed: z.number().nonnegative().default(1.8),
  state: agentPositionSchema.shape.state,
  behavior: agentPositionSchema.shape.behavior.nullable(),
  heading: z.number().int().min(0).max(7).nullable(),
  active_message: z.string().nullable(),
  conversation_id: z.string().uuid().nullable()
});

export const worldBroadcastPayloadSchema = z.object({
  tick: z.number().int().nonnegative(),
  ts: z.number().nonnegative(),
  agents: z.array(broadcastAgentSchema)
});

export const syncWorldResponseSchema = z.object({
  count: z.number().int().nonnegative(),
  config: worldConfigSchema,
  movement_events: z.array(worldMovementEventSchema),
  agents: z.array(agentPositionSchema.extend({
    display_name: z.string(),
    avatar: avatarConfigSchema,
    is_self: z.boolean()
  }))
});

export const listConversationsRequestSchema = z.object({
  device_id: z.string().min(4)
});

export const listConversationsResponseSchema = z.array(conversationSummarySchema);

export const getConversationRequestSchema = z.object({
  device_id: z.string().min(4),
  conversation_id: z.string().uuid()
});

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  sender_name: z.string(),
  type: z.enum(["ka_generated", "human_typed"]),
  content: z.string(),
  created_at: z.string().optional()
});

export const baMessageSchema = z.object({
  id: z.string().uuid(),
  sender_name: z.string(),
  content: z.string(),
  created_at: z.string().optional()
});

export const conversationDetailSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  impression_score: z.number().min(0).max(100),
  impression_summary: z.string(),
  impression_factors: impressionFactorsSchema.optional(),
  memory_summary: z.string().optional(),
  their_impression_score: z.number().min(0).max(100),
  their_impression_summary: z.string(),
  their_impression_factors: impressionFactorsSchema.optional(),
  their_memory_summary: z.string().optional(),
  encounter_count: z.number().int().nonnegative().default(0),
  phase: z.enum(["discovery", "personal", "depth"]).default("discovery"),
  status: z.string(),
  ba_unlocked: z.boolean(),
  other_soul: soulProfileSchema.nullable(),
  messages: z.array(chatMessageSchema),
  ba_conversation_id: z.string().uuid().nullable().optional(),
  ba_messages: z.array(baMessageSchema).optional()
});

export const sendHumanMessageRequestSchema = z.object({
  device_id: z.string().min(4),
  conversation_id: z.string().uuid(),
  content: z.string().min(1)
});

export const sendBaMessageRequestSchema = z.object({
  device_id: z.string().min(4),
  conversation_id: z.string().uuid(),
  content: z.string().min(1)
});

// ── Presence ──────────────────────────────────────────────────

export const heartbeatRequestSchema = z.object({
  device_id: z.string().min(4)
});

export const registerPushTokenRequestSchema = z.object({
  device_id: z.string().min(4),
  device_token: z.string().min(1),
  platform: z.enum(["ios", "android"]).default("ios")
});

// ── User Tap Control ──────────────────────────────────────────────

export const tapCellRequestSchema = z.object({
  device_id: z.string().min(4),
  target_cell_x: z.number().int().min(0),
  target_cell_y: z.number().int().min(0)
});

export const tapCellResponseSchema = z.object({
  path: z.array(z.object({ x: z.number().int(), y: z.number().int() })),
  estimated_duration_ms: z.number().int().nonnegative()
});

export const tapCharacterRequestSchema = z.object({
  device_id: z.string().min(4),
  target_user_id: z.string().uuid()
});

export const tapCharacterResponseSchema = z.object({
  path: z.array(z.object({ x: z.number().int(), y: z.number().int() })),
  estimated_duration_ms: z.number().int().nonnegative()
});

// ── Transcription ──────────────────────────────────────────────

export const transcribeAudioRequestSchema = z.object({
  audio_base64: z.string().min(1),
  mime_type: z.string().default("audio/m4a")
});

export const transcribeAudioResponseSchema = z.object({
  transcript: z.string()
});
