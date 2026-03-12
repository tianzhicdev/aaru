import {
  accumulateImpression,
  evaluateImpression,
  isBaAvailableToViewer,
  shouldEvaluateImpression
} from "./impression.ts";
import type { ConversationMessage, ImpressionEvaluation, SoulProfile } from "./types.ts";

export function shouldEvaluateCompatibility(messageCount: number) {
  return shouldEvaluateImpression(messageCount);
}

export async function evaluateCompatibility(
  soulA: SoulProfile,
  soulB: SoulProfile,
  transcript: ConversationMessage[]
): Promise<ImpressionEvaluation> {
  return await evaluateImpression(soulA, soulB, transcript);
}

export function accumulateCompatibility(previousScore: number, nextScore: number, encounterCount?: number) {
  return accumulateImpression(previousScore, nextScore, encounterCount);
}

export function isBaUnlocked(_scoreAtoB: number, scoreBtoA?: number) {
  return isBaAvailableToViewer(scoreBtoA ?? _scoreAtoB);
}
