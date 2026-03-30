import type { BackgroundQueueBinding } from "./backgroundJobsQueue.ts";

export interface Env {
  DATABASE_URL: string;
  ANTHROPIC_API_KEY: string;
  THUMOS_SESSION_SECRET: string;
  BACKGROUND_QUEUE: BackgroundQueueBinding;
}
