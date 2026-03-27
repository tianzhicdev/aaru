# AARU Verification Checklist

Run all steps below. Every step must pass before committing.

## 1. TypeScript Tests (required)
```bash
npx vitest run
```
Expected: All 60 tests pass. No failures.

## 2. TypeScript Type Check (required)
```bash
npx tsc -p tsconfig.json --noEmit
```
Expected: Zero errors.

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
