import { jsonResponse } from "../../../src/lib/http.ts";
import type { NeonSQL } from "../db.ts";
import { requireDeviceSession } from "../requestAuth.ts";
import {
  getSoulmateProfile,
  getSoulmatePhotoEtags,
  upsertSoulmatePhotos,
  upsertSoulmateProfile,
  type SoulmatePhoto
} from "../matchApp.ts";
import type { SoulmateProfileInput } from "../matchApp.ts";

const VALID_GENDERS = ["male", "female", "non_binary"];
const MAX_BIO_CHARS = 200;
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 700 * 1024; // 700 KB per JPEG
const MAX_SELFIE_URL_CHARS = 500;

interface ValidatedProfile {
  profile: SoulmateProfileInput;
  photos: SoulmatePhoto[] | null; // null = no photo change; [] = clear all
}

export async function handleGetSoulmateProfile(
  sql: NeonSQL,
  _payload: unknown,
  request: Request
) {
  const auth = await requireDeviceSession(sql, request, { touch: false });
  if (!auth.ok) return auth.error;

  const profile = await getSoulmateProfile(sql, auth.session.user_id);
  if (!profile) {
    return jsonResponse(200, { soulmate_profile: null });
  }

  const photoEtags = await getSoulmatePhotoEtags(sql, auth.session.user_id);
  return jsonResponse(200, {
    soulmate_profile: {
      ...profile,
      bio: profile.bio ?? null,
      photo_count: profile.photo_count ?? 0,
      photo_etags: photoEtags
    }
  });
}

export async function handlePostSoulmateProfile(
  sql: NeonSQL,
  payload: unknown,
  request: Request
) {
  const auth = await requireDeviceSession(sql, request, { touch: false });
  if (!auth.ok) return auth.error;

  const body = payload as Record<string, unknown>;
  const validated = validateProfileInput(body);
  if ("error" in validated) {
    return jsonResponse(400, { code: 400, message: validated.error });
  }

  const profile = await upsertSoulmateProfile(sql, auth.session.user_id, validated.profile);

  let photoEtags: string[];
  if (validated.photos !== null) {
    const result = await upsertSoulmatePhotos(sql, auth.session.user_id, validated.photos);
    photoEtags = result.etags;
  } else {
    photoEtags = await getSoulmatePhotoEtags(sql, auth.session.user_id);
  }

  return jsonResponse(200, {
    soulmate_profile: {
      ...profile,
      bio: profile.bio ?? null,
      photo_count: validated.photos !== null ? validated.photos.length : profile.photo_count ?? 0,
      photo_etags: photoEtags
    }
  });
}

function validateProfileInput(
  body: Record<string, unknown>
): ValidatedProfile | { error: string } {
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

  let bio: string | null = null;
  if (body.bio !== undefined && body.bio !== null) {
    const trimmed = String(body.bio).trim();
    if (trimmed.length > MAX_BIO_CHARS) {
      return { error: `bio must be ${MAX_BIO_CHARS} characters or less` };
    }
    bio = trimmed.length === 0 ? null : trimmed;
  }

  let selfieUrl: string | undefined;
  if (body.selfie_url !== undefined) {
    const trimmed = String(body.selfie_url ?? "").trim();
    if (trimmed.length > MAX_SELFIE_URL_CHARS) {
      return { error: `selfie_url must be ${MAX_SELFIE_URL_CHARS} characters or less` };
    }
    selfieUrl = trimmed || undefined;
  }

  let photos: SoulmatePhoto[] | null = null;
  if (body.photos !== undefined) {
    if (!Array.isArray(body.photos)) {
      return { error: "photos must be an array of base64 JPEG strings" };
    }
    if (body.photos.length > MAX_PHOTOS) {
      return { error: `photos may have at most ${MAX_PHOTOS} entries` };
    }
    const decoded: SoulmatePhoto[] = [];
    for (const entry of body.photos) {
      const decodedPhoto = decodeJpegBase64(entry);
      if ("error" in decodedPhoto) return decodedPhoto;
      decoded.push(decodedPhoto.photo);
    }
    photos = decoded;
  }

  return {
    profile: {
      display_name: displayName,
      age: Math.floor(age),
      gender,
      latitude,
      longitude,
      preferred_age_min: Math.floor(preferredAgeMin),
      preferred_age_max: Math.floor(preferredAgeMax),
      preferred_genders: preferredGenders.map(String),
      selfie_url: selfieUrl,
      bio
    },
    photos
  };
}

function decodeJpegBase64(
  entry: unknown
): { photo: SoulmatePhoto } | { error: string } {
  if (typeof entry !== "string" || entry.length === 0) {
    return { error: "each photo must be a non-empty base64 string" };
  }
  let bytes: Uint8Array;
  try {
    const binary = atob(entry);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  } catch {
    return { error: "photo is not valid base64" };
  }
  if (bytes.byteLength === 0) {
    return { error: "photo decoded to empty bytes" };
  }
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    return { error: `each photo must be ${MAX_PHOTO_BYTES} bytes or less` };
  }
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) {
    return { error: "photo must be a JPEG image" };
  }
  return { photo: { data: bytes, mime: "image/jpeg" } };
}
