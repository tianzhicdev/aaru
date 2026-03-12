import { xaiToken } from "./env.ts";

interface XaiNewsItem {
  topic: string;
  headline: string;
  summary: string;
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string") {
    return record.output_text;
  }
  if (Array.isArray(record.output)) {
    const parts: string[] = [];
    for (const item of record.output) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const block of content) {
        if (!block || typeof block !== "object") {
          continue;
        }
        const text = (block as Record<string, unknown>).text;
        if (typeof text === "string") {
          parts.push(text);
        }
      }
    }
    return parts.join("\n");
  }
  return "";
}

function parseJsonArray(text: string): XaiNewsItem[] {
  try {
    const trimmed = text.trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      const firstBracket = trimmed.indexOf("[");
      const lastBracket = trimmed.lastIndexOf("]");
      if (firstBracket >= 0 && lastBracket > firstBracket) {
        parsed = JSON.parse(trimmed.slice(firstBracket, lastBracket + 1));
      } else {
        return [];
      }
    }
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const record = item as Record<string, unknown>;
      if (typeof record.topic !== "string" || typeof record.headline !== "string" || typeof record.summary !== "string") {
        return [];
      }
      return [{
        topic: record.topic.trim(),
        headline: record.headline.trim(),
        summary: record.summary.trim()
      }];
    });
  } catch {
    return [];
  }
}

export async function fetchInterestNews(topics: string[]): Promise<XaiNewsItem[]> {
  const token = xaiToken();
  if (!token || topics.length === 0) {
    return [];
  }

  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "grok-4",
      tools: [{ type: "web_search" }],
      input: `Find one current news angle for each topic in this list: ${topics.join(", ")}.
Return only valid JSON as an array of objects:
[{"topic":"topic","headline":"short headline","summary":"one sentence summary"}]
Use recent real-world news if available.`
    })
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  const text = extractText(payload);
  return parseJsonArray(text);
}
