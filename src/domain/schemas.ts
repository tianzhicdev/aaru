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
  cell_x: z.number().int().min(0).max(99).optional(),
  cell_y: z.number().int().min(0).max(99).optional(),
  target_cell_x: z.number().int().min(0).max(99).optional(),
  target_cell_y: z.number().int().min(0).max(99).optional(),
  state: z.string().min(1),
  active_message: z.string().nullable(),
  conversation_id: z.string().uuid().nullable(),
  cooldown_until: z.string().datetime({ offset: true }).nullable()
});

export const worldMovementEventSchema = z.object({
  user_id: z.string().uuid(),
  from_cell_x: z.number().int().min(0).max(99),
  from_cell_y: z.number().int().min(0).max(99),
  to_cell_x: z.number().int().min(0).max(99),
  to_cell_y: z.number().int().min(0).max(99)
});

export const conversationMessageSchema = z.object({
  user_id: z.string().uuid(),
  type: z.enum(["ka_generated", "human_typed"]),
  content: z.string().min(1),
  created_at: z.string().datetime({ offset: true }).optional()
});

// ── Legacy Soul File (kept for migration) ──────────────────────

export const legacySoulFileSchema = z.object({
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

/** @deprecated Use VisibleSoulFile + HiddenSoulFile instead */
export type LegacySoulFile = z.infer<typeof legacySoulFileSchema>;

// Keep SoulFile as alias for backwards compatibility during migration
export const soulFileSchema = legacySoulFileSchema;
export type SoulFile = LegacySoulFile;

// ── Reflection Note ────────────────────────────────────────────

export const reflectionNoteSchema = z.object({
  updatedAtExchange: z.number().int(),
  factualAnchors: z.record(z.string(), z.string()).default({}),
  tensions: z.array(z.string()).default([]),
  recurringThemes: z.array(z.string()).default([]),
  notableAbsences: z.array(z.string()).default([]),
  emotionalArc: z.string().default("")
});

export type ReflectionNote = z.infer<typeof reflectionNoteSchema>;

// ── Visible Soul File (user-facing, poetic) ────────────────────

export const crystallizedMomentSchema = z.object({
  quote: z.string(),
  reflection: z.string()
});

export const visibleSoulFileSchema = z.object({
  version: z.number().int().default(1),
  lastUpdated: z.string().default(""),
  portrait: z.string().nullable().default(null),
  sections: z.object({
    howYouMove: z.string().default(""),
    howYouThink: z.string().default(""),
    howYouConnect: z.string().default(""),
    whatYouCarry: z.string().default(""),
    whatLightsYouUp: z.string().default(""),
    yourContradictions: z.string().default(""),
    yourVoice: z.string().default("")
  }).default({
    howYouMove: "", howYouThink: "", howYouConnect: "",
    whatYouCarry: "", whatLightsYouUp: "", yourContradictions: "", yourVoice: ""
  }),
  crystallizedMoments: z.array(crystallizedMomentSchema).default([]),
  openThreads: z.array(z.string()).default([])
});

export type VisibleSoulFile = z.infer<typeof visibleSoulFileSchema>;

// ── Hidden Soul File (agent-facing, clinical) ──────────────────

export const coreDriverSchema = z.object({
  driver: z.string(),
  strength: z.number().min(0).max(1),
  inferred: z.boolean(),
  evidence: z.string()
});

export const voiceProfileSchema = z.object({
  register: z.enum(["formal", "casual", "chameleon"]).default("casual"),
  density: z.enum(["sparse", "moderate", "dense"]).default("moderate"),
  humorStyle: z.string().default(""),
  conflictStyle: z.string().default(""),
  disclosureRate: z.enum(["guarded", "gradual", "open", "floods"]).default("gradual"),
  signaturePatterns: z.array(z.string()).default([]),
  voiceExamples: z.array(z.object({
    trigger: z.string(),
    response: z.string()
  })).default([])
});

export const depthMapSchema = z.object({
  safeEntryPoints: z.array(z.string()).default([]),
  unlockTopics: z.array(z.string()).default([]),
  avoidEarly: z.array(z.string()).default([]),
  currentlyLiveTopics: z.array(z.string()).default([])
});

export const hiddenSoulFileSchema = z.object({
  version: z.number().int().default(1),
  lastUpdated: z.string().default(""),
  confidence: z.enum(["low", "medium", "high"]).default("low"),
  expertReflections: z.object({
    psychologist: z.array(z.string()).default([]),
    sociologist: z.array(z.string()).default([]),
    linguist: z.array(z.string()).default([]),
    narrativeAnalyst: z.array(z.string()).default([])
  }).default({
    psychologist: [], sociologist: [], linguist: [], narrativeAnalyst: []
  }),
  coreDrivers: z.array(coreDriverSchema).default([]),
  coreValues: z.array(z.string()).default([]),
  voice: voiceProfileSchema.default({
    register: "casual", density: "moderate", humorStyle: "", conflictStyle: "",
    disclosureRate: "gradual", signaturePatterns: [], voiceExamples: []
  }),
  depthMap: depthMapSchema.default({
    safeEntryPoints: [], unlockTopics: [], avoidEarly: [], currentlyLiveTopics: []
  }),
  analystNotes: z.array(z.string()).default([])
});

export type HiddenSoulFile = z.infer<typeof hiddenSoulFileSchema>;

// ── Soul Session ───────────────────────────────────────────────

export const soulSessionSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  session_number: z.number().int().min(1),
  status: z.enum(["in_session", "extracting", "synthesizing", "complete", "failed"]).default("in_session"),
  exchange_count: z.number().int().default(0),
  reflection_notes: z.array(reflectionNoteSchema).default([]),
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
