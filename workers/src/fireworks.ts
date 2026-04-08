import {
  callOpenAICompatibleJson,
  callOpenAICompatibleText,
  streamOpenAICompatible,
  type OpenAICompatibleJsonSchema
} from "./openaiCompatible.ts";

interface FireworksMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface FireworksOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  extraHeaders?: Record<string, string>;
  reasoningEffort?: "none" | false;
  thinking?: { type: "enabled"; budget_tokens: number };
}

const FIREWORKS_CHAT_COMPLETIONS_ENDPOINT = "https://api.fireworks.ai/inference/v1/chat/completions";

function fireworksHeaders(apiKey: string, extraHeaders: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    ...extraHeaders
  };
}

export function streamFireworks(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  options: FireworksOptions
) {
  return streamOpenAICompatible(
    [
      { role: "system", content: systemPrompt },
      ...messages
    ],
    {
      endpoint: FIREWORKS_CHAT_COMPLETIONS_ENDPOINT,
      headers: fireworksHeaders(options.apiKey, options.extraHeaders),
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      reasoningEffort: options.reasoningEffort,
      thinking: options.thinking
    }
  );
}

export function callFireworks(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  options: FireworksOptions
) {
  return callOpenAICompatibleText(
    [
      { role: "system", content: systemPrompt },
      ...messages
    ],
    {
      endpoint: FIREWORKS_CHAT_COMPLETIONS_ENDPOINT,
      headers: fireworksHeaders(options.apiKey, options.extraHeaders),
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      reasoningEffort: options.reasoningEffort,
      thinking: options.thinking
    }
  );
}

export function callFireworksJson<T>(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  options: FireworksOptions & { responseFormat: OpenAICompatibleJsonSchema }
) {
  return callOpenAICompatibleJson<T>(
    [
      { role: "system", content: systemPrompt },
      ...messages
    ],
    {
      endpoint: FIREWORKS_CHAT_COMPLETIONS_ENDPOINT,
      headers: fireworksHeaders(options.apiKey, options.extraHeaders),
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      reasoningEffort: options.reasoningEffort,
      thinking: options.thinking,
      responseFormat: options.responseFormat
    }
  );
}
