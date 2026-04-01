interface OpenAICompatibleMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAICompatibleStreamDelta {
  content?: string;
  reasoning_content?: string;
}

interface OpenAICompatibleStreamChunk {
  choices?: Array<{
    delta?: OpenAICompatibleStreamDelta;
  }>;
}

interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

type OpenAICompatibleMessageContent = string | Array<{ type?: string; text?: string }> | undefined;

export interface OpenAICompatibleJsonSchema {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

interface OpenAICompatibleOptions {
  endpoint: string;
  headers: Record<string, string>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: "none" | false;
  responseFormat?: OpenAICompatibleJsonSchema;
}

function extractSseData(line: string): string | null {
  if (!line.startsWith("data:")) {
    return null;
  }
  return line.slice(5).trim();
}

function buildRequestBody(
  messages: OpenAICompatibleMessage[],
  options: OpenAICompatibleOptions,
  stream: boolean
) {
  return {
    model: options.model,
    messages,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    stream,
    ...(options.reasoningEffort !== undefined
      ? { reasoning_effort: options.reasoningEffort }
      : {}),
    ...(!stream && options.responseFormat
      ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: options.responseFormat.name,
              schema: options.responseFormat.schema,
              strict: options.responseFormat.strict ?? true
            }
          }
        }
      : {})
  };
}

function extractMessageText(content: OpenAICompatibleMessageContent): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

export async function* streamOpenAICompatible(
  messages: OpenAICompatibleMessage[],
  options: OpenAICompatibleOptions
): AsyncGenerator<string, void, undefined> {
  const response = await fetch(options.endpoint, {
    method: "POST",
    headers: options.headers,
    body: JSON.stringify(buildRequestBody(messages, options, true))
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
          const chunk = JSON.parse(data) as OpenAICompatibleStreamChunk;
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            yield content;
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

export async function callOpenAICompatibleText(
  messages: OpenAICompatibleMessage[],
  options: OpenAICompatibleOptions
): Promise<string> {
  const response = await fetch(options.endpoint, {
    method: "POST",
    headers: options.headers,
    body: JSON.stringify(buildRequestBody(messages, options, false))
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errorText}`);
  }

  const result = (await response.json()) as OpenAICompatibleResponse;
  const text = extractMessageText(result.choices?.[0]?.message?.content);
  if (!text) {
    throw new Error("No text content in LLM response");
  }
  return text;
}

export async function callOpenAICompatibleJson<T>(
  messages: OpenAICompatibleMessage[],
  options: OpenAICompatibleOptions & { responseFormat: OpenAICompatibleJsonSchema }
): Promise<T> {
  const rawText = await callOpenAICompatibleText(messages, options);
  return JSON.parse(rawText) as T;
}
