import { describe, it, expect } from "vitest";
import { handleVersion } from "../../supabase/functions/version/index.ts";

describe("handleVersion", () => {
  it("returns ok for current version", () => {
    const response = handleVersion({ build_version: "0.1.0" });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "ok");
    expect(response.body).toHaveProperty("min_version", "0.1.0");
  });

  it("returns ok for newer version", () => {
    const response = handleVersion({ build_version: "1.0.0" });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "ok");
  });

  it("returns unsupported for older version", () => {
    const response = handleVersion({ build_version: "0.0.9" });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status", "unsupported");
    expect(response.body).toHaveProperty("min_version", "0.1.0");
    expect(response.body).toHaveProperty("message");
  });

  it("returns 400 for missing build_version", () => {
    const response = handleVersion({});
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid build_version format", () => {
    const response = handleVersion({ build_version: "abc" });
    expect(response.status).toBe(400);
  });
});
