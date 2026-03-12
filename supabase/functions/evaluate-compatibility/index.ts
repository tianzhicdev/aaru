import {
  accumulateCompatibility,
  evaluateCompatibility,
  isBaUnlocked
} from "../../../src/domain/compatibility.ts";
import { jsonResponse } from "../../../src/lib/http.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import {
  evaluateCompatibilityRequestSchema,
  evaluateCompatibilityResponseSchema
} from "../_shared/contracts.ts";

export async function handleEvaluateCompatibility(payload: unknown) {
  const request = evaluateCompatibilityRequestSchema.parse(payload);
  const evaluation = await evaluateCompatibility(
    request.soulA,
    request.soulB,
    request.transcript,
    { selfName: request.self_name, otherName: request.other_name }
  );
  const accumulatedScore = accumulateCompatibility(request.previousScore, evaluation.score, request.encounterCount);
  const baUnlocked = isBaUnlocked(accumulatedScore, request.reciprocalScore);

  return jsonResponse(200, evaluateCompatibilityResponseSchema.parse({
    evaluation,
    accumulatedScore,
    baUnlocked
  }));
}

installEdgeHandler(handleEvaluateCompatibility);
