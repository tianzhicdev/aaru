import { describe, test, expect } from "vitest";
import type {
  BootstrapSoulWireResponse,
  GetSoulFileWireResponse,
  SyncMessagesWireResponse,
  VersionCheckWireResponse,
  DeleteAccountWireResponse,
} from "../../src/contracts/api.ts";

import bootstrapFixture from "../../contracts/bootstrap-soul.response.json" with { type: "json" };
import getSoulFileFixture from "../../contracts/get-soul-file.response.json" with { type: "json" };
import syncMessagesFixture from "../../contracts/sync-messages.response.json" with { type: "json" };
import versionOkFixture from "../../contracts/version-ok.response.json" with { type: "json" };
import versionUnsupportedFixture from "../../contracts/version-unsupported.response.json" with { type: "json" };
import deleteAccountFixture from "../../contracts/delete-account.response.json" with { type: "json" };

describe("API contract fixtures", () => {
  // ── bootstrap-soul ───────────────────────────────────────

  test("bootstrap-soul fixture matches wire type", () => {
    const typed: BootstrapSoulWireResponse = bootstrapFixture;
    expect(typed.user_id).toBeTypeOf("string");
    expect(typed.has_messages).toBeTypeOf("boolean");
    expect(typed.model_profile_id).toBeTypeOf("string");
  });

  test("bootstrap-soul fixture has complete visible_soul_file", () => {
    const sf = bootstrapFixture.visible_soul_file;
    // Envelope
    expect(sf).toHaveProperty("version");
    expect(sf).toHaveProperty("lastUpdated");
    expect(sf).toHaveProperty("portrait");

    // Sections — NEW romance-pivot keys
    const sections = sf.sections;
    expect(sections).toHaveProperty("howYouLightUp");
    expect(sections).toHaveProperty("howYouShowUp");
    expect(sections).toHaveProperty("howYouLove");
    expect(sections).toHaveProperty("howYouWeatherStorms");
    expect(sections).toHaveProperty("whatYoureLookingFor");
    expect(sections).toHaveProperty("yourGrowingEdges");
    expect(sections).toHaveProperty("yourWarmth");

    // Sections — OLD keys (kept for backward compat)
    expect(sections).toHaveProperty("howYouMove");
    expect(sections).toHaveProperty("howYouThink");
    expect(sections).toHaveProperty("howYouConnect");
    expect(sections).toHaveProperty("whatYouCarry");
    expect(sections).toHaveProperty("whatLightsYouUp");
    expect(sections).toHaveProperty("yourTensions");
    expect(sections).toHaveProperty("yourVoice");

    // Psychometrics
    expect(sf.crystallizedMoments.length).toBeGreaterThan(0);
    expect(sf.openThreads.length).toBeGreaterThan(0);
    expect(sf.compassScores).toBeDefined();
    expect(sf.personalitySpectrum).toBeDefined();
    expect(sf.personalitySpectrum.openness).toHaveProperty("position");
    expect(sf.personalitySpectrum.openness).toHaveProperty("label");
    expect(sf.personalitySpectrum.openness).toHaveProperty("evidence");
    expect(sf.topValues.length).toBeGreaterThan(0);
    expect(sf.topValues[0]).toHaveProperty("value");
    expect(sf.topValues[0]).toHaveProperty("description");
    expect(sf.relationalStyle).toBeTypeOf("string");
    expect(sf.attachmentStyle).toBeTypeOf("string");
    expect(sf.loveSignature).toBeTypeOf("string");
    expect(sf.completeness).toBeTypeOf("number");
    expect(sf.completeness).toBeGreaterThanOrEqual(0);
    expect(sf.completeness).toBeLessThanOrEqual(1);
  });

  // ── get-soul-file ────────────────────────────────────────

  test("get-soul-file fixture matches wire type", () => {
    const typed: GetSoulFileWireResponse = getSoulFileFixture;
    expect(typed.version).toBeTypeOf("number");
    expect(typed.last_updated).toBeTypeOf("string");
    expect(typed.synthesis_pending).toBeTypeOf("boolean");
  });

  test("get-soul-file fixture has complete visible_soul_file", () => {
    const sf = getSoulFileFixture.visible_soul_file;
    // New key
    expect(sf.sections.howYouLightUp).toBeTypeOf("string");
    expect(sf.sections.howYouLightUp.length).toBeGreaterThan(0);
    // Old key (backward compat)
    expect(sf.sections.howYouMove).toBeTypeOf("string");
    expect(sf.sections.howYouMove.length).toBeGreaterThan(0);
    expect(sf.personalitySpectrum).toBeDefined();
    expect(sf.topValues.length).toBeGreaterThan(0);
  });

  // ── sync-messages ────────────────────────────────────────

  test("sync-messages fixture matches wire type", () => {
    const typed: SyncMessagesWireResponse = syncMessagesFixture;
    expect(typed.messages.length).toBe(2);
  });

  test("sync-messages fixture has correct message shape", () => {
    const msg = syncMessagesFixture.messages[0];
    expect(msg).toHaveProperty("id");
    expect(msg).toHaveProperty("role");
    expect(msg).toHaveProperty("content");
    expect(msg).toHaveProperty("created_at");
    expect(msg.role).toMatch(/^(user|assistant)$/);
  });

  // ── version ──────────────────────────────────────────────

  test("version-ok fixture matches wire type", () => {
    const typed = versionOkFixture as unknown as VersionCheckWireResponse;
    expect(typed.status).toBe("ok");
    expect(typed.min_version).toBeTypeOf("string");
  });

  test("version-unsupported fixture matches wire type", () => {
    const typed = versionUnsupportedFixture as unknown as VersionCheckWireResponse;
    expect(typed.status).toBe("unsupported");
    expect(typed.message).toBeTypeOf("string");
    expect(typed.min_version).toBeTypeOf("string");
  });

  // ── delete-account ───────────────────────────────────────

  test("delete-account fixture matches wire type", () => {
    const typed: DeleteAccountWireResponse = deleteAccountFixture;
    expect(typed.deleted).toBe(true);
  });

  // ── Cross-cutting: wire format key naming ────────────────

  test("envelope keys are snake_case", () => {
    // bootstrap
    expect(bootstrapFixture).toHaveProperty("user_id");
    expect(bootstrapFixture).toHaveProperty("visible_soul_file");
    expect(bootstrapFixture).toHaveProperty("has_messages");
    expect(bootstrapFixture).toHaveProperty("model_profile_id");

    // get-soul-file
    expect(getSoulFileFixture).toHaveProperty("visible_soul_file");
    expect(getSoulFileFixture).toHaveProperty("last_updated");
    expect(getSoulFileFixture).toHaveProperty("synthesis_pending");

    // sync-messages
    expect(syncMessagesFixture.messages[0]).toHaveProperty("created_at");
  });

  test("domain object keys are camelCase", () => {
    const sf = bootstrapFixture.visible_soul_file;
    expect(sf).toHaveProperty("lastUpdated");
    expect(sf).toHaveProperty("crystallizedMoments");
    expect(sf).toHaveProperty("openThreads");
    expect(sf).toHaveProperty("compassScores");
    expect(sf).toHaveProperty("personalitySpectrum");
    expect(sf).toHaveProperty("topValues");
    expect(sf).toHaveProperty("relationalStyle");

    // New section keys
    expect(sf.sections).toHaveProperty("howYouLightUp");
    expect(sf.sections).toHaveProperty("yourGrowingEdges");
    expect(sf.sections).toHaveProperty("yourWarmth");

    // Old section keys (backward compat)
    expect(sf.sections).toHaveProperty("howYouMove");
    expect(sf.sections).toHaveProperty("whatLightsYouUp");
    expect(sf.sections).toHaveProperty("yourTensions");

    expect(sf.personalitySpectrum).toHaveProperty("emotionalSensitivity");
    expect(sf).toHaveProperty("attachmentStyle");
    expect(sf).toHaveProperty("loveSignature");
    expect(sf).toHaveProperty("completeness");
  });
});
