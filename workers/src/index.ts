import type { Env } from "./env.ts";
import { createSQL } from "./db.ts";
import type { BackgroundJob, QueueBatch } from "./backgroundJobsQueue.ts";
import { processBackgroundJobsBatch } from "./backgroundJobsQueue.ts";

interface ExecutionContext {}
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
        return withErrorHandling(request, (payload) => handleVersion(payload));

      case "bootstrap-soul":
        return withErrorHandling(request, (payload, req) =>
          handleBootstrapSoul(sql, env, payload, req)
        );

      case "sync-messages":
        return withErrorHandling(request, (payload, req) =>
          handleSyncMessages(sql, env, payload, req)
        );

      case "soul-converse":
        return handleSoulConverse(sql, env, request);

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

      default:
        return new Response(JSON.stringify({ code: 404, message: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
    }
  },

  async queue(batch: QueueBatch<BackgroundJob>, env: Env): Promise<void> {
    const sql = createSQL(env.DATABASE_URL);
    await processBackgroundJobsBatch(sql, env, batch);
  }
};
