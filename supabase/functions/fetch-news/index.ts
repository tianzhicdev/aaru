import { jsonResponse } from "../../../src/lib/http.ts";
import { z } from "zod";
import { installEdgeHandler } from "../_shared/edge.ts";
import { fetchInterestNews } from "../_shared/xai.ts";

const fetchNewsRequestSchema = z.object({
  topics: z.array(z.string()).min(1)
});

export async function handleFetchNews(payload: unknown) {
  const request = fetchNewsRequestSchema.parse(payload);
  const fetched = await fetchInterestNews(request.topics);
  return jsonResponse(200, {
    items: (fetched.length > 0 ? fetched : request.topics.map((topic) => ({
      topic,
      headline: `${topic} is moving today`,
      summary: `AARU placeholder news summary for ${topic}.`,
      source_url: null
    }))).map((item) => ({
      ...item,
      source_url: null
    }))
  });
}

installEdgeHandler(handleFetchNews);
