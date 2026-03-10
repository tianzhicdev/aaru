# AARU

Backend-first scaffold for the AARU POC described in [AARU_Vision.md](/Users/tianzhichen/projects/aaru/AARU_Vision.md) and [AARU_Implementation_Plan.md](/Users/tianzhichen/projects/aaru/AARU_Implementation_Plan.md).

## Included

- TypeScript domain modules for soul profiles, world ticks, Ka replies, and compatibility scoring
- Supabase SQL migration for the core POC schema
- Edge-function-style handlers under `supabase/functions`
- Unit and integration tests with Vitest

## Commands

```bash
pnpm install
pnpm test
pnpm lint
pnpm ios:generate
pnpm ios:list
```

Supabase local commands are wired through `npx supabase ...` so a global install is not required.

## Deployment note

Remote Supabase deployment needs `SUPABASE_ACCESS_TOKEN` in addition to the project ref and database password. The included `SUPABASE_SECRET_KEY` is useful for runtime access, but it does not authenticate the CLI for `link` or `functions deploy`.
