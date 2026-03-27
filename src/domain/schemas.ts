import { z } from "zod";

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
