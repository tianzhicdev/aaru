# Launch TODO

Target: Ship Thumos v1 to iOS App Store

---

## Human Tasks (things only you can do)

### Week 1 — Setup

- [x] ~~Enroll in Apple Developer Program~~ — already done
- [x] ~~Register domain~~ — using `trythumos.com/thumos`
- [ ] **Set up Cloudflare Pages** — In Cloudflare dashboard: Pages → Create Project → Connect to Git (or direct upload). I'll write the site in `./web/` and a spec for your review.
- [ ] **Decide on support email** — e.g. `info@trythumos.com` or whatever you prefer. Cloudflare Email Routing can forward for free.
- [ ] **Rename GitHub repo** — GitHub → Settings → Repository name → change to `thumos`. Then locally: `git remote set-url origin <new-url>`.

### Week 2 — Apple Setup

- [ ] **Create app in App Store Connect** — My Apps → New App. Name: "Thumos", bundle ID: `com.trythumos.app`, SKU: `thumos-v1`, category: Lifestyle or Health & Fitness.
- [ ] **Answer age rating questionnaire** — No violence/gambling/mature content → likely 12+.
- [ ] **Set up Xcode signing** — Signing & Capabilities → Team → your Apple Developer account → Automatically manage signing.

### Week 3 — Beta & Screenshots

- [ ] **Recruit 10-20 TestFlight testers** — Friends, family. Share Apple IDs or use a public TestFlight link.
- [ ] **Take App Store screenshots** — I can automate via simulator, you choose which conversations/soul files look best. Need 6.9" iPhone screenshots (1320x2868).
- [ ] **Review App Store description** — Draft ready in `marketing/app-store-description.md`. Personalize and submit. First 3 lines are critical.

### Week 4 — Supabase

- [ ] **Update Supabase environment variables** — Dashboard → Settings → Edge Functions → Secrets. Add `THUMOS_SESSION_SECRET` (same value as current `Thumos_SESSION_SECRET`). I'll tell you exactly which keys.
- [ ] **Verify Supabase RLS policies** — Anon key will be in a public binary. Ensure row-level security is tight.

### Ongoing

- [ ] **Monitor crash reports** post-launch
- [ ] **Write marketing posts** — I draft, you personalize and post

---

## Claude Tasks (things I can build)

### Phase A: Rename AARU → Thumos ✅

Completed. All ~85 references renamed, tests pass, deployed, verified on simulator.

### Phase B: Version Check + Forced Update

- [ ] Build `/version` edge function — accepts `{ buildVersion: string }`, returns `{ status: "ok" | "deprecated" | "unsupported", minVersion: string, message?: string }`
- [ ] Add version check on iOS app launch (before bootstrap)
- [ ] Build forced update screen — full-screen view with "Update Required" message + App Store link
- [ ] User data is preserved (server-side, keyed by device ID) — no data loss on update

### Phase C: Apple Compliance (AI consent + privacy)

- [ ] Build AI consent modal — first-launch SwiftUI screen:
  - Names Anthropic/Claude as AI provider
  - Explains data sent (conversation messages) and generated (soul file)
  - "I Agree" button required before any network call
  - Persists consent in UserDefaults
  - Links to privacy policy URL
- [ ] Build account/data deletion — Settings screen with "Delete My Data" button + backend `delete-account` edge function
- [ ] Add content report mechanism — "Report" button on assistant messages
- [ ] Add "AI-generated" label on soul file screen
- [ ] Add "Talking to AI" indicator in conversation
- [ ] Update `PrivacyInfo.xcprivacy` — declare actual data practices
- [ ] Write privacy policy page (for website)
- [ ] Write support page (for website)

### Phase D: Website

- [x] Write spec doc in `./web/SPEC.md` — detailed implementation spec with wireframe, design system, all 3 pages, SEO, Cloudflare deployment instructions
- [ ] Build static site for `trythumos.com/thumos`:
  - Landing page (hero + description + App Store badge)
  - `/thumos/privacy` — privacy policy
  - `/thumos/support` — support/contact
- [ ] Configure for Cloudflare Pages deployment
- [ ] Set up Cloudflare Web Analytics (free, no cookies)

### Phase E: Ship to App Store

- [ ] Add crash reporting SDK (Sentry — free tier, 5K events/month)
- [ ] Build with Xcode 26 SDK (required after April 28, 2026)
- [ ] Create App Store screenshots via simulator
- [x] Draft App Store description + keywords — `marketing/app-store-description.md`
- [ ] Archive + upload build to App Store Connect
- [x] Write reviewer notes — included in `marketing/app-store-description.md`
- [ ] Submit for review

### Phase F: Post-Launch Marketing

- [x] Draft Product Hunt launch copy — `marketing/product-hunt.md`
- [x] Draft Reddit/HN "Show HN" post — `marketing/show-hn.md`
- [x] Draft Twitter thread — `marketing/twitter-thread.md`
- [x] Draft Reddit posts (4 subreddits) — `marketing/reddit-posts.md`
- [x] Draft IndieHackers post — `marketing/indie-hackers.md`
- [x] Draft App Store description + keywords — `marketing/app-store-description.md`
- [x] Draft press kit — `marketing/press-kit.md`
- [ ] Personalize all drafts (add your voice, fill in [brackets])
- [ ] Post on launch day

---

## Rename Risks & Notes

**Keychain migration**: Old installs have identity under `com.trythumos.app.*`. I'll add migration code to copy old → new keys so users keep their identity.

**HTTP header**: `x-thumos-session` → `x-thumos-session`. Deploy backend first (accept both headers), then ship iOS update, then drop old header.

**Environment variables**: Backend code will fall back to `Thumos_*` if `THUMOS_*` not found, so transition is safe.

**Bundle ID**: New bundle ID = new app to Apple. Fine since we haven't shipped yet.

---

## Suggested Order

1. **Rename** (Phase A) — everything builds on the new name
2. **Version check** (Phase B) — infrastructure for safe future updates
3. **Apple compliance** (Phase C) — blockers for submission
4. **Website** (Phase D) — needed for privacy policy URL
5. **Ship** (Phase E) — archive, upload, submit
6. **Marketing** (Phase F) — post-approval

---

## NOT in v1 (deferred)

- Share feature (soul cards, insight cards)
- Radar chart / soul spectrum visualization
- Soul archetype generation
- Evolution timeline
- Push notifications
- Apple Sign In
- Widgets

---

*This is the executable plan. LAUNCH-RESEARCH.md has the full research behind each decision.*
