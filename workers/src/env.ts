import type { BackgroundQueueBinding } from "./backgroundJobsQueue.ts";

export interface Env {
  DATABASE_URL: string;
  ANTHROPIC_API_KEY: string;
  THUMOS_SESSION_SECRET: string;
  BACKGROUND_QUEUE: BackgroundQueueBinding;

  FIREWORKS_API_KEY?: string;
  DEFAULT_MODEL_PROFILE_ID?: string;
  DEBUG_API_TOKEN?: string;
  ENABLE_DEBUG_TRACES?: string;
  ENABLE_SOULMATE?: string;
  MIN_SUPPORTED_VERSION?: string;

  ADMIN_TOKEN?: string;
  CLERK_SECRET_KEY?: string;
  APNS_KEY_P8?: string;
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  APNS_TOPIC?: string;
  APNS_USE_SANDBOX?: string;
}
