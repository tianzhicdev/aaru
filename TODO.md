# TODO

## Romance Pivot (April 2026) — Deployed

The romance pivot is live on dev. Server sends dual-format responses (old + new section keys) for backward compatibility.

### Post-Deploy Checklist
- [ ] Apply migration to **production** Neon DB
- [ ] Deploy server to production (`sudo ./deploy.sh --prod --secrets /Users/biubiu/.secrets/prod.env`)
- [ ] Submit new iOS build to App Store
- [ ] After App Store approval + adoption window: `wrangler secret put MIN_SUPPORTED_VERSION` → `1.0.0`
- [ ] Remove compat aliases (see `docs/deprecation-old-soul-fields.md`)

### What Changed
- 7 new romance domains (daily_rhythm → partnership_vision) replacing generic life domains
- 4 conversation phases (spark → hearth) with escalating intimacy
- 7 new soul file sections (howYouLightUp, howYouShowUp, etc.)
- 8 new compass axes (playfulness, devotion, passion, etc.)
- New fields: attachmentStyle, loveSignature (visible), attachmentAssessment, conflictProfile (hidden)
- AI persona rewritten for romance — warm friend, not therapist
- Full i18n rewrite across all 8 languages
- Match evaluation uses 7 romance-specific dimensions

## Deferred: Per-User Language Match Reasoning

When two matched users speak different languages, the match reasoning should ideally be generated once per user's language. Currently, match evaluation + reasoning runs once in English for simplicity.

**When to revisit:** Once the user base includes meaningful cross-language matches.

## Deferred: Raise Soulmate Matching Threshold

The current soulmate matching gate is 70% soul file completeness, which may be too low. Consider supplementing with a minimum message count (e.g., 30-50 messages).

**When to revisit:** Before scaling the user base or if early matches feel shallow.

## Deferred: User Pictures and Bio on Soulmate Profiles

Allow users to upload a profile picture and write a short bio. Currently only `display_name` is shown.

**When to revisit:** Once matching is validated and users want richer profiles.
