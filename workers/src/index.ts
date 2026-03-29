import type { Env } from "./env.ts";
import { createSQL } from "./db.ts";
import { withErrorHandling, optionsResponse, toEdgeResponse } from "./edge.ts";
import { handlePing } from "./handlers/ping.ts";
import { handleVersion } from "./handlers/version.ts";
import { handleBootstrapSoul } from "./handlers/bootstrap-soul.ts";
import { handleSoulConverse } from "./handlers/soul-converse.ts";
import { handleGetSoulFile } from "./handlers/get-soul-file.ts";
import { handleEndSoulSession } from "./handlers/end-soul-session.ts";
import { handleSynthesizeSoulFile } from "./handlers/synthesize-soul-file.ts";
import { handleDeleteAccount } from "./handlers/delete-account.ts";
import { handleGetDebugInfo } from "./handlers/get-debug-info.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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

      case "soul-converse":
        return handleSoulConverse(sql, env, request);

      case "get-soul-file":
        return withErrorHandling(request, (payload, req) =>
          handleGetSoulFile(sql, payload, req)
        );

      case "end-soul-session":
        return withErrorHandling(request, (payload, req) =>
          handleEndSoulSession(sql, env, payload, req)
        );

      case "synthesize-soul-file":
        return withErrorHandling(request, (payload, req) =>
          handleSynthesizeSoulFile(sql, env, payload, req)
        );

      case "delete-account":
        return withErrorHandling(request, (payload, req) =>
          handleDeleteAccount(sql, payload, req)
        );

      case "get-debug-info":
        return withErrorHandling(request, (payload, req) =>
          handleGetDebugInfo(sql, payload, req)
        );

      default:
        return new Response(JSON.stringify({ code: 404, message: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
    }
  }
};
