import { callAnthropicCompatible, callAnthropicCompatibleJson, streamAnthropicCompatible } from "./anthropicCompatible.ts";

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
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

  yield* streamAnthropicCompatible(systemPrompt, messages, {
    endpoint: "https://api.anthropic.com/v1/messages",
    headers: {
      "x-api-key": options.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    model,
    maxTokens,
    temperature
  });
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

  return callAnthropicCompatible(systemPrompt, messages, {
    endpoint: "https://api.anthropic.com/v1/messages",
    headers: {
      "x-api-key": options.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    model,
    maxTokens,
    temperature
  });
}

/**
 * Call Claude with forced JSON output via tool_use.
 * Forces the model to produce structured output matching the schema.
 */
export async function callClaudeJson<T>(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  options: {
    apiKey: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    toolSchema: { name: string; schema: Record<string, unknown> };
  }
): Promise<T> {
  const model = options.model ?? "claude-haiku-4-5-20251001";
  const maxTokens = options.maxTokens ?? 4096;
  const temperature = options.temperature ?? 0.3;

  return callAnthropicCompatibleJson<T>(systemPrompt, messages, {
    endpoint: "https://api.anthropic.com/v1/messages",
    headers: {
      "x-api-key": options.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    model,
    maxTokens,
    temperature,
    toolSchema: {
      name: options.toolSchema.name,
      description: `Output structured JSON matching the ${options.toolSchema.name} schema.`,
      schema: options.toolSchema.schema
    }
  });
}
