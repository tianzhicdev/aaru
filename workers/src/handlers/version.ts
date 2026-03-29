import { jsonResponse } from "../../../src/lib/http.ts";

const MIN_SUPPORTED_VERSION = "0.1.0";

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function handleVersion(payload: unknown) {
  const body = payload as Record<string, unknown>;
  const buildVersion = typeof body?.build_version === "string" ? body.build_version.trim() : "";

  if (!buildVersion || !/^\d+(\.\d+){0,2}$/.test(buildVersion)) {
    return jsonResponse(400, {
      code: 400,
      message: "Invalid or missing build_version (expected semver e.g. 1.0.0)"
    });
  }

  // Normalize to 3 components (e.g. "1.0" → "1.0.0")
  const parts = buildVersion.split(".");
  while (parts.length < 3) parts.push("0");
  const normalizedVersion = parts.join(".");

  if (compareSemver(normalizedVersion, MIN_SUPPORTED_VERSION) < 0) {
    return jsonResponse(200, {
      status: "unsupported",
      min_version: MIN_SUPPORTED_VERSION,
      message: "This version of Thumos is no longer supported. Please update to continue."
    });
  }

  return jsonResponse(200, {
    status: "ok",
    min_version: MIN_SUPPORTED_VERSION
  });
}
