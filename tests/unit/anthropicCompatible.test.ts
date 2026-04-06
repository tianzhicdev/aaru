import { afterEach, describe, expect, it, vi } from "vitest";
import { callAnthropicCompatibleJson, streamAnthropicCompatible } from "../../workers/src/anthropicCompatible.ts";

describe("streamAnthropicCompatible", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("parses SSE data lines with or without a space after data:", async () => {
    const encoder = new TextEncoder();
    const body = [
      "event: message_start",
      'data:{"type":"message_start","message":{"id":"msg_1"}}',
      "",
      "event: content_block_delta",
      'data:{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}',
      "",
      "data: [DONE]",
      ""
    ].join("\n");

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(body));
            controller.close();
          }
        }),
        { status: 200 }
      )
    );

    const chunks: string[] = [];
    for await (const chunk of streamAnthropicCompatible(
      "system",
      [{ role: "user", content: "Hi" }],
      {
        endpoint: "https://example.com/messages",
        headers: { Authorization: "Bearer test" },
        model: "test-model",
        maxTokens: 128,
        temperature: 0.7
      }
    )) {
      chunks.push(chunk);
    }

    expect(chunks.join("")).toBe("Hello world");
  });
});

describe("callAnthropicCompatibleJson", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends tool_use request and extracts input from response", async () => {
    const mockInput = { summary: "Test summary", steeringPressure: "moderate" };

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        content: [
          {
            type: "tool_use",
            id: "toolu_123",
            name: "reflection_note",
            input: mockInput
          }
        ]
      }), { status: 200 })
    );

    const result = await callAnthropicCompatibleJson<typeof mockInput>(
      "system prompt",
      [{ role: "user", content: "analyze this" }],
      {
        endpoint: "https://api.anthropic.com/v1/messages",
        headers: { "x-api-key": "test" },
        model: "claude-haiku-4-5-20251001",
        maxTokens: 2048,
        temperature: 0.3,
        toolSchema: {
          name: "reflection_note",
          description: "Output structured JSON",
          schema: { type: "object", properties: { summary: { type: "string" } } }
        }
      }
    );

    expect(result).toEqual(mockInput);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].name).toBe("reflection_note");
    expect(body.tool_choice).toEqual({ type: "tool", name: "reflection_note" });
  });

  it("throws when no tool_use block in response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        content: [{ type: "text", text: "I cannot do that" }]
      }), { status: 200 })
    );

    await expect(
      callAnthropicCompatibleJson(
        "system",
        [{ role: "user", content: "test" }],
        {
          endpoint: "https://example.com",
          headers: {},
          toolSchema: { name: "test", description: "test", schema: {} }
        }
      )
    ).rejects.toThrow("No tool_use block");
  });
});
