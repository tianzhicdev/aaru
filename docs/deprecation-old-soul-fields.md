# Deprecation: Old Soul File Section Keys

## Context

The romance pivot (April 2026) renamed 7 visible soul file section keys. During the transition period, the server sends **both** old and new keys so that old iOS clients continue working.

## Old → New Key Mapping

| Old Key | New Key |
|---------|---------|
| `howYouMove` | `howYouLightUp` |
| `howYouThink` | `howYouShowUp` |
| `howYouConnect` | `howYouLove` |
| `whatYouCarry` | `howYouWeatherStorms` |
| `whatLightsYouUp` | `whatYoureLookingFor` |
| `yourTensions` | `yourGrowingEdges` |
| `yourVoice` | `yourWarmth` |

## When to Remove

After `MIN_SUPPORTED_VERSION` is bumped to `1.0.0` (or higher) via:

```bash
wrangler secret put MIN_SUPPORTED_VERSION
```

This forces old clients to update before they can use the app.

## Where the Compat Code Lives

Search for `// COMPAT:` comments:

- `workers/src/soulApp.ts` — `withCompatSections()` function (~line 989)
- `workers/src/handlers/bootstrap-soul.ts` — wraps response with `withCompatSections()`
- `workers/src/handlers/get-soul-file.ts` — wraps response with `withCompatSections()`
- `contracts/bootstrap-soul.response.json` — includes both old and new keys
- `contracts/get-soul-file.response.json` — includes both old and new keys
- `tests/unit/contracts.test.ts` — asserts old keys are present (backward compat checks)
- `tests/unit/backwardCompat.test.ts` — dedicated backward compat test
- `tests/integration/soulMirrorHandlers.test.ts` — mock `withCompatSections`
- `Thumos/App/Models.swift` — `VisibleSoulFileSections` has legacy CodingKeys for old JSON keys

## Steps to Remove

1. Bump `MIN_SUPPORTED_VERSION` to `1.0.0`: `wrangler secret put MIN_SUPPORTED_VERSION`
2. Wait for old clients to be force-upgraded (check App Store adoption metrics)
3. Delete `withCompatSections()` from `workers/src/soulApp.ts`
4. Remove `withCompatSections` import and usage from `bootstrap-soul.ts` and `get-soul-file.ts`
5. Remove old key aliases from `contracts/bootstrap-soul.response.json` and `contracts/get-soul-file.response.json`
6. Remove backward compat assertions from `tests/unit/contracts.test.ts`
7. Delete `tests/unit/backwardCompat.test.ts`
8. Remove `withCompatSections` mock from `tests/integration/soulMirrorHandlers.test.ts`
9. Remove `legacy*` CodingKeys from `Thumos/App/Models.swift` `VisibleSoulFileSections`
10. Run `npx vitest run` and `npx tsc --noEmit` to verify
11. Rebuild iOS: `xcodebuild build -project Thumos.xcodeproj -scheme Thumos`
