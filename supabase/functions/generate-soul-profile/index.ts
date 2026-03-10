import { mergeGeneratedSoulProfile } from "../../../src/domain/soulProfile.ts";
import { jsonResponse } from "../../../src/lib/http.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import {
  generateSoulProfileRequestSchema,
  generateSoulProfileResponseSchema
} from "../_shared/contracts.ts";

export async function handleGenerateSoulProfile(payload: unknown) {
  const request = generateSoulProfileRequestSchema.parse(payload);
  const profile = mergeGeneratedSoulProfile(request.raw_input, {});
  return jsonResponse(200, generateSoulProfileResponseSchema.parse(profile));
}

installEdgeHandler(handleGenerateSoulProfile);
