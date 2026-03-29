# Vision Todo

Generated from: VISION.md
Phase: Phase 1 — Soul File Creation
Date: 2026-03-27

## Items

### Fix broken things
- [x] Surface bootstrap error messages in the UI — `AppModel.errorMessage` is set on failure but no view displays it; users see a blank screen when offline or server is down

### Strengthen foundations (tests)
- [x] Add integration tests for Phase 1 edge functions — `bootstrap-soul`, `soul-converse`, `get-soul-file`, `end-soul-session` have zero test coverage (only Phase 2 handlers are tested)
- [x] Add unit tests for `soulApp.ts` session lifecycle — `runReflectionUpdate`, `runSoulSynthesis`, `bootstrapSoulState`, `isSessionStale`, `autoCompleteStaleSession` are untested core functions

### Refactor and clean
- [x] Remove dead `[SESSION_COMPLETE]` marker infrastructure — `parseSessionInsights`, `SessionInsight`, and `cleanSessionCompleteMarker` are vestigial; the system prompt no longer emits this marker
- [x] Fix double bootstrap call — `ThumosApp` triggers `bootstrap()` via `autoBootstrap: true`, then `SoulMirrorTabView.task` calls `bootstrapSoul()` again, causing two network calls on every launch

### Tooling / infrastructure
- [x] Add SSE stream timeout on iOS — `URLSession.bytes` has no timeout; a hung edge function leaves `isSoulStreaming` stuck true indefinitely; add a reasonable timeout (e.g. 60s inactivity)

### Complete partial features
- [x] Commit the conversation restore feature — the uncommitted changes (bootstrap-soul returns messages, iOS loads them) are clean and correct; commit them
- [x] Re-implement session end with synthesis — `end-soul-session` backend is complete but unreachable from iOS (was reverted); without this, the Opus 4-expert synthesis never runs and soul files stay at Haiku-quality light extractions only
- [x] Add pull-to-refresh on SoulFileScreen — `refreshSoulFile()` exists in AppModel but no view calls it; users can't see synthesis results without restarting the app

### Highest-value new features
- [x] Animate typing indicator dots — the 3 dots are static circles with no animation; feels frozen during 2-4s LLM response time; add a simple bouncing/pulsing animation
- [x] Show loading state during bootstrap — first app impression is a blank grey screen during the 2 network calls; add a minimal loading indicator

### Polish
- [x] Show "last updated" on soul file screen — `lastUpdated` exists in the model but is never displayed; gives users a sense of their soul file evolving over time
- [x] Warm up the empty soul file message — "Your soul file is empty" is cold; replace with something inviting like "Your soul file will take shape as we talk"

## Post-Launch

### Cost optimization
- [ ] Make LLM model configurable per endpoint — currently hardcoded in `claude.ts`; add a config layer so conversation/reflection/synthesis can each use different models (e.g. DeepSeek v3.2, Sonnet 4, Opus 4)
- [ ] A/B test model quality — instrument which model served each conversation, compare soul file quality and user retention across models
