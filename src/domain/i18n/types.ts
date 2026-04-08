import type { LifeDomain } from "../schemas.ts";

export type Language = "en" | "zh-CN" | "ja" | "fr" | "es" | "ko" | "pt-BR" | "de";

export const SUPPORTED_LANGUAGES: readonly Language[] = ["en", "zh-CN", "ja", "fr", "es", "ko", "pt-BR", "de"] as const;
export const DEFAULT_LANGUAGE: Language = "en";

export interface LanguageMeta {
  code: Language;
  label: string;         // "English", "中文"
  nativeName: string;    // "English", "简体中文"
}

export const LANGUAGE_META: Record<Language, LanguageMeta> = {
  "en": { code: "en", label: "English", nativeName: "English" },
  "zh-CN": { code: "zh-CN", label: "Chinese", nativeName: "简体中文" },
  "ja": { code: "ja", label: "Japanese", nativeName: "日本語" },
  "fr": { code: "fr", label: "French", nativeName: "Français" },
  "es": { code: "es", label: "Spanish", nativeName: "Español" },
  "ko": { code: "ko", label: "Korean", nativeName: "한국어" },
  "pt-BR": { code: "pt-BR", label: "Portuguese", nativeName: "Português" },
  "de": { code: "de", label: "German", nativeName: "Deutsch" }
};

// ── Prompt string interfaces ─────────────────────────────────

export interface SoulPromptStrings {
  preamble: string;
  principles: string;
  pacing: string;
  difficultMoments: string;
  goodResponse: string;
  openingFirstEver: string;
  openingReturning: string;
}

export interface NavigationStrings {
  header: string;
  territoryMapHeader: string;
  exploreMarker: string;
  saturatedMarker: string;
  pressureLabel: string;
  activeThreadsLabel: string;
  steerTowardLabel: string;
  avoidObservationsLabel: string;
  avoidQuestionsLabel: string;
}

export interface DomainStrings {
  labels: Record<LifeDomain, string>;
  openingPool: Record<LifeDomain, string[]>;
}

export interface FallbackStrings {
  generic: string[];
  returningWithPortrait: string;   // template: {portrait}
  returningWithTopic: string;      // template: {topic}
  returningWithLastMessage: string; // template: {message}
  returningDefault: string;
}

export interface SynthesisStrings {
  visiblePreamble: string;
  visibleRules: string;
  hiddenPreamble: string;
  hiddenRules: string;
}

export interface ReflectionStrings {
  preamble: string;
  steeringSection: string;
  summarySection: string;
  rules: string;
}

export interface HandlerStrings {
  firstEverInstruction: string;    // template: {domainHint}
  returningInstruction: string;
  steerToward: string;             // template: {domain}
  weaveIn: string;                 // template: {headlines}
  doNotRepeat: string;
}

export interface LocalizedPrompts {
  soul: SoulPromptStrings;
  navigation: NavigationStrings;
  domains: DomainStrings;
  fallbacks: FallbackStrings;
  synthesis: SynthesisStrings;
  reflection: ReflectionStrings;
  handler: HandlerStrings;
}
