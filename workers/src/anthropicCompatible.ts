interface AnthropicCompatibleMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicCompatibleStreamEvent {
  type: string;
  delta?: { type: string; text?: string };
}

interface AnthropicCompatibleOptions {
  endpoint: string;
  headers: Record<string, string>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

function extractSseData(line: string): string | null {
  if (!line.startsWith("data:")) {
    return null;
  }
  return line.slice(5).trim();
}

export async function* streamAnthropicCompatible(
  systemPrompt: string,
  messages: AnthropicCompatibleMessage[],
  options: AnthropicCompatibleOptions
): AsyncGenerator<string, void, undefined> {
  const response = await fetch(options.endpoint, {
    method: "POST",
    headers: options.headers,
    body: JSON.stringify({
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      system: systemPrompt,
      messages,
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body from LLM API");
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
        const data = extractSseData(line);
        if (data === null) continue;
        if (data === "[DONE]") return;

        try {
          const event: AnthropicCompatibleStreamEvent = JSON.parse(data);
          if (event.type === "content_block_delta" && event.delta?.text) {
            yield event.delta.text;
          }
        } catch {
          console.warn("Malformed SSE chunk from LLM API, skipping");
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function callAnthropicCompatible(
  systemPrompt: string,
  messages: AnthropicCompatibleMessage[],
  options: AnthropicCompatibleOptions
): Promise<string> {
  const response = await fetch(options.endpoint, {
    method: "POST",
    headers: options.headers,
    body: JSON.stringify({
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      system: systemPrompt,
      messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errorText}`);
  }

  const result = await response.json() as {
    content: Array<{ type: string; text?: string }>;
  };

  if (!result.content || result.content.length === 0) {
    throw new Error("Empty response from LLM API");
  }

  const textBlock = result.content.find((block) => block.type === "text");
  if (!textBlock?.text) {
    throw new Error("No text content in LLM response");
  }

  return textBlock.text;
}
