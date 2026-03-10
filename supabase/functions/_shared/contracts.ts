import { soulProfileSchema, impressionEvaluationSchema, agentPositionSchema, conversationMessageSchema, avatarConfigSchema, worldMovementEventSchema } from "../../../src/domain/schemas.ts";
import { z } from "zod";

export const generateSoulProfileRequestSchema = z.object({
  raw_input: z.string().default("")
});

export const generateSoulProfileResponseSchema = soulProfileSchema;

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
  history: z.array(conversationMessageSchema)
});

export const kaConverseResponseSchema = conversationMessageSchema;

export const evaluateCompatibilityRequestSchema = z.object({
  soulA: soulProfileSchema,
  soulB: soulProfileSchema,
  transcript: z.array(conversationMessageSchema),
  previousScore: z.number().min(0).max(100).default(0),
  reciprocalScore: z.number().min(0).max(100).default(0)
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
  their_impression_score: z.number().min(0).max(100),
  their_impression_summary: z.string(),
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
    movement_events: z.array(worldMovementEventSchema),
    agents: z.array(agentPositionSchema.extend({
      display_name: z.string(),
      avatar: avatarConfigSchema,
      is_self: z.boolean()
    }))
  }),
  session: z.object({
    token: z.string().min(20),
    expires_at: z.string().datetime()
  })
});

export const saveSoulProfileRequestSchema = z.object({
  device_id: z.string().min(4),
  profile: soulProfileSchema
});

export const saveAvatarRequestSchema = z.object({
  device_id: z.string().min(4),
  avatar: avatarConfigSchema
});

export const syncWorldRequestSchema = z.object({
  device_id: z.string().min(4)
});

export const syncWorldResponseSchema = z.object({
  count: z.number().int().nonnegative(),
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
  their_impression_score: z.number().min(0).max(100),
  their_impression_summary: z.string(),
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

// ── Transcription ──────────────────────────────────────────────

export const transcribeAudioRequestSchema = z.object({
  audio_base64: z.string().min(1),
  mime_type: z.string().default("audio/m4a")
});

export const transcribeAudioResponseSchema = z.object({
  transcript: z.string()
});
