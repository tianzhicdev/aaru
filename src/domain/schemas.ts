import { z } from "zod";

// ── Life Domains ──────────────────────────────────────────────

export const LIFE_DOMAINS = [
  "origins",
  "relationships",
  "work_and_purpose",
  "values_and_beliefs",
  "emotional_life",
  "growth_and_change",
  "aspirations"
] as const;

export type LifeDomain = typeof LIFE_DOMAINS[number];

export const DOMAIN_LABELS: Record<LifeDomain, string> = {
  origins: "Origins",
  relationships: "Relationships",
  work_and_purpose: "Work & Purpose",
  values_and_beliefs: "Values & Beliefs",
  emotional_life: "Emotional Life",
  growth_and_change: "Growth & Change",
  aspirations: "Aspirations"
};

// ── Shared Schemas ────────────────────────────────────────────

export const domainCoverageEntrySchema = z.object({
  domain: z.enum(LIFE_DOMAINS),
  depth: z.enum(["untouched", "mentioned", "explored", "deep"]),
  evidence: z.string().default("")
});

export type DomainCoverageEntry = z.infer<typeof domainCoverageEntrySchema>;

const spectrumEntrySchema = z.object({
  position: z.number().min(0).max(100),
  label: z.string(),
  evidence: z.string()
});

const personalitySpectrumDefaults = {
  openness: null,
  conscientiousness: null,
  extraversion: null,
  agreeableness: null,
  emotionalSensitivity: null
} as const;

export const personalitySpectrumSchema = z.object({
  openness: spectrumEntrySchema.nullable().default(null),
  conscientiousness: spectrumEntrySchema.nullable().default(null),
  extraversion: spectrumEntrySchema.nullable().default(null),
  agreeableness: spectrumEntrySchema.nullable().default(null),
  emotionalSensitivity: spectrumEntrySchema.nullable().default(null)
}).default(personalitySpectrumDefaults);

export const crystallizedMomentSchema = z.object({
  quote: z.string(),
  reflection: z.string()
});

export const topValueSchema = z.object({
  value: z.string(),
  description: z.string()
});

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

export const steeringPressureSchema = z.enum([
  "minimal",
  "gentle",
  "moderate",
  "strong"
]);

export type SteeringPressure = z.infer<typeof steeringPressureSchema>;

// ── Reflection Note ───────────────────────────────────────────

export const reflectionNoteSchema = z.object({
  updatedAt: z.string().default(""),

  // Steering (structured, enforced)
  domainCoverage: z.array(domainCoverageEntrySchema).default([]),
  currentThreads: z.array(z.string()).default([]),
  avoidPastObservations: z.array(z.string()).default([]),
  avoidPastQuestions: z.array(z.string()).default([]),
  steerToTopics: z.array(z.string()).default([]),
  steeringPressure: steeringPressureSchema.default("minimal"),
  steeringReasoning: z.string().default(""),

  // Summary (plain text narrative)
  summary: z.string().default("")
});

export type ReflectionNote = z.infer<typeof reflectionNoteSchema>;

// ── Visible Soul File ─────────────────────────────────────────

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
    yourTensions: z.string().default(""),
    yourVoice: z.string().default("")
  }).default({
    howYouMove: "",
    howYouThink: "",
    howYouConnect: "",
    whatYouCarry: "",
    whatLightsYouUp: "",
    yourTensions: "",
    yourVoice: ""
  }),
  crystallizedMoments: z.array(crystallizedMomentSchema).default([]),
  openThreads: z.array(z.string()).default([]),
  compassScores: z.record(z.string(), z.number().min(0).max(100).nullable()).default({}),
  personalitySpectrum: personalitySpectrumSchema,
  topValues: z.array(topValueSchema).default([]),
  relationalStyle: z.string().nullable().default(null),
  completeness: z.number().min(0).max(1).default(0)
});

export type VisibleSoulFile = z.infer<typeof visibleSoulFileSchema>;

// ── Hidden Soul File ──────────────────────────────────────────

export const depthMapSchema = z.object({
  domainCoverage: z.array(domainCoverageEntrySchema).default([])
}).default({
  domainCoverage: []
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
    psychologist: [],
    sociologist: [],
    linguist: [],
    narrativeAnalyst: []
  }),
  coreDrivers: z.array(coreDriverSchema).default([]),
  coreValues: z.array(z.string()).default([]),
  voice: voiceProfileSchema.default({
    register: "casual",
    density: "moderate",
    humorStyle: "",
    conflictStyle: "",
    disclosureRate: "gradual",
    signaturePatterns: [],
    voiceExamples: []
  }),
  depthMap: depthMapSchema,
  analystNotes: z.array(z.string()).default([]),
  honestInsights: z.array(z.string()).default([])
});

export type HiddenSoulFile = z.infer<typeof hiddenSoulFileSchema>;

// ── Soul Message ──────────────────────────────────────────────

export const soulMessageSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  created_at: z.string().datetime({ offset: true })
});

export type SoulMessage = z.infer<typeof soulMessageSchema>;
