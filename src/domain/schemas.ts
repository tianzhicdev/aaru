import { z } from "zod";

// ── Life Domains (Romance-oriented) ─────────────────────────

export const LIFE_DOMAINS = [
  "daily_rhythm",
  "play_and_joy",
  "values_and_worldview",
  "love_language",
  "conflict_and_repair",
  "vulnerability_and_trust",
  "partnership_vision"
] as const;

export type LifeDomain = typeof LIFE_DOMAINS[number];

export const DOMAIN_LABELS: Record<LifeDomain, string> = {
  daily_rhythm: "Daily Rhythm",
  play_and_joy: "Play & Joy",
  values_and_worldview: "Values & Worldview",
  love_language: "How You Love",
  conflict_and_repair: "Conflict & Repair",
  vulnerability_and_trust: "Vulnerability & Trust",
  partnership_vision: "Partnership Vision"
};

// ── Conversation Phases (Aron's escalation) ─────────────────

export const CONVERSATION_PHASES = ["spark", "kindling", "flame", "hearth"] as const;
export type ConversationPhase = typeof CONVERSATION_PHASES[number];

export interface PhaseConfig {
  name: string;
  messageRange: [number, number | null];
  allowedDomains: LifeDomain[];
  tone: string;
}

export const PHASE_CONFIGS: Record<ConversationPhase, PhaseConfig> = {
  spark: {
    name: "Spark",
    messageRange: [1, 15],
    allowedDomains: ["daily_rhythm", "play_and_joy"],
    tone: "Light, fun, \"what are you looking for?\""
  },
  kindling: {
    name: "Kindling",
    messageRange: [15, 35],
    allowedDomains: ["daily_rhythm", "play_and_joy", "values_and_worldview", "love_language"],
    tone: "Warmer, \"what do you really need?\""
  },
  flame: {
    name: "Flame",
    messageRange: [35, 60],
    allowedDomains: ["daily_rhythm", "play_and_joy", "values_and_worldview", "love_language", "conflict_and_repair", "vulnerability_and_trust"],
    tone: "Real, \"what you want vs. how you show up\""
  },
  hearth: {
    name: "Hearth",
    messageRange: [60, null],
    allowedDomains: ["daily_rhythm", "play_and_joy", "values_and_worldview", "love_language", "conflict_and_repair", "vulnerability_and_trust", "partnership_vision"],
    tone: "Deep, \"what partnership means to you\""
  }
};

export function getConversationPhase(messageCount: number): ConversationPhase {
  if (messageCount < 15) return "spark";
  if (messageCount < 35) return "kindling";
  if (messageCount < 60) return "flame";
  return "hearth";
}

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

export const userOpennessSchema = z.enum([
  "guarded",
  "warming",
  "open",
  "deep"
]);

export type UserOpenness = z.infer<typeof userOpennessSchema>;

export const reflectionNoteSchema = z.object({
  updatedAt: z.string().default(""),

  // Conversation phase
  conversationPhase: z.enum(CONVERSATION_PHASES).default("spark"),

  // Steering (structured, enforced)
  domainCoverage: z.array(domainCoverageEntrySchema).default([]),
  currentThreads: z.array(z.string()).default([]),
  avoidPastObservations: z.array(z.string()).default([]),
  avoidPastQuestions: z.array(z.string()).default([]),
  steerToTopics: z.array(z.string()).default([]),
  steeringPressure: steeringPressureSchema.default("minimal"),
  steeringReasoning: z.string().default(""),

  // Depth matching
  userOpenness: userOpennessSchema.default("warming"),
  opennessEvidence: z.string().default(""),

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
    howYouLightUp: z.string().default(""),
    howYouShowUp: z.string().default(""),
    howYouLove: z.string().default(""),
    howYouWeatherStorms: z.string().default(""),
    whatYoureLookingFor: z.string().default(""),
    yourGrowingEdges: z.string().default(""),
    yourWarmth: z.string().default("")
  }).default({
    howYouLightUp: "",
    howYouShowUp: "",
    howYouLove: "",
    howYouWeatherStorms: "",
    whatYoureLookingFor: "",
    yourGrowingEdges: "",
    yourWarmth: ""
  }),
  crystallizedMoments: z.array(crystallizedMomentSchema).default([]),
  openThreads: z.array(z.string()).default([]),
  compassScores: z.record(z.string(), z.number().min(0).max(100).nullable()).default({}),
  personalitySpectrum: personalitySpectrumSchema,
  topValues: z.array(topValueSchema).default([]),
  relationalStyle: z.string().nullable().default(null),
  attachmentStyle: z.string().nullable().default(null),
  loveSignature: z.string().nullable().default(null),
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
    relationshipScientist: z.array(z.string()).default([]),
    linguist: z.array(z.string()).default([]),
    attachmentAnalyst: z.array(z.string()).default([])
  }).default({
    psychologist: [],
    relationshipScientist: [],
    linguist: [],
    attachmentAnalyst: []
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
  attachmentAssessment: z.string().nullable().default(null),
  conflictProfile: z.string().nullable().default(null),
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
