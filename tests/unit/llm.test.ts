import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../workers/src/claude.ts", () => ({
  callClaude: vi.fn(),
  callClaudeJson: vi.fn(),
  streamClaude: vi.fn()
}));

vi.mock("../../workers/src/fireworks.ts", () => ({
  callFireworks: vi.fn(),
  callFireworksJson: vi.fn(),
  streamFireworks: vi.fn()
}));

import { callClaude, callClaudeJson, streamClaude } from "../../workers/src/claude.ts";
import { callFireworks, callFireworksJson, streamFireworks } from "../../workers/src/fireworks.ts";
import { callLlmJson, callLlmText, streamLlmText } from "../../workers/src/llm.ts";

describe("llm routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes anthropic tasks to Claude", async () => {
    vi.mocked(callClaude).mockResolvedValueOnce("hello");

    const result = await callLlmText(
      {
        DATABASE_URL: "mock",
        ANTHROPIC_API_KEY: "anthropic-key",
        THUMOS_SESSION_SECRET: "secret",
        BACKGROUND_QUEUE: { send: vi.fn() }
      },
      {
        provider: "anthropic",
        model: "claude-opus-4-20250514",
        maxTokens: 1024,
        temperature: 0.8
      },
      "system",
      [{ role: "user", content: "Hi" }],
      { profileId: "frontier", task: "conversation", userId: "user-1" }
    );

    expect(result).toBe("hello");
    expect(callClaude).toHaveBeenCalledOnce();
  });

  it("routes fireworks tasks to Fireworks and forwards affinity headers", async () => {
    vi.mocked(callFireworks).mockResolvedValueOnce("hello");

    const result = await callLlmText(
      {
        DATABASE_URL: "mock",
        ANTHROPIC_API_KEY: "anthropic-key",
        THUMOS_SESSION_SECRET: "secret",
        FIREWORKS_API_KEY: "fireworks-key",
        BACKGROUND_QUEUE: { send: vi.fn() }
      },
      {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/deepseek-v3p2",
        maxTokens: 1024,
        temperature: 0.8,
        reasoningMode: "disabled"
      },
      "system",
      [{ role: "user", content: "Hi" }],
      { profileId: "value_cjk", task: "conversation", userId: "user-1" }
    );

    expect(result).toBe("hello");
    expect(callFireworks).toHaveBeenCalledWith(
      "system",
      [{ role: "user", content: "Hi" }],
      expect.objectContaining({
        apiKey: "fireworks-key",
        reasoningEffort: "none",
        extraHeaders: expect.objectContaining({
          "x-session-affinity": "user-1",
          "x-prompt-cache-isolation-key": "user-1"
        })
      })
    );
  });

  it("falls back to Claude when fireworks key is missing", async () => {
    vi.mocked(callClaude).mockResolvedValueOnce("claude-fallback");

    const result = await callLlmText(
      {
        DATABASE_URL: "mock",
        ANTHROPIC_API_KEY: "anthropic-key",
        THUMOS_SESSION_SECRET: "secret",
        BACKGROUND_QUEUE: { send: vi.fn() }
      },
      {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/deepseek-v3p2",
        maxTokens: 1024,
        temperature: 0.8,
        reasoningMode: "disabled"
      },
      "system",
      [{ role: "user", content: "Hi" }],
      { profileId: "value_cjk", task: "conversation", userId: "user-1" }
    );

    expect(result).toBe("claude-fallback");
    expect(callClaude).toHaveBeenCalledOnce();
  });

  it("streams via the matching provider", async () => {
    vi.mocked(streamFireworks).mockReturnValueOnce((async function* () {
      yield "chunk";
    })());

    const chunks: string[] = [];
    for await (const chunk of streamLlmText(
      {
        DATABASE_URL: "mock",
        ANTHROPIC_API_KEY: "anthropic-key",
        THUMOS_SESSION_SECRET: "secret",
        FIREWORKS_API_KEY: "fireworks-key",
        BACKGROUND_QUEUE: { send: vi.fn() }
      },
      {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/deepseek-v3p2",
        maxTokens: 1024,
        temperature: 0.8,
        reasoningMode: "disabled"
      },
      "system",
      [{ role: "user", content: "Hi" }],
      { profileId: "value_cjk", task: "conversation", userId: "user-1" }
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["chunk"]);
    expect(streamFireworks).toHaveBeenCalledOnce();
    expect(streamClaude).not.toHaveBeenCalled();
  });

  it("calls provider-specific structured output path", async () => {
    vi.mocked(callFireworksJson).mockResolvedValueOnce({ ok: true });

    const result = await callLlmJson(
      {
        DATABASE_URL: "mock",
        ANTHROPIC_API_KEY: "anthropic-key",
        THUMOS_SESSION_SECRET: "secret",
        FIREWORKS_API_KEY: "fireworks-key",
        BACKGROUND_QUEUE: { send: vi.fn() }
      },
      {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/deepseek-v3p2",
        maxTokens: 1024,
        temperature: 0.2,
        reasoningMode: "disabled"
      },
      "system",
      [{ role: "user", content: "Hi" }],
      { profileId: "value_cjk", task: "reflection_snapshot", userId: "user-1" },
      {
        name: "reflection_note",
        schema: {
          type: "object"
        }
      }
    );

    expect(result).toEqual({ ok: true });
    expect(callFireworksJson).toHaveBeenCalledWith(
      "system",
      [{ role: "user", content: "Hi" }],
      expect.objectContaining({
        apiKey: "fireworks-key",
        reasoningEffort: "none",
        responseFormat: {
          name: "reflection_note",
          schema: { type: "object" }
        }
      })
    );
  });
});

describe("llm fallback chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseEnv = {
    DATABASE_URL: "mock",
    ANTHROPIC_API_KEY: "anthropic-key",
    THUMOS_SESSION_SECRET: "secret",
    FIREWORKS_API_KEY: "fireworks-key",
    BACKGROUND_QUEUE: { send: vi.fn() }
  };

  it("falls back to Claude Haiku when primary Fireworks fails", async () => {
    vi.mocked(callFireworks).mockRejectedValueOnce(new Error("GLM down"));
    vi.mocked(callClaude).mockResolvedValueOnce("claude-rescue");

    const result = await callLlmText(
      baseEnv,
      {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/glm-5",
        maxTokens: 1024,
        temperature: 0.8
      },
      "system",
      [{ role: "user", content: "Hi" }],
      { profileId: "value_default", task: "conversation", userId: "user-1" }
    );

    expect(result).toBe("claude-rescue");
    expect(callFireworks).toHaveBeenCalledOnce();
    expect(callClaude).toHaveBeenCalledOnce();
  });

  it("no fallback when primary is already Claude Haiku", async () => {
    vi.mocked(callClaude).mockRejectedValueOnce(new Error("Haiku down"));

    await expect(callLlmText(
      baseEnv,
      { provider: "anthropic", model: "claude-haiku-4-5-20251001", maxTokens: 1024, temperature: 0.8 },
      "system",
      [{ role: "user", content: "Hi" }],
      { profileId: "frontier", task: "reflection_snapshot", userId: "user-1" }
    )).rejects.toThrow("Haiku down");

    expect(callClaude).toHaveBeenCalledOnce();
  });

  it("logs warning on fallback step", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(callFireworks).mockRejectedValueOnce(new Error("GLM down"));
    vi.mocked(callClaude).mockResolvedValueOnce("ok");

    await callLlmText(
      baseEnv,
      {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/glm-5",
        maxTokens: 1024,
        temperature: 0.8
      },
      "system",
      [{ role: "user", content: "Hi" }],
      { profileId: "value_default", task: "conversation", userId: "user-1" }
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("LLM fallback:"),
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });

  it("streaming falls back to Claude Haiku when no tokens were yielded", async () => {
    vi.mocked(streamFireworks).mockReturnValueOnce((async function* () {
      throw new Error("GLM stream failed");
    })());
    vi.mocked(streamClaude).mockReturnValueOnce((async function* () {
      yield "rescue-chunk";
    })());

    const chunks: string[] = [];
    for await (const chunk of streamLlmText(
      baseEnv,
      {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/glm-5",
        maxTokens: 1024,
        temperature: 0.8
      },
      "system",
      [{ role: "user", content: "Hi" }],
      { profileId: "value_default", task: "conversation", userId: "user-1" }
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["rescue-chunk"]);
    expect(streamFireworks).toHaveBeenCalledOnce();
    expect(streamClaude).toHaveBeenCalledOnce();
  });

  it("streaming does not fall back after tokens were already yielded", async () => {
    vi.mocked(streamClaude).mockReturnValueOnce((async function* () {
      yield "partial";
      throw new Error("Mid-stream failure");
    })());

    const chunks: string[] = [];
    await expect(async () => {
      for await (const chunk of streamLlmText(
        baseEnv,
        { provider: "anthropic", model: "claude-opus-4-20250514", maxTokens: 1024, temperature: 0.8 },
        "system",
        [{ role: "user", content: "Hi" }],
        { profileId: "frontier", task: "conversation", userId: "user-1" }
      )) {
        chunks.push(chunk);
      }
    }).rejects.toThrow("Mid-stream failure");

    expect(chunks).toEqual(["partial"]);
    expect(streamFireworks).not.toHaveBeenCalled();
  });
});
