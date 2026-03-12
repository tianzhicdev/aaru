import { describe, expect, it } from "vitest";
import { handleEvaluateCompatibility } from "../../supabase/functions/evaluate-compatibility/index.ts";
import { handleGenerateSoulProfile } from "../../supabase/functions/generate-soul-profile/index.ts";
import { handleKaConverse } from "../../supabase/functions/ka-converse/index.ts";
import { handlePing } from "../../supabase/functions/ping/index.ts";
import { handleWorldTick } from "../../supabase/functions/world-tick/index.ts";

describe("backend handlers", () => {
  it("returns a healthy ping response", () => {
    const response = handlePing();
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("generates a soul profile from sparse input", async () => {
    const response = await handleGenerateSoulProfile({ raw_input: "I like cinema." });
    expect(response.status).toBe(200);
    expect(response.body.interests.length).toBeGreaterThan(0);
  });

  it("ticks the world and starts a conversation", async () => {
    const a = {
      user_id: crypto.randomUUID(),
      x: 5.5 / 50,
      y: 5.5 / 50,
      target_x: 5.5 / 50,
      target_y: 5.5 / 50,
      cell_x: 5,
      cell_y: 5,
      target_cell_x: 5,
      target_cell_y: 5,
      state: "wandering" as const,
      active_message: null,
      conversation_id: null,
      cooldown_until: null
    };
    const b = {
      user_id: crypto.randomUUID(),
      x: 6.5 / 50,
      y: 5.5 / 50,
      target_x: 6.5 / 50,
      target_y: 5.5 / 50,
      cell_x: 6,
      cell_y: 5,
      target_cell_x: 6,
      target_cell_y: 5,
      state: "wandering" as const,
      active_message: null,
      conversation_id: null,
      cooldown_until: null
    };

    const response = await handleWorldTick({ positions: [a, b] });
    expect(response.status).toBe(200);
    expect(response.body.startedConversations).toHaveLength(1);
  });

  it("creates a Ka reply against the shared contract", async () => {
    const selfUserId = crypto.randomUUID();
    const otherUserId = crypto.randomUUID();
    const response = await handleKaConverse({
      selfUserId,
      selfName: "Nahla",
      soulProfile: {
        personality: "Curious and warm.",
        interests: ["cinema", "running"],
        values: {
          self_transcendence: 0.5,
          self_enhancement: 0.5,
          openness_to_change: 0.5,
          conservation: 0.5,
          expressed: ["honesty", "growth"]
        },
        narrative: {
          formative_stories: [],
          self_defining_memories: [],
          narrative_themes: []
        },
        avoid_topics: ["cruelty"],
        raw_input: "I like cinema and running.",
        guessed_fields: []
      },
      newsSnippets: ["Independent film festivals are growing in Los Angeles."],
      history: [
        { user_id: selfUserId, type: "ka_generated", content: "Hi there" },
        { user_id: otherUserId, type: "ka_generated", content: "I love movies" }
      ]
    });

    expect(response.status).toBe(200);
    expect(response.body.user_id).toBe(selfUserId);
    expect(response.body.type).toBe("ka_generated");
  });

  it("evaluates compatibility and tracks unlock state", async () => {
    const response = await handleEvaluateCompatibility({
      soulA: {
        personality: "Curious and warm.",
        interests: ["cinema", "running"],
        values: {
          self_transcendence: 0.5,
          self_enhancement: 0.5,
          openness_to_change: 0.5,
          conservation: 0.5,
          expressed: ["honesty", "growth"]
        },
        narrative: {
          formative_stories: [],
          self_defining_memories: [],
          narrative_themes: []
        },
        avoid_topics: [],
        raw_input: "A",
        guessed_fields: []
      },
      soulB: {
        personality: "Reflective and warm.",
        interests: ["cinema", "travel"],
        values: {
          self_transcendence: 0.6,
          self_enhancement: 0.4,
          openness_to_change: 0.5,
          conservation: 0.5,
          expressed: ["growth", "humor"]
        },
        narrative: {
          formative_stories: [],
          self_defining_memories: [],
          narrative_themes: []
        },
        avoid_topics: [],
        raw_input: "B",
        guessed_fields: []
      },
      transcript: [
        { user_id: crypto.randomUUID(), type: "ka_generated", content: "One" },
        { user_id: crypto.randomUUID(), type: "ka_generated", content: "Two" },
        { user_id: crypto.randomUUID(), type: "ka_generated", content: "Three" },
        { user_id: crypto.randomUUID(), type: "ka_generated", content: "Four" },
        { user_id: crypto.randomUUID(), type: "ka_generated", content: "Five" }
      ],
      previousScore: 70,
      reciprocalScore: 82
    });

    expect(response.status).toBe(200);
    expect(response.body.accumulatedScore).toBeGreaterThanOrEqual(0);
    expect(response.body.baUnlocked).toBeTypeOf("boolean");
  });
});
