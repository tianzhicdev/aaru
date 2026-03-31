import { callAnthropicCompatible, streamAnthropicCompatible } from "./anthropicCompatible.ts";

interface FireworksMessage {
  role: "user" | "assistant";
  content: string;
}

interface FireworksOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  extraHeaders?: Record<string, string>;
}

const FIREWORKS_MESSAGES_ENDPOINT = "https://api.fireworks.ai/inference/v1/messages";

function fireworksHeaders(apiKey: string, extraHeaders: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
    ...extraHeaders
  };
}

export function streamFireworks(
  systemPrompt: string,
  messages: FireworksMessage[],
  options: FireworksOptions
) {
  return streamAnthropicCompatible(systemPrompt, messages, {
    endpoint: FIREWORKS_MESSAGES_ENDPOINT,
    headers: fireworksHeaders(options.apiKey, options.extraHeaders),
    model: options.model,
    maxTokens: options.maxTokens,
    temperature: options.temperature
  });
}

export function callFireworks(
  systemPrompt: string,
  messages: FireworksMessage[],
  options: FireworksOptions
) {
  return callAnthropicCompatible(systemPrompt, messages, {
    endpoint: FIREWORKS_MESSAGES_ENDPOINT,
    headers: fireworksHeaders(options.apiKey, options.extraHeaders),
    model: options.model,
    maxTokens: options.maxTokens,
    temperature: options.temperature
  });
}
