# AARU Verification Checklist

Run all steps below. Every step must pass before committing.

## 1. TypeScript Tests (required)
```bash
npx vitest run
```
Expected: All 73 tests pass. No failures.

## 2. TypeScript Type Check (required)
```bash
npx tsc -p tsconfig.json --noEmit
```
Expected: No new errors. (2 pre-existing errors in Phase 2 world-tick code are known.)

## 3. iOS Build (required when iOS code changed)
```bash
xcodegen generate && xcodebuild build -scheme AARU \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.3' \
  -derivedDataPath ./DerivedData \
  | xcpretty
```
Expected: BUILD SUCCEEDED

## 4. iOS Tests (required when iOS code changed)
```bash
xcodebuild test -scheme AARU \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.3' \
  -resultBundlePath ./TestResults \
  | xcpretty
```
Expected: All tests pass. Currently 6 tests.

## 5. Edge Function Deployment (when backend changed)
```bash
supabase functions deploy <function-name> --project-ref uuggqsywcpqmbqzwxdga
```
Verify: curl the endpoint and confirm 200 response.

## Known Issues
- 2 pre-existing TypeScript type errors in `end-conversation/index.ts` and `world-tick/index.ts` (AgentState string vs enum). These are Phase 2 code and do not affect Soul Mirror.
