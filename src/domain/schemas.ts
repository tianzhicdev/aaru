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
  origins: "Origins — where you're from, childhood, formative experiences",
  relationships: "Relationships — family, friendships, romantic partners, social world",
  work_and_purpose: "Work & Purpose — career, daily routine, what drives you",
  values_and_beliefs: "Values & Beliefs — what matters most, worldview, spirituality",
  emotional_life: "Emotional Life — how you handle stress, fears, joy, vulnerability",
  growth_and_change: "Growth & Change — turning points, how you've evolved, resilience",
  aspirations: "Aspirations — hopes, dreams, what you're building toward"
};

// ── Domain Coverage ───────────────────────────────────────────

export const domainCoverageEntrySchema = z.object({
  domain: z.string(),
  depth: z.enum(["untouched", "mentioned", "explored", "deep"]),
  evidence: z.string().default("")
});

export type DomainCoverageEntry = z.infer<typeof domainCoverageEntrySchema>;

// ── Reflection Note ────────────────────────────────────────────

export const reflectionNoteSchema = z.object({
  updatedAt: z.string().default(""),
  factualAnchors: z.record(z.string(), z.string()).default({}),
  tensions: z.array(z.string()).default([]),
  recurringThemes: z.array(z.string()).default([]),
  notableAbsences: z.array(z.string()).default([]),
  emotionalArc: z.string().default(""),
  domainCoverage: z.array(domainCoverageEntrySchema).default([]),
  recentAssistantQuestions: z.array(z.string()).default([]),
  openLoops: z.array(z.string()).default([])
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
  openThreads: z.array(z.string()).default([]),
  compassScores: z.record(z.string(), z.number().nullable()).default({})
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
  currentlyLiveTopics: z.array(z.string()).default([]),
  domainCoverage: z.array(domainCoverageEntrySchema).default([])
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
    safeEntryPoints: [], unlockTopics: [], avoidEarly: [], currentlyLiveTopics: [], domainCoverage: []
  }),
  analystNotes: z.array(z.string()).default([])
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
