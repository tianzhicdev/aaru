import type { NeonSQL } from "./db.ts";
import type { Env } from "./env.ts";
import {
  buildSimPersona,
  buildObserverPrompt,
  observerResultSchema,
  parseSimTurn,
  SCENES,
  SCENE_IDS,
  type ObserverResult,
  type SceneId,
  type SimPersona,
  type SimTurn
} from "../../src/domain/matchSimulation.ts";
import { getVisibleSoulFile, getHiddenSoulFile } from "./soulApp.ts";
import { callLlmText, callLlmJson } from "./llm.ts";
import { defaultModelProfileIdFromEnv, getTaskConfig } from "./modelProfiles.ts";
import { toJSONSchema } from "zod";

export interface SimulationResult {
  outcome: "match" | "no_match" | "error";
  score: number | null;
  observerResult: ObserverResult | null;
  transcripts: Record<SceneId, SimTurn[]> | null;
}

async function runScene(
  env: Env,
  sceneId: SceneId,
  personaA: SimPersona,
  personaB: SimPersona
): Promise<SimTurn[]> {
  const scene = SCENES[sceneId];
  const profileId = defaultModelProfileIdFromEnv(env);
  const config = getTaskConfig(profileId, "match_simulation");
  const context = { profileId, task: "match_simulation" as const };

  const turns: SimTurn[] = [];
  const totalTurns = scene.minTurns + Math.floor(Math.random() * (scene.maxTurns - scene.minTurns + 1));

  // Person A starts each scene
  const personas = [personaA, personaB];
  let conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (let i = 0; i < totalTurns; i++) {
    const currentPersona = personas[i % 2];
    const otherPersona = personas[(i + 1) % 2];

    const sceneContext = i === 0
      ? `SCENE SETUP: ${scene.setup}\n\nYou are ${currentPersona.name}. ${otherPersona.name} is here with you. Begin the scene.`
      : `Continue the conversation as ${currentPersona.name}. Respond to what ${otherPersona.name} just said.`;

    // Build messages from the current persona's perspective
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    if (i === 0) {
      messages.push({ role: "user", content: sceneContext });
    } else {
      // Rebuild history from this persona's perspective
      for (let j = 0; j < turns.length; j++) {
        const turn = turns[j];
        if (turn.speaker === currentPersona.name) {
          messages.push({ role: "assistant", content: `THINK: ${turn.think}\nSPEAK: ${turn.speak}` });
        } else {
          // Other person's speech only (not their thoughts)
          messages.push({ role: "user", content: `${turn.speaker} says: "${turn.speak}"` });
        }
      }
      messages.push({ role: "user", content: sceneContext });
    }

    const response = await callLlmText(
      env,
      config,
      currentPersona.systemPrompt,
      messages,
      context
    );

    const turn = parseSimTurn(response, currentPersona.name);
    turns.push(turn);
  }

  return turns;
}

export async function runSimulatedMatch(
  sql: NeonSQL,
  env: Env,
  userAId: string,
  userBId: string,
  nameA: string,
  nameB: string
): Promise<SimulationResult> {
  try {
    // 1. Load soul files for both users in parallel
    const [visibleA, hiddenA, visibleB, hiddenB] = await Promise.all([
      getVisibleSoulFile(sql, userAId),
      getHiddenSoulFile(sql, userAId),
      getVisibleSoulFile(sql, userBId),
      getHiddenSoulFile(sql, userBId)
    ]);

    if (!visibleA || !hiddenA || !visibleB || !hiddenB) {
      console.error(`Simulated match: missing soul file. visA=${!!visibleA} hidA=${!!hiddenA} visB=${!!visibleB} hidB=${!!hiddenB}`);
      return { outcome: "error", score: null, observerResult: null, transcripts: null };
    }

    // 2. Build personas
    console.log(`Simulated match: building personas for ${nameA} and ${nameB}`);
    const personaA = buildSimPersona(nameA, visibleA, hiddenA);
    const personaB = buildSimPersona(nameB, visibleB, hiddenB);
    console.log(`Simulated match: personas built, starting 3 scenes`);

    // 3. Run scenes sequentially to avoid API rate limits
    const firstDate = await runScene(env, "first_date", personaA, personaB);
    const vulnerability = await runScene(env, "vulnerability", personaA, personaB);
    const friction = await runScene(env, "friction", personaA, personaB);

    const transcripts: Record<SceneId, SimTurn[]> = {
      first_date: firstDate,
      vulnerability: vulnerability,
      friction: friction
    };

    // 4. Run observer
    const profileId = defaultModelProfileIdFromEnv(env);
    const observerConfig = getTaskConfig(profileId, "match_observer");
    const observerContext = { profileId, task: "match_observer" as const };
    const observerPrompt = buildObserverPrompt(transcripts, nameA, nameB);

    const jsonSchema = toJSONSchema(observerResultSchema);
    const schema = (typeof jsonSchema === "object" && jsonSchema !== null)
      ? jsonSchema as Record<string, unknown>
      : {};

    const rawResult = await callLlmJson<ObserverResult>(
      env,
      observerConfig,
      observerPrompt,
      [{ role: "user", content: "Evaluate the compatibility between these two people based on the transcripts." }],
      observerContext,
      { name: "observer_evaluation", schema }
    );

    const parsed = observerResultSchema.safeParse(rawResult);
    if (!parsed.success) {
      return { outcome: "error", score: null, observerResult: null, transcripts };
    }

    return {
      outcome: parsed.data.decision === "match" ? "match" : "no_match",
      score: parsed.data.overallScore,
      observerResult: parsed.data,
      transcripts
    };
  } catch (error) {
    console.error("Simulated match failed:", error);
    return { outcome: "error", score: null, observerResult: null, transcripts: null };
  }
}
