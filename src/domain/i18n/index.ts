import type { Language, LocalizedPrompts } from "./types.ts";
import { DEFAULT_LANGUAGE, LANGUAGE_META } from "./types.ts";
import { en } from "./en.ts";
import { zhCN } from "./zh-CN.ts";
import { ja } from "./ja.ts";
import { fr } from "./fr.ts";
import { es } from "./es.ts";

const PROMPTS: Record<Language, LocalizedPrompts> = {
  "en": en,
  "zh-CN": zhCN,
  "ja": ja,
  "fr": fr,
  "es": es
};

export function getPrompts(language?: string | null): LocalizedPrompts {
  if (language && language in PROMPTS) {
    return PROMPTS[language as Language];
  }
  return PROMPTS[DEFAULT_LANGUAGE];
}

export function isValidLanguage(value: string): value is Language {
  return value in PROMPTS;
}

export function getLanguageDirective(language?: string | null): string {
  const meta = language && language in LANGUAGE_META
    ? LANGUAGE_META[language as Language]
    : null;
  if (!meta || meta.code === "en") return "";
  return `\nLANGUAGE: Respond entirely in ${meta.nativeName}. All text content must be in ${meta.nativeName}.`;
}

export { type Language, type LocalizedPrompts, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, LANGUAGE_META } from "./types.ts";
