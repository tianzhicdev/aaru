import { afterEach, describe, expect, it, vi } from "vitest";
import { streamAnthropicCompatible } from "../../workers/src/anthropicCompatible.ts";

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
