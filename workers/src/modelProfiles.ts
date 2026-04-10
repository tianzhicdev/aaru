export type ModelProfileId = "frontier" | "value_cjk" | "value_default";
export type ModelProvider = "anthropic" | "fireworks_openai";
export type ModelTask =
  | "conversation"
  | "reflection_snapshot"
  | "synthesis_assessment"
  | "synthesis_visible"
  | "synthesis_hidden"
  | "match_evaluation";

export type ReasoningMode = "default" | "disabled" | "thinking";

export interface ModelTaskConfig {
  provider: ModelProvider;
  model: string;
  maxTokens: number;
  temperature: number;
  reasoningMode?: ReasoningMode;
  thinkingBudget?: number;
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

export const DEFAULT_MODEL_PROFILE_ID: ModelProfileId = "value_default";

const CJK_LANGUAGES = new Set(["zh-CN", "ja", "ko"]);

export function profileForLanguage(language?: string | null): ModelProfileId {
  if (language && CJK_LANGUAGES.has(language)) return "value_cjk";
  return "value_default";
}

const PROFILES: Record<ModelProfileId, ModelProfile> = {
  frontier: {
    id: "frontier",
    label: "Anthropic frontier stack",
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
        maxTokens: 2000,
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
      },
      match_evaluation: {
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        maxTokens: 1024,
        temperature: 0.3
      }
    }
  },
  value_cjk: {
    id: "value_cjk",
    label: "DeepSeek V3.2 (CJK)",
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
        maxTokens: 2000,
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
        maxTokens: 4096,
        temperature: 0.5,
        reasoningMode: "disabled"
      },
      synthesis_hidden: {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/deepseek-v3p2",
        maxTokens: 4096,
        temperature: 0.2,
        reasoningMode: "disabled"
      },
      match_evaluation: {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/deepseek-v3p2",
        maxTokens: 1024,
        temperature: 0.3,
        reasoningMode: "disabled"
      }
    }
  },
  value_default: {
    id: "value_default",
    label: "Kimi K2 Thinking",
    tasks: {
      conversation: {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/kimi-k2-thinking",
        maxTokens: 1024,
        temperature: 0.8,
        reasoningMode: "thinking",
        thinkingBudget: 512
      },
      reflection_snapshot: {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/kimi-k2-thinking",
        maxTokens: 2000,
        temperature: 0.2,
        reasoningMode: "thinking",
        thinkingBudget: 4096
      },
      synthesis_assessment: {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/kimi-k2-thinking",
        maxTokens: 4096,
        temperature: 0.2,
        reasoningMode: "thinking",
        thinkingBudget: 4096
      },
      synthesis_visible: {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/kimi-k2-thinking",
        maxTokens: 4096,
        temperature: 0.5,
        reasoningMode: "thinking",
        thinkingBudget: 4096
      },
      synthesis_hidden: {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/kimi-k2-thinking",
        maxTokens: 4096,
        temperature: 0.2,
        reasoningMode: "thinking",
        thinkingBudget: 4096
      },
      match_evaluation: {
        provider: "fireworks_openai",
        model: "accounts/fireworks/models/kimi-k2-thinking",
        maxTokens: 1024,
        temperature: 0.3,
        reasoningMode: "thinking",
        thinkingBudget: 1024
      }
    }
  }
};

export function normalizeModelProfileId(value: unknown): ModelProfileId {
  if (value === "frontier" || value === "frontier_v1") return "frontier";
  if (value === "value_cjk" || value === "value_v1") return "value_cjk";
  if (value === "value_default" || value === "value_v2") return "value_default";
  return DEFAULT_MODEL_PROFILE_ID;
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
  return value === "frontier" || value === "value_cjk" || value === "value_default";
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
