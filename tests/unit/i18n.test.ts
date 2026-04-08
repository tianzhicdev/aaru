import { describe, expect, it } from "vitest";

import { getPrompts, isValidLanguage, getLanguageDirective, SUPPORTED_LANGUAGES } from "../../src/domain/i18n/index.ts";

describe("i18n", () => {
  it("supports en, zh-CN, ja, fr", () => {
    expect(SUPPORTED_LANGUAGES).toContain("en");
    expect(SUPPORTED_LANGUAGES).toContain("zh-CN");
    expect(SUPPORTED_LANGUAGES).toContain("ja");
    expect(SUPPORTED_LANGUAGES).toContain("fr");
  });

  it("isValidLanguage accepts all supported languages", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(isValidLanguage(lang)).toBe(true);
    }
    expect(isValidLanguage("de")).toBe(false);
  });

  it("getPrompts returns prompts for each language", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const p = getPrompts(lang);
      expect(p.soul.preamble).toBeTruthy();
      expect(p.domains.labels.origins).toBeTruthy();
      expect(p.fallbacks.generic.length).toBeGreaterThan(0);
    }
  });

  it("getPrompts falls back to en for unknown language", () => {
    const p = getPrompts("de");
    expect(p.soul.preamble).toContain("Thumos");
    expect(p.soul.preamble).toContain("soul mirror");
  });

  it("Japanese prompts contain Japanese text", () => {
    const p = getPrompts("ja");
    expect(p.soul.preamble).toMatch(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/);
    expect(p.domains.labels.origins).toBe("ルーツ");
    expect(p.navigation.header).toMatch(/ナビゲーション/);
  });

  it("French prompts contain French text", () => {
    const p = getPrompts("fr");
    expect(p.soul.preamble).toContain("miroir");
    expect(p.domains.labels.origins).toBe("Origines");
    expect(p.navigation.header).toContain("NAVIGATION");
  });

  it("getLanguageDirective returns directive for non-English", () => {
    expect(getLanguageDirective("ja")).toContain("日本語");
    expect(getLanguageDirective("fr")).toContain("Français");
    expect(getLanguageDirective("zh-CN")).toContain("简体中文");
    expect(getLanguageDirective("en")).toBe("");
    expect(getLanguageDirective(null)).toBe("");
  });

  it("all languages have 7 domain labels and 7 opening pools", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      const p = getPrompts(lang);
      expect(Object.keys(p.domains.labels)).toHaveLength(7);
      expect(Object.keys(p.domains.openingPool)).toHaveLength(7);
      for (const pool of Object.values(p.domains.openingPool)) {
        expect(pool.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
