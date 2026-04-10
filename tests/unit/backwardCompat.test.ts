import { describe, expect, it } from "vitest";
import { withCompatSections } from "../../workers/src/soulApp.ts";
import { emptyVisibleSoulFile } from "../../src/domain/soulFile.ts";

describe("backward compatibility — old section keys", () => {
  it("withCompatSections injects old key aliases alongside new keys", () => {
    const file = {
      ...emptyVisibleSoulFile(),
      sections: {
        howYouLightUp: "Joy",
        howYouShowUp: "Steady",
        howYouLove: "Deeply",
        howYouWeatherStorms: "Quietly",
        whatYoureLookingFor: "Depth",
        yourGrowingEdges: "Solitude vs connection",
        yourWarmth: "Direct but gentle"
      }
    };

    const compat = withCompatSections(file);

    // New keys present
    expect(compat.sections.howYouLightUp).toBe("Joy");
    expect(compat.sections.howYouShowUp).toBe("Steady");
    expect(compat.sections.howYouLove).toBe("Deeply");
    expect(compat.sections.howYouWeatherStorms).toBe("Quietly");
    expect(compat.sections.whatYoureLookingFor).toBe("Depth");
    expect(compat.sections.yourGrowingEdges).toBe("Solitude vs connection");
    expect(compat.sections.yourWarmth).toBe("Direct but gentle");

    // Old keys aliased to same values
    expect(compat.sections.howYouMove).toBe("Joy");
    expect(compat.sections.howYouThink).toBe("Steady");
    expect(compat.sections.howYouConnect).toBe("Deeply");
    expect(compat.sections.whatYouCarry).toBe("Quietly");
    expect(compat.sections.whatLightsYouUp).toBe("Depth");
    expect(compat.sections.yourTensions).toBe("Solitude vs connection");
    expect(compat.sections.yourVoice).toBe("Direct but gentle");
  });

  it("withCompatSections preserves all other visible soul file fields", () => {
    const file = {
      ...emptyVisibleSoulFile(),
      portrait: "A warm soul",
      relationalStyle: "Consistent and deep",
      attachmentStyle: "Secure with anxious lean",
      loveSignature: "Loves through presence"
    };

    const compat = withCompatSections(file);
    expect(compat.portrait).toBe("A warm soul");
    expect(compat.relationalStyle).toBe("Consistent and deep");
    expect(compat.attachmentStyle).toBe("Secure with anxious lean");
    expect(compat.loveSignature).toBe("Loves through presence");
  });

  it("contract fixtures include both old and new section keys", async () => {
    const bootstrap = await import("../../contracts/bootstrap-soul.response.json");
    const getSoulFile = await import("../../contracts/get-soul-file.response.json");

    for (const fixture of [bootstrap.default, getSoulFile.default]) {
      const sections = fixture.visible_soul_file.sections;

      // New keys
      expect(sections).toHaveProperty("howYouLightUp");
      expect(sections).toHaveProperty("howYouShowUp");
      expect(sections).toHaveProperty("howYouLove");
      expect(sections).toHaveProperty("howYouWeatherStorms");
      expect(sections).toHaveProperty("whatYoureLookingFor");
      expect(sections).toHaveProperty("yourGrowingEdges");
      expect(sections).toHaveProperty("yourWarmth");

      // Old keys (backward compat aliases)
      expect(sections).toHaveProperty("howYouMove");
      expect(sections).toHaveProperty("howYouThink");
      expect(sections).toHaveProperty("howYouConnect");
      expect(sections).toHaveProperty("whatYouCarry");
      expect(sections).toHaveProperty("whatLightsYouUp");
      expect(sections).toHaveProperty("yourTensions");
      expect(sections).toHaveProperty("yourVoice");
    }
  });
});
