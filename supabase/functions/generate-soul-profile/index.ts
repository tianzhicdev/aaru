import { mergeGeneratedSoulProfile, suggestDisplayName } from "../../../src/domain/soulProfile.ts";
import { callGroq } from "../_shared/groq.ts";
import { jsonResponse } from "../../../src/lib/http.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import {
  generateSoulProfileRequestSchema,
  generateSoulProfileResponseSchema
} from "../_shared/contracts.ts";

function fallbackDisplayName(rawInput: string) {
  return suggestDisplayName(rawInput);
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    }
    throw new Error("No JSON object found in model response");
  }
}

async function generateIdentity(rawInput: string) {
  const systemPrompt = `You generate a human-readable display name and a sophisticated soul profile for a social simulation app.
Return only valid JSON with this exact shape:
{
  "display_name": "Short evocative human name",
  "profile": {
    "personality": "2-3 sentence description",
    "interests": ["3-6 concrete interests"],
    "values": {
      "self_transcendence": 0.0,
      "self_enhancement": 0.0,
      "openness_to_change": 0.0,
      "conservation": 0.0,
      "expressed": ["3-6 values"]
    },
    "narrative": {
      "formative_stories": ["2-3 vivid stories"],
      "self_defining_memories": ["1-3 concise memories"],
      "narrative_themes": ["3-5 themes"]
    },
    "avoid_topics": ["2-5 topics to avoid"]
  }
}

Constraints:
- display_name should feel like a plausible final username, 1-3 words, no emojis.
- The profile should be specific, psychologically coherent, and non-generic.
- Narrative fields should be concrete, not placeholders.
- Values dimensions must be decimals between 0 and 1.
- Do not include markdown or commentary.`;

  const response = await callGroq(systemPrompt, [{
    role: "user",
    content: `Raw self-description:\n${rawInput || "A thoughtful person seeking connection."}`
  }]);

  const parsed = parseJsonObject(response) as {
    display_name?: string;
    profile?: Record<string, unknown>;
  };

  const display_name = parsed.display_name?.trim() || fallbackDisplayName(rawInput);
  const soul_profile = mergeGeneratedSoulProfile(rawInput, parsed.profile ?? {});
  return { display_name, soul_profile };
}

export async function handleGenerateSoulProfile(payload: unknown) {
  const request = generateSoulProfileRequestSchema.parse(payload);
  try {
    const generated = await generateIdentity(request.raw_input);
    return jsonResponse(200, generateSoulProfileResponseSchema.parse(generated));
  } catch (error) {
    console.error("Failed to generate sophisticated soul profile:", error);
    const fallback = {
      display_name: fallbackDisplayName(request.raw_input),
      soul_profile: mergeGeneratedSoulProfile(request.raw_input, {})
    };
    return jsonResponse(200, generateSoulProfileResponseSchema.parse(fallback));
  }
}

installEdgeHandler(handleGenerateSoulProfile);
