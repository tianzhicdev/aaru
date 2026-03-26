import { describe, it, expect } from "vitest";
import {
  buildExtractionPrompt,
  parseSoulFileUpdate,
  mergeSoulFile,
  emptySoulFile
} from "../../src/domain/soulFile.ts";
import type { SoulFile } from "../../src/domain/schemas.ts";

describe("buildExtractionPrompt", () => {
  it("builds prompt for first session", () => {
    const messages = [
      { role: "assistant", content: "What's something most people don't see?" },
      { role: "user", content: "I build walls to protect my creative space." }
    ];
    const prompt = buildExtractionPrompt(messages, null, 1);
    expect(prompt).toContain("session 1");
    expect(prompt).toContain("first session");
    expect(prompt).toContain("I build walls");
  });

  it("builds prompt for subsequent session with existing soul file", () => {
    const existing: SoulFile = {
      essence: "A builder who creates worlds",
      tensions: [{ left: "Solitude", right: "Connection" }],
      comes_alive: "Late-night flow states",
      running_from: "Being truly seen",
      your_words: ["I built walls"],
      evolution: [],
      session_count: 1
    };
    const messages = [
      { role: "assistant", content: "Last time you talked about walls." },
      { role: "user", content: "I found the door." }
    ];
    const prompt = buildExtractionPrompt(messages, existing, 2);
    expect(prompt).toContain("session 2");
    expect(prompt).toContain("A builder who creates worlds");
    expect(prompt).toContain("I found the door");
  });
});

describe("parseSoulFileUpdate", () => {
  it("parses valid JSON extraction", () => {
    const raw = JSON.stringify({
      essence: "A builder who creates worlds alone",
      tensions: [{ left: "Solitude", right: "Connection" }],
      comes_alive: "Late-night flow states",
      running_from: "Being truly seen",
      your_words: ["I built walls to protect my creative space."],
      evolution_insight: "The Door emerged as a metaphor for selective connection."
    });
    const result = parseSoulFileUpdate(raw);
    expect(result).not.toBeNull();
    expect(result!.essence).toBe("A builder who creates worlds alone");
    expect(result!.tensions).toHaveLength(1);
    expect(result!.your_words).toHaveLength(1);
  });

  it("handles JSON wrapped in markdown code fences", () => {
    const raw = '```json\n{"essence": "A dreamer"}\n```';
    const result = parseSoulFileUpdate(raw);
    expect(result).not.toBeNull();
    expect(result!.essence).toBe("A dreamer");
  });

  it("returns null for invalid JSON", () => {
    expect(parseSoulFileUpdate("not json at all")).toBeNull();
    expect(parseSoulFileUpdate("")).toBeNull();
  });

  it("truncates overly long fields", () => {
    const raw = JSON.stringify({
      essence: "A".repeat(600)
    });
    const result = parseSoulFileUpdate(raw);
    expect(result!.essence!.length).toBeLessThanOrEqual(500);
  });

  it("filters invalid tension objects", () => {
    const raw = JSON.stringify({
      tensions: [
        { left: "Solitude", right: "Connection" },
        { invalid: true },
        "not an object"
      ]
    });
    const result = parseSoulFileUpdate(raw);
    expect(result!.tensions).toHaveLength(1);
  });
});

describe("mergeSoulFile", () => {
  it("creates new soul file from first session", () => {
    const update = {
      essence: "A builder who creates worlds",
      tensions: [{ left: "Solitude", right: "Connection" }],
      comes_alive: "Late-night flow states",
      your_words: ["I built walls"]
    };
    const merged = mergeSoulFile(null, update, 1);
    expect(merged.essence).toBe("A builder who creates worlds");
    expect(merged.tensions).toHaveLength(1);
    expect(merged.session_count).toBe(1);
  });

  it("updates essence on subsequent session", () => {
    const existing: SoulFile = {
      essence: "A builder",
      tensions: [],
      comes_alive: null,
      running_from: null,
      your_words: [],
      evolution: [],
      session_count: 1
    };
    const update = { essence: "A builder who found the door" };
    const merged = mergeSoulFile(existing, update, 2);
    expect(merged.essence).toBe("A builder who found the door");
    expect(merged.session_count).toBe(2);
  });

  it("merges tensions without duplicates", () => {
    const existing: SoulFile = {
      essence: null,
      tensions: [{ left: "Solitude", right: "Connection" }],
      comes_alive: null,
      running_from: null,
      your_words: [],
      evolution: [],
      session_count: 1
    };
    const update = {
      tensions: [
        { left: "Solitude", right: "Connection" }, // duplicate
        { left: "Control", right: "Surrender" } // new
      ]
    };
    const merged = mergeSoulFile(existing, update, 2);
    expect(merged.tensions).toHaveLength(2);
  });

  it("deduplicates quotes", () => {
    const existing: SoulFile = {
      essence: null,
      tensions: [],
      comes_alive: null,
      running_from: null,
      your_words: ["I built walls"],
      evolution: [],
      session_count: 1
    };
    const update = {
      your_words: ["I built walls", "I found the door"] // first is duplicate
    };
    const merged = mergeSoulFile(existing, update, 2);
    expect(merged.your_words).toHaveLength(2);
    expect(merged.your_words).toContain("I found the door");
  });

  it("appends evolution insight", () => {
    const existing: SoulFile = {
      essence: null,
      tensions: [],
      comes_alive: null,
      running_from: null,
      your_words: [],
      evolution: [{ session: 1, insight: "First insight", date: "2026-01-01" }],
      session_count: 1
    };
    const update = {
      evolution_insight: "The Door emerged as a metaphor"
    };
    const merged = mergeSoulFile(existing, update, 2);
    expect(merged.evolution).toHaveLength(2);
    expect(merged.evolution[1].session).toBe(2);
  });
});

describe("emptySoulFile", () => {
  it("returns a valid empty structure", () => {
    const empty = emptySoulFile();
    expect(empty.essence).toBeNull();
    expect(empty.tensions).toEqual([]);
    expect(empty.your_words).toEqual([]);
    expect(empty.session_count).toBe(0);
  });
});
