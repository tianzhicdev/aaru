/**
 * Wire format types for client-facing API responses.
 *
 * These types describe the EXACT JSON shape that crosses the iOS ↔ server boundary.
 * Wire format rules:
 *   - Envelope keys: snake_case (user_id, visible_soul_file, has_messages)
 *   - Nested domain objects: camelCase (lastUpdated, howYouMove, personalitySpectrum)
 *
 * GOLD contract — do not change without updating contracts/*.json fixtures
 * and verifying both TypeScript and Swift test suites pass.
 */

import type { VisibleSoulFile } from "../domain/schemas.ts";

// ── POST /bootstrap-soul ─────────────────────────────────────

export interface BootstrapSoulWireResponse {
  user_id: string;
  token?: string;
  visible_soul_file: VisibleSoulFile;
  has_messages: boolean;
  model_profile_id: string;
}

// ── GET /get-soul-file ───────────────────────────────────────

export interface GetSoulFileWireResponse {
  visible_soul_file: VisibleSoulFile;
  version: number;
  last_updated: string | null;
  synthesis_pending: boolean;
}

// ── GET /sync-messages ───────────────────────────────────────

export interface SyncMessageWirePayload {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface SyncMessagesWireResponse {
  messages: SyncMessageWirePayload[];
}

// ── POST /version ────────────────────────────────────────────

export interface VersionCheckWireResponse {
  status: "ok" | "unsupported";
  min_version: string;
  message?: string;
}

// ── DELETE /delete-account ───────────────────────────────────

export interface DeleteAccountWireResponse {
  deleted: boolean;
}

// ── GET /soulmate-profile ───────────────────────────────────

export interface SoulmateProfileWirePayload {
  user_id: string;
  display_name: string | null;
  age: number;
  gender: string;
  latitude: number;
  longitude: number;
  preferred_age_min: number;
  preferred_age_max: number;
  preferred_genders: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GetSoulmateProfileWireResponse {
  soulmate_profile: SoulmateProfileWirePayload | null;
}

// ── POST /soulmate-profile ──────────────────────────────────

export interface PostSoulmateProfileWireResponse {
  soulmate_profile: SoulmateProfileWirePayload;
}

// ── GET /soulmate-matches ───────────────────────────────────

export interface SoulmateMatchWirePayload {
  match_id: string;
  matched_user_id: string;
  display_name: string;
  matched_at: string;
  reasoning: string | null;
}

export interface GetSoulmateMatchesWireResponse {
  matches: SoulmateMatchWirePayload[];
}

// ── GET/POST /match-messages ────────────────────────────────

export interface MatchMessageWirePayload {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

export interface GetMatchMessagesWireResponse {
  messages: MatchMessageWirePayload[];
}

export interface PostMatchMessageWireResponse {
  message: MatchMessageWirePayload;
}
