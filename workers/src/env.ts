import type { BackgroundQueueBinding } from "./backgroundJobsQueue.ts";

export interface Env {
  DATABASE_URL: string;
  ANTHROPIC_API_KEY: string;
  THUMOS_SESSION_SECRET: string;
  BACKGROUND_QUEUE: BackgroundQueueBinding;
  XAI_TOKEN?: string;
  FIREWORKS_API_KEY?: string;
  FIREWORKS_API?: string;
  DEFAULT_MODEL_PROFILE_ID?: string;
}
