Run the full QA suite for AARU — TypeScript tests, type checking, and iOS build.

Steps:
1. Run `npx vitest run` — all tests must pass
2. Run `npx tsc -p tsconfig.json --noEmit` — no type errors
3. Use XcodeBuildMCP `build_sim` to verify iOS build succeeds
4. Report a summary: TS tests (pass/fail count), type check (clean/errors), iOS build (success/failure)
5. If any step fails, stop and report the failure details
