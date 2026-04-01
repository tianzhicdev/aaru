export type ModelProfileId = "frontier_v1" | "value_v1";
export type ModelProvider = "anthropic" | "fireworks_openai";
export type ModelTask =
  | "conversation"
  | "reflection_snapshot"
  | "synthesis_assessment"
  | "synthesis_visible"
  | "synthesis_hidden";

export type ReasoningMode = "default" | "disabled";

export interface ModelTaskConfig {
  provider: ModelProvider;
  model: string;
  maxTokens: number;
  temperature: number;
  reasoningMode?: ReasoningMode;
}

export interface ModelProfile {
  id: ModelProfileId;
  label: string;
  tasks: Record<ModelTask, ModelTaskConfig>;
}

export interface ModelProfileOption {
  id: ModelProfileId;
  label: string;
}

export const DEFAULT_MODEL_PROFILE_ID: ModelProfileId = "frontier_v1";

const PROFILES: Record<ModelProfileId, ModelProfile> = {
  frontier_v1: {
    id: "frontier_v1",
    label: "Current Anthropic frontier stack",
    tasks: {
      conversation: {
        provider: "anthropic",
        model: "claude-opus-4-20250514",
        maxTokens: 1024,
        temperature: 0.8
      },
      reflection_snapshot: {
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        maxTokens: 4000,
        temperature: 0.2
      },
      synthesis_assessment: {
        provider: "anthropic",
        model: "claude-opus-4-20250514",
        maxTokens: 4096,
        temperature: 0.2
      },
      synthesis_visible: {
        provider: "anthropic",
        model: "claude-opus-4-20250514",
        maxTokens: 6144,
        temperature: 0.5
      },
      synthesis_hidden: {
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        maxTokens: 6144,
        temperature: 0.2
      }
    }
  },
  value_v1: {
    id: "value_v1",
    label: "Fireworks DeepSeek value stack",
    tasks: {
      conversation: {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/deepseek-v3p2",
        maxTokens: 1024,
        temperature: 0.8,
        reasoningMode: "disabled"
      },
      reflection_snapshot: {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/deepseek-v3p2",
        maxTokens: 4000,
        temperature: 0.2,
        reasoningMode: "disabled"
      },
      synthesis_assessment: {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/deepseek-v3p2",
        maxTokens: 4096,
        temperature: 0.2,
        reasoningMode: "disabled"
      },
      synthesis_visible: {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/deepseek-v3p2",
        maxTokens: 6144,
        temperature: 0.5,
        reasoningMode: "disabled"
      },
      synthesis_hidden: {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/deepseek-v3p2",
        maxTokens: 6144,
        temperature: 0.2,
        reasoningMode: "disabled"
      }
    }
  }
};

export function normalizeModelProfileId(value: unknown): ModelProfileId {
  return value === "value_v1" ? "value_v1" : DEFAULT_MODEL_PROFILE_ID;
}

export function defaultModelProfileIdFromEnv(env: {
  DEFAULT_MODEL_PROFILE_ID?: string | null;
}): ModelProfileId {
  return normalizeModelProfileId(env.DEFAULT_MODEL_PROFILE_ID);
}

export function getModelProfile(profileId: ModelProfileId): ModelProfile {
  return PROFILES[profileId];
}

export function isModelProfileId(value: unknown): value is ModelProfileId {
  return value === "frontier_v1" || value === "value_v1";
}

export function listModelProfiles(): ModelProfileOption[] {
  return Object.values(PROFILES).map(({ id, label }) => ({ id, label }));
}

export function getTaskConfig(
  profileId: ModelProfileId,
  task: ModelTask
): ModelTaskConfig {
  return getModelProfile(profileId).tasks[task];
}
