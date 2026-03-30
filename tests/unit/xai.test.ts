import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchInterestNews, _extractText, _parseJsonArray } from "../../workers/src/xai.ts";

describe("extractText", () => {
  it("returns output_text when present", () => {
    expect(_extractText({ output_text: "hello" })).toBe("hello");
  });

  it("extracts text from output array with content blocks", () => {
    const payload = {
      output: [
        {
          content: [
            { type: "text", text: "first" },
            { type: "text", text: "second" }
          ]
        }
      ]
    };
    expect(_extractText(payload)).toBe("first\nsecond");
  });

  it("returns empty string for null/undefined", () => {
    expect(_extractText(null)).toBe("");
    expect(_extractText(undefined)).toBe("");
    expect(_extractText("string")).toBe("");
  });

  it("returns empty string when no recognized fields", () => {
    expect(_extractText({ foo: "bar" })).toBe("");
  });
});

describe("parseJsonArray", () => {
  it("parses valid JSON array of news items", () => {
    const text = '[{"topic":"AI","headline":"New model released","summary":"A major lab released a new model."}]';
    const result = _parseJsonArray(text);
    expect(result).toEqual([{
      topic: "AI",
      headline: "New model released",
      summary: "A major lab released a new model."
    }]);
  });

  it("extracts JSON from surrounding text", () => {
    const text = 'Here are the results:\n[{"topic":"Space","headline":"Mars mission","summary":"NASA launched a rover."}]\nEnd of results.';
    const result = _parseJsonArray(text);
    expect(result).toHaveLength(1);
    expect(result[0].topic).toBe("Space");
  });

  it("returns empty array for invalid JSON", () => {
    expect(_parseJsonArray("not json at all")).toEqual([]);
  });

  it("returns empty array for empty text", () => {
    expect(_parseJsonArray("")).toEqual([]);
  });

  it("skips items with missing fields", () => {
    const text = '[{"topic":"AI"},{"topic":"Space","headline":"Mars","summary":"A rover."}]';
    const result = _parseJsonArray(text);
    expect(result).toHaveLength(1);
    expect(result[0].topic).toBe("Space");
  });

  it("trims whitespace from fields", () => {
    const text = '[{"topic":"  AI  ","headline":" Big news ","summary":" Summary here "}]';
    const result = _parseJsonArray(text);
    expect(result[0]).toEqual({ topic: "AI", headline: "Big news", summary: "Summary here" });
  });
});

describe("fetchInterestNews", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns empty array when topics are empty", async () => {
    const result = await fetchInterestNews([], "token");
    expect(result).toEqual([]);
  });

  it("returns parsed news on successful response", async () => {
    const newsItems = [{ topic: "AI", headline: "Big release", summary: "A new model." }];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ output_text: JSON.stringify(newsItems) })
    });

    const result = await fetchInterestNews(["AI"], "test-token");
    expect(result).toEqual(newsItems);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.x.ai/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token"
        })
      })
    );
  });

  it("returns empty array on non-ok response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const result = await fetchInterestNews(["AI"], "test-token");
    expect(result).toEqual([]);
  });

  it("returns empty array on fetch error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await expect(fetchInterestNews(["AI"], "test-token")).rejects.toThrow("Network error");
  });
});
