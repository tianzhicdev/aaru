import type { Env } from "./env.ts";
import { callClaude, streamClaude } from "./claude.ts";
import { callFireworks, streamFireworks } from "./fireworks.ts";
import type { ModelProfileId, ModelTask, ModelTaskConfig } from "./modelProfiles.ts";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmInvocationContext {
  profileId: ModelProfileId;
  task: ModelTask;
  userId?: string;
}

function getFireworksApiKey(env: Env): string {
  const apiKey = env.FIREWORKS_API_KEY ?? env.FIREWORKS_API;
  if (!apiKey) {
    throw new Error("Missing Fireworks API key for value_v1 model profile");
  }
  return apiKey;
}

function getFireworksHeaders(context: LlmInvocationContext): Record<string, string> {
  if (!context.userId) {
    return {};
  }

  return {
    "x-session-affinity": context.userId,
    "x-prompt-cache-isolation-key": context.userId
  };
}

export async function* streamLlmText(
  env: Env,
  config: ModelTaskConfig,
  systemPrompt: string,
  messages: LlmMessage[],
  context: LlmInvocationContext
): AsyncGenerator<string, void, undefined> {
  switch (config.provider) {
    case "anthropic":
      yield* streamClaude(systemPrompt, messages, {
        apiKey: env.ANTHROPIC_API_KEY,
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature
      });
      return;

    case "fireworks_anthropic":
      yield* streamFireworks(systemPrompt, messages, {
        apiKey: getFireworksApiKey(env),
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        extraHeaders: getFireworksHeaders(context)
      });
      return;
  }

  const unreachableProvider: never = config.provider;
  throw new Error(`Unsupported LLM provider: ${unreachableProvider}`);
}

export async function callLlmText(
  env: Env,
  config: ModelTaskConfig,
  systemPrompt: string,
  messages: LlmMessage[],
  context: LlmInvocationContext
): Promise<string> {
  switch (config.provider) {
    case "anthropic":
      return callClaude(systemPrompt, messages, {
        apiKey: env.ANTHROPIC_API_KEY,
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature
      });

    case "fireworks_anthropic":
      return callFireworks(systemPrompt, messages, {
        apiKey: getFireworksApiKey(env),
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        extraHeaders: getFireworksHeaders(context)
      });
  }

  const unreachableProvider: never = config.provider;
  throw new Error(`Unsupported LLM provider: ${unreachableProvider}`);
}
