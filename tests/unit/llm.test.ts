import { describe, expect, it, vi } from "vitest";

vi.mock("../../workers/src/claude.ts", () => ({
  callClaude: vi.fn(),
  streamClaude: vi.fn()
}));

vi.mock("../../workers/src/fireworks.ts", () => ({
  callFireworks: vi.fn(),
  streamFireworks: vi.fn()
}));

import { callClaude, streamClaude } from "../../workers/src/claude.ts";
import { callFireworks, streamFireworks } from "../../workers/src/fireworks.ts";
import { callLlmText, streamLlmText } from "../../workers/src/llm.ts";

describe("llm routing", () => {
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
      { profileId: "frontier_v1", task: "conversation", userId: "user-1" }
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
        FIREWORKS_API: "fireworks-key",
        BACKGROUND_QUEUE: { send: vi.fn() }
      },
      {
        provider: "fireworks_anthropic",
        model: "accounts/fireworks/models/deepseek-v3p2",
        maxTokens: 1024,
        temperature: 0.8
      },
      "system",
      [{ role: "user", content: "Hi" }],
      { profileId: "value_v1", task: "conversation", userId: "user-1" }
    );

    expect(result).toBe("hello");
    expect(callFireworks).toHaveBeenCalledWith(
      "system",
      [{ role: "user", content: "Hi" }],
      expect.objectContaining({
        apiKey: "fireworks-key",
        extraHeaders: expect.objectContaining({
          "x-session-affinity": "user-1",
          "x-prompt-cache-isolation-key": "user-1"
        })
      })
    );
  });

  it("throws when a fireworks profile is selected without a fireworks key", async () => {
    await expect(
      callLlmText(
        {
          DATABASE_URL: "mock",
          ANTHROPIC_API_KEY: "anthropic-key",
          THUMOS_SESSION_SECRET: "secret",
          BACKGROUND_QUEUE: { send: vi.fn() }
        },
        {
          provider: "fireworks_anthropic",
          model: "accounts/fireworks/models/deepseek-v3p2",
          maxTokens: 1024,
          temperature: 0.8
        },
        "system",
        [{ role: "user", content: "Hi" }],
        { profileId: "value_v1", task: "conversation", userId: "user-1" }
      )
    ).rejects.toThrow("Missing Fireworks API key");
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
        provider: "fireworks_anthropic",
        model: "accounts/fireworks/models/deepseek-v3p2",
        maxTokens: 1024,
        temperature: 0.8
      },
      "system",
      [{ role: "user", content: "Hi" }],
      { profileId: "value_v1", task: "conversation", userId: "user-1" }
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["chunk"]);
    expect(streamFireworks).toHaveBeenCalledOnce();
    expect(streamClaude).not.toHaveBeenCalled();
  });
});
