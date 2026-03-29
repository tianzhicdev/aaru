interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeStreamEvent {
  type: string;
  delta?: { type: string; text?: string };
  content_block?: { type: string; text: string };
  message?: { id: string; usage: { input_tokens: number; output_tokens: number } };
  index?: number;
}

/**
 * Stream Claude responses as an async iterator of text tokens.
 * Used for soul conversations (SSE to client).
 */
export async function* streamClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  options: {
    apiKey: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): AsyncGenerator<string, void, undefined> {
  const model = options.model ?? "claude-opus-4-20250514";
  const maxTokens = options.maxTokens ?? 1024;
  const temperature = options.temperature ?? 0.8;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": options.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages,
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body from Claude API");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;

        try {
          const event: ClaudeStreamEvent = JSON.parse(data);
          if (event.type === "content_block_delta" && event.delta?.text) {
            yield event.delta.text;
          }
        } catch {
          console.warn("Malformed SSE chunk from Claude, skipping");
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Call Claude and get a complete text response.
 * Used for soul file extraction (Haiku).
 */
export async function callClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  options: {
    apiKey: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<string> {
  const model = options.model ?? "claude-haiku-4-5-20251001";
  const maxTokens = options.maxTokens ?? 2048;
  const temperature = options.temperature ?? 0.3;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": options.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorText}`);
  }

  const result = await response.json() as {
    content: Array<{ type: string; text?: string }>;
  };

  if (!result.content || result.content.length === 0) {
    throw new Error("Empty response from Claude API");
  }

  const textBlock = result.content.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("No text content in Claude response");
  }

  return textBlock.text;
}
