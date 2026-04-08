import { describe, expect, it } from "vitest";

import { stripThinkContent } from "../../workers/src/openaiCompatible.ts";

describe("stripThinkContent", () => {
  it("returns text unchanged when no think tags", () => {
    expect(stripThinkContent("Hello, how are you?")).toBe("Hello, how are you?");
  });

  it("strips complete <think>...</think> blocks", () => {
    const input = "<think>I should be empathetic here.</think>I hear you.";
    expect(stripThinkContent(input)).toBe("I hear you.");
  });

  it("strips orphan </think> and everything before it", () => {
    // This is the real Kimi K2.5 pattern: <think> was in reasoning_content,
    // but reasoning text + </think> leaked into content field
    const input =
      'User is affirming the importance of "Wednesday afternoons" but the tone ' +
      "feels slightly defensive. I should respect their boundary.</think>" +
      "当然重要。你说过的。";
    expect(stripThinkContent(input)).toBe("当然重要。你说过的。");
  });

  it("strips multiline think blocks", () => {
    const input =
      "<think>\nLine 1\nLine 2\nLine 3\n</think>\nActual response here.";
    expect(stripThinkContent(input)).toBe("Actual response here.");
  });

  it("strips multiple think blocks", () => {
    const input =
      "<think>first thought</think>Hello <think>second thought</think>world";
    expect(stripThinkContent(input)).toBe("Hello world");
  });

  it("handles think block at end of content", () => {
    const input = "Hello world<think>trailing thought</think>";
    expect(stripThinkContent(input)).toBe("Hello world");
  });

  it("preserves content with angle brackets that are not think tags", () => {
    expect(stripThinkContent("Use <div> for layout")).toBe(
      "Use <div> for layout"
    );
  });

  it("handles empty content after stripping", () => {
    const input = "<think>All reasoning, no response</think>";
    expect(stripThinkContent(input)).toBe("");
  });

  it("trims leading whitespace after stripping", () => {
    const input = "<think>reasoning</think>   \n\nActual response";
    expect(stripThinkContent(input)).toBe("Actual response");
  });
});
