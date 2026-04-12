import type { Env } from "./env.ts";
import { createSQL } from "./db.ts";
import type { BackgroundJob, QueueBatch } from "./backgroundJobsQueue.ts";
import { processBackgroundJobsBatch } from "./backgroundJobsQueue.ts";

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}
import { withErrorHandling, optionsResponse, toEdgeResponse } from "./edge.ts";
import { handlePing } from "./handlers/ping.ts";
import { handleVersion } from "./handlers/version.ts";
import { handleBootstrapSoul } from "./handlers/bootstrap-soul.ts";
import { handleSyncMessages } from "./handlers/sync-messages.ts";
import { handleSoulConverse } from "./handlers/soul-converse.ts";
import { handleGetSoulFile } from "./handlers/get-soul-file.ts";
import { handleDeleteAccount } from "./handlers/delete-account.ts";
import { handleGetDebugInfo } from "./handlers/get-debug-info.ts";
import { handleDebugDump } from "./handlers/debug-dump.ts";
import { handleSetModelProfile } from "./handlers/set-model-profile.ts";
import { handleGetSoulmateProfile, handlePostSoulmateProfile } from "./handlers/soulmate-profile.ts";
import { handleGetMatches } from "./handlers/get-matches.ts";
import { handleGetMatchMessages, handlePostMatchMessage } from "./handlers/match-messages.ts";
import { handleUpdateLanguage } from "./handlers/update-language.ts";
import { handleMonitoring } from "./handlers/monitoring.ts";
import { handleSoulSend } from "./handlers/soul-send.ts";
import { enqueueMatchingRun } from "./backgroundJobsQueue.ts";
import { requireDebugApiToken } from "./requestAuth.ts";
import { jsonResponse } from "../../src/lib/http.ts";

async function handleRunMatching(env: Env, request: Request) {
  const authErr = requireDebugApiToken(request, env);
  if (authErr) return authErr.error;
  const job = await enqueueMatchingRun(env.BACKGROUND_QUEUE);
  return jsonResponse(200, { ok: true, message: "Matching pipeline enqueued", jobId: job.jobId });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+|\/+$/g, "");

    if (request.method === "OPTIONS") {
      return optionsResponse();
    }

    const sql = createSQL(env.DATABASE_URL);

    switch (path) {
      case "ping":
        return toEdgeResponse(handlePing());

      case "version":
        return withErrorHandling(request, (payload) => handleVersion(payload, env));

      case "bootstrap-soul":
        return withErrorHandling(request, (payload, req) =>
          handleBootstrapSoul(sql, env, payload, req)
        );

      case "sync-messages":
        return withErrorHandling(request, (payload, req) =>
          handleSyncMessages(sql, env, payload, req)
        );

      case "soul-converse":
        return handleSoulConverse(sql, env, request, _ctx);

      case "soul-send":
        return withErrorHandling(request, (payload, req) =>
          handleSoulSend(sql, env, payload, req, _ctx)
        );

      case "get-soul-file":
        return withErrorHandling(request, (payload, req) =>
          handleGetSoulFile(sql, env, payload, req)
        );

      case "delete-account":
        return withErrorHandling(request, (payload, req) =>
          handleDeleteAccount(sql, payload, req)
        );

      case "get-debug-info":
        return withErrorHandling(request, (payload, req) =>
          handleGetDebugInfo(sql, env, payload, req)
        );

      case "debug-dump":
        return withErrorHandling(request, (payload, req) =>
          handleDebugDump(sql, env, payload, req)
        );

      case "set-model-profile":
        return withErrorHandling(request, (payload, req) =>
          handleSetModelProfile(sql, env, payload, req)
        );

      case "soulmate-profile":
        if (request.method === "GET") {
          return withErrorHandling(request, (payload, req) =>
            handleGetSoulmateProfile(sql, payload, req)
          );
        }
        return withErrorHandling(request, (payload, req) =>
          handlePostSoulmateProfile(sql, payload, req)
        );

      case "soulmate-matches":
        return withErrorHandling(request, (payload, req) =>
          handleGetMatches(sql, payload, req)
        );

      case "run-matching":
        return withErrorHandling(request, (_payload, req) =>
          handleRunMatching(env, req)
        );

      case "match-messages":
        if (request.method === "GET") {
          return withErrorHandling(request, (payload, req) =>
            handleGetMatchMessages(sql, payload, req)
          );
        }
        return withErrorHandling(request, (payload, req) =>
          handlePostMatchMessage(sql, payload, req)
        );

      case "update-language":
        return withErrorHandling(request, (payload, req) =>
          handleUpdateLanguage(sql, payload, req)
        );

      case "monitoring":
        return handleMonitoring(sql, env, request);

      default:
        return new Response(JSON.stringify({ code: 404, message: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    await enqueueMatchingRun(env.BACKGROUND_QUEUE);
  },

  async queue(batch: QueueBatch<BackgroundJob>, env: Env): Promise<void> {
    const sql = createSQL(env.DATABASE_URL);
    await processBackgroundJobsBatch(sql, env, batch);
  }
};
