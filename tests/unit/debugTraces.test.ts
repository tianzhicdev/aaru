import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getLatestClaudeDebugTrace,
  recordClaudeDebugTrace
} from "../../workers/src/debugTraces.ts";

const mockSQL = vi.fn();

describe("claude debug traces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a trace and prunes older rows for the same kind", async () => {
    mockSQL.mockResolvedValue([]);

    await recordClaudeDebugTrace(mockSQL, {
      userId: "user-1",
      traceKind: "conversation",
      model: "claude-opus-4-20250514",
      systemPrompt: "system prompt",
      inputMessages: [{ role: "user", content: "hello" }],
      rawResponse: "world",
      meta: { mode: "reply" }
    });

    expect(mockSQL).toHaveBeenCalledTimes(2);
  });

  it("returns the latest stored trace for a kind", async () => {
    mockSQL.mockResolvedValueOnce([{
      id: "trace-1",
      user_id: "user-1",
      trace_kind: "synthesis",
      model: "claude-opus-4-20250514",
      system_prompt: "system prompt",
      input_messages: [{ role: "user", content: "hi" }],
      raw_response: "response",
      meta: { parse_success: true },
      created_at: "2026-03-29T20:00:00.000Z"
    }]);

    const trace = await getLatestClaudeDebugTrace(mockSQL, "user-1", "synthesis");

    expect(trace).not.toBeNull();
    expect(trace?.trace_kind).toBe("synthesis");
    expect(trace?.raw_response).toBe("response");
  });
});
