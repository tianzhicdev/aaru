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
