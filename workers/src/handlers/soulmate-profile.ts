import { jsonResponse } from "../../../src/lib/http.ts";
import type { NeonSQL } from "../db.ts";
import { requireDeviceSession } from "../requestAuth.ts";
import { getSoulmateProfile, upsertSoulmateProfile } from "../matchApp.ts";
import type { SoulmateProfileInput } from "../matchApp.ts";

const VALID_GENDERS = ["male", "female", "non_binary"];

export async function handleGetSoulmateProfile(
  sql: NeonSQL,
  _payload: unknown,
  request: Request
) {
  const auth = await requireDeviceSession(sql, request, { touch: false });
  if (!auth.ok) return auth.error;

  const profile = await getSoulmateProfile(sql, auth.session.user_id);
  return jsonResponse(200, { soulmate_profile: profile });
}

export async function handlePostSoulmateProfile(
  sql: NeonSQL,
  payload: unknown,
  request: Request
) {
  const auth = await requireDeviceSession(sql, request, { touch: false });
  if (!auth.ok) return auth.error;

  const body = payload as Record<string, unknown>;
  const input = validateProfileInput(body);
  if ("error" in input) {
    return jsonResponse(400, { code: 400, message: input.error });
  }

  const profile = await upsertSoulmateProfile(sql, auth.session.user_id, input);
  return jsonResponse(200, { soulmate_profile: profile });
}

function validateProfileInput(
  body: Record<string, unknown>
): SoulmateProfileInput | { error: string } {
  const age = Number(body.age);
  if (!Number.isFinite(age) || age < 18 || age > 120) {
    return { error: "age must be between 18 and 120" };
  }

  const gender = String(body.gender ?? "");
  if (!VALID_GENDERS.includes(gender)) {
    return { error: `gender must be one of: ${VALID_GENDERS.join(", ")}` };
  }

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { error: "latitude must be between -90 and 90" };
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { error: "longitude must be between -180 and 180" };
  }

  const preferredAgeMin = Number(body.preferred_age_min);
  const preferredAgeMax = Number(body.preferred_age_max);
  if (!Number.isFinite(preferredAgeMin) || preferredAgeMin < 18) {
    return { error: "preferred_age_min must be >= 18" };
  }
  if (!Number.isFinite(preferredAgeMax) || preferredAgeMax < preferredAgeMin) {
    return { error: "preferred_age_max must be >= preferred_age_min" };
  }

  const preferredGenders = body.preferred_genders;
  if (!Array.isArray(preferredGenders) || preferredGenders.length === 0) {
    return { error: "preferred_genders must be a non-empty array" };
  }
  for (const g of preferredGenders) {
    if (!VALID_GENDERS.includes(String(g))) {
      return { error: `invalid preferred gender: ${g}` };
    }
  }

  const displayName = String(body.display_name ?? "").trim();
  if (displayName.length === 0 || displayName.length > 50) {
    return { error: "display_name must be 1-50 characters" };
  }

  const result: SoulmateProfileInput = {
    display_name: displayName,
    age: Math.floor(age),
    gender,
    latitude,
    longitude,
    preferred_age_min: Math.floor(preferredAgeMin),
    preferred_age_max: Math.floor(preferredAgeMax),
    preferred_genders: preferredGenders.map(String)
  };

  if (body.selfie_url !== undefined) {
    const selfieUrl = String(body.selfie_url ?? "").trim();
    if (selfieUrl.length > 500) {
      return { error: "selfie_url must be at most 500 characters" };
    }
    result.selfie_url = selfieUrl || undefined;
  }

  if (body.bio !== undefined) {
    const bio = String(body.bio ?? "").trim();
    if (bio.length > 280) {
      return { error: "bio must be at most 280 characters" };
    }
    result.bio = bio || undefined;
  }

  return result;
}
