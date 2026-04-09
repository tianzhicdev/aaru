import type { Env } from "./env.ts";
import { callClaude, callClaudeJson, streamClaude } from "./claude.ts";
import { callFireworks, callFireworksJson, streamFireworks } from "./fireworks.ts";
import type { ModelProfileId, ModelTask, ModelTaskConfig } from "./modelProfiles.ts";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmJsonSchema {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

export interface LlmInvocationContext {
  profileId: ModelProfileId;
  task: ModelTask;
  userId?: string;
}

interface LlmProviderRequest {
  env: Env;
  config: ModelTaskConfig;
  systemPrompt: string;
  messages: LlmMessage[];
  context: LlmInvocationContext;
}

interface LlmProviderJsonRequest extends LlmProviderRequest {
  outputSchema: LlmJsonSchema;
}

interface LlmProviderClient {
  streamText(request: LlmProviderRequest): AsyncGenerator<string, void, undefined>;
  callText(request: LlmProviderRequest): Promise<string>;
  callJson<T>(request: LlmProviderJsonRequest): Promise<T>;
}

function getFireworksApiKey(env: Env): string {
  const apiKey = env.FIREWORKS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Fireworks API key for value model profile");
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

function getFireworksReasoningEffort(config: ModelTaskConfig): "none" | false | undefined {
  if (config.reasoningMode === "thinking") return undefined;
  if (config.reasoningMode === "disabled") return "none";
  return undefined;
}

function getFireworksThinking(config: ModelTaskConfig): { type: "enabled"; budget_tokens: number } | undefined {
  if (config.reasoningMode !== "thinking" || !config.thinkingBudget) return undefined;
  return { type: "enabled", budget_tokens: config.thinkingBudget };
}

const anthropicClient: LlmProviderClient = {
  streamText({ env, config, systemPrompt, messages }: LlmProviderRequest) {
    return streamClaude(systemPrompt, messages, {
      apiKey: env.ANTHROPIC_API_KEY,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature
    });
  },

  callText({ env, config, systemPrompt, messages }: LlmProviderRequest) {
    return callClaude(systemPrompt, messages, {
      apiKey: env.ANTHROPIC_API_KEY,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature
    });
  },

  callJson<T>({ env, config, systemPrompt, messages, outputSchema }: LlmProviderJsonRequest): Promise<T> {
    return callClaudeJson<T>(systemPrompt, messages, {
      apiKey: env.ANTHROPIC_API_KEY,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      toolSchema: {
        name: outputSchema.name,
        schema: outputSchema.schema
      }
    });
  }
};

const fireworksOpenAIClient: LlmProviderClient = {
  streamText({ env, config, systemPrompt, messages, context }: LlmProviderRequest) {
    return streamFireworks(systemPrompt, messages, {
      apiKey: getFireworksApiKey(env),
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      extraHeaders: getFireworksHeaders(context),
      reasoningEffort: getFireworksReasoningEffort(config),
      thinking: getFireworksThinking(config)
    });
  },

  callText({ env, config, systemPrompt, messages, context }: LlmProviderRequest) {
    return callFireworks(systemPrompt, messages, {
      apiKey: getFireworksApiKey(env),
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      extraHeaders: getFireworksHeaders(context),
      reasoningEffort: getFireworksReasoningEffort(config),
      thinking: getFireworksThinking(config)
    });
  },

  callJson<T>({
    env,
    config,
    systemPrompt,
    messages,
    context,
    outputSchema
  }: LlmProviderJsonRequest) {
    return callFireworksJson<T>(systemPrompt, messages, {
      apiKey: getFireworksApiKey(env),
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      extraHeaders: getFireworksHeaders(context),
      reasoningEffort: getFireworksReasoningEffort(config),
      thinking: getFireworksThinking(config),
      responseFormat: outputSchema
    });
  }
};

function parseJsonResponse<T>(rawText: string): T {
  const cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(cleaned) as T;
}

function getProviderClient(provider: ModelTaskConfig["provider"]): LlmProviderClient {
  switch (provider) {
    case "anthropic":
      return anthropicClient;
    case "fireworks_openai":
      return fireworksOpenAIClient;
  }

  const unreachableProvider: never = provider;
  throw new Error(`Unsupported LLM provider: ${unreachableProvider}`);
}

export async function* streamLlmText(
  env: Env,
  config: ModelTaskConfig,
  systemPrompt: string,
  messages: LlmMessage[],
  context: LlmInvocationContext
): AsyncGenerator<string, void, undefined> {
  yield* getProviderClient(config.provider).streamText({
    env,
    config,
    systemPrompt,
    messages,
    context
  });
}

export async function callLlmText(
  env: Env,
  config: ModelTaskConfig,
  systemPrompt: string,
  messages: LlmMessage[],
  context: LlmInvocationContext
): Promise<string> {
  return getProviderClient(config.provider).callText({
    env,
    config,
    systemPrompt,
    messages,
    context
  });
}

export async function callLlmJson<T>(
  env: Env,
  config: ModelTaskConfig,
  systemPrompt: string,
  messages: LlmMessage[],
  context: LlmInvocationContext,
  outputSchema: LlmJsonSchema
): Promise<T> {
  return getProviderClient(config.provider).callJson<T>({
    env,
    config,
    systemPrompt,
    messages,
    context,
    outputSchema
  });
}
