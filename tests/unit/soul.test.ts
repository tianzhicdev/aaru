import { describe, it, expect } from "vitest";
import {
  buildSoulSystemPrompt,
  shouldCloseSession,
  cleanSessionCompleteMarker,
  parseSessionInsights,
  buildSoulFallbackResponse
} from "../../src/domain/soul.ts";
import type { SoulConversationContext } from "../../src/domain/soul.ts";
import { SESSION_MAX_EXCHANGES, SESSION_CLOSE_MIN_EXCHANGES } from "../../src/domain/constants.ts";

function makeContext(overrides: Partial<SoulConversationContext> = {}): SoulConversationContext {
  return {
    sessionNumber: 1,
    exchangeCount: 0,
    soulFile: null,
    previousSummaries: [],
    messages: [],
    ...overrides
  };
}

describe("buildSoulSystemPrompt", () => {
  it("includes first session context when no soul file", () => {
    const prompt = buildSoulSystemPrompt(makeContext());
    expect(prompt).toContain("session 1");
    expect(prompt).toContain("No soul file yet");
    expect(prompt).toContain("first session");
  });

  it("includes returning session context with soul file", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      sessionNumber: 3,
      soulFile: {
        essence: "A builder who creates worlds",
        tensions: [{ left: "Solitude", right: "Connection" }],
        comes_alive: "Late-night flow states",
        running_from: "Being truly seen",
        your_words: ["I built walls"],
        evolution: [],
        session_count: 2
      }
    }));
    expect(prompt).toContain("session 3");
    expect(prompt).toContain("A builder who creates worlds");
    expect(prompt).toContain("Solitude");
  });

  it("includes previous summaries when available", () => {
    const prompt = buildSoulSystemPrompt(makeContext({
      sessionNumber: 2,
      previousSummaries: ["Talked about creativity and loneliness"]
    }));
    expect(prompt).toContain("Talked about creativity and loneliness");
  });

  it("includes exchange count", () => {
    const prompt = buildSoulSystemPrompt(makeContext({ exchangeCount: 5 }));
    expect(prompt).toContain("exchange 5");
  });

  it("includes session closing instructions", () => {
    const prompt = buildSoulSystemPrompt(makeContext());
    expect(prompt).toContain("[SESSION_COMPLETE]");
    expect(prompt).toContain(`exchange ${SESSION_CLOSE_MIN_EXCHANGES}`);
  });
});

describe("shouldCloseSession", () => {
  it("returns true when response contains SESSION_COMPLETE marker", () => {
    expect(shouldCloseSession(10, "Here is my reflection. [SESSION_COMPLETE]")).toBe(true);
  });

  it("returns false for normal response under limit", () => {
    expect(shouldCloseSession(5, "Tell me more about that.")).toBe(false);
  });

  it("returns true when exchange count reaches max", () => {
    expect(shouldCloseSession(SESSION_MAX_EXCHANGES, "Any response")).toBe(true);
  });

  it("returns false just under max without marker", () => {
    expect(shouldCloseSession(SESSION_MAX_EXCHANGES - 1, "Any response")).toBe(false);
  });
});

describe("cleanSessionCompleteMarker", () => {
  it("removes marker from response", () => {
    expect(cleanSessionCompleteMarker("Great session. [SESSION_COMPLETE]")).toBe("Great session.");
  });

  it("handles response without marker", () => {
    expect(cleanSessionCompleteMarker("Normal response")).toBe("Normal response");
  });
});

describe("parseSessionInsights", () => {
  it("extracts insights from closing response", () => {
    const response = "You don't fear loneliness — you fear that connection requires giving up solitude. The Door emerged as your central metaphor. [SESSION_COMPLETE]";
    const insights = parseSessionInsights(response, 3);
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0].tag).toBe("New Insight");
    expect(insights[0].text.length).toBeGreaterThan(0);
  });

  it("provides default insight for empty response", () => {
    const insights = parseSessionInsights("ok", 1);
    expect(insights.length).toBe(1);
    expect(insights[0].tag).toBe("Session Reflection");
  });
});

describe("buildSoulFallbackResponse", () => {
  it("returns first session opener for session 1 exchange 0", () => {
    const response = buildSoulFallbackResponse(makeContext());
    expect(response).toContain("most people don't see");
  });

  it("returns returning session opener with soul file", () => {
    const response = buildSoulFallbackResponse(makeContext({
      sessionNumber: 2,
      exchangeCount: 0,
      soulFile: {
        essence: "A dreamer who builds alone",
        tensions: [],
        comes_alive: null,
        running_from: null,
        your_words: [],
        evolution: [],
        session_count: 1
      }
    }));
    expect(response).toContain("A dreamer");
  });

  it("returns generic fallback for mid-conversation", () => {
    const response = buildSoulFallbackResponse(makeContext({ exchangeCount: 3 }));
    expect(response.length).toBeGreaterThan(10);
  });
});
