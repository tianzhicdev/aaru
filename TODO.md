# TODO

## Current Branch Summary

- Implemented the server-side model-profile split.
- Hardcoded profiles live in `workers/src/modelProfiles.ts`.
- Provider routing lives in `workers/src/llm.ts`.
- The Fireworks Anthropic-compatible wrapper lives in `workers/src/fireworks.ts`.
- `users.model_profile_id` is persisted via `workers/src/db.ts` and `db/migrations/20260330_model_profiles.sql`.
- `bootstrap-soul`, `soul-converse`, reflections, and synthesis now resolve the user's profile at runtime and record the effective provider/profile in traces.
- Added coverage in `tests/unit/llm.test.ts` and `tests/unit/modelProfiles.test.ts`.

## Verification Notes

- `pnpm --dir workers run typecheck` passed.
- `pnpm test` passed.
- `pnpm lint` passed.
- `pnpm db:migrate` passed.
- Local worker ran successfully on `http://localhost:8787`.
- Live `frontier_v1` verification succeeded end to end, including SSE reply streaming.
- Local `value_v1` routing/plumbing succeeded with a temporary Fireworks binding and default-profile override.
- On March 30, 2026, Fireworks live inference returned `HTTP 412 PRECONDITION_FAILED` because the account was suspended for billing/account-state reasons, and the server correctly fell back to the built-in fallback response.

## Tomorrow

- Create a new Cloudflare account for stronger prod/dev isolation.
- Update `reflection_note` to run every 5 conversation turns.
- Version `reflection_note` records.
- Version soul files.
- Make deletion soft delete instead of hard delete.
- Get a new Fireworks account and re-run live `value_v1` verification.
