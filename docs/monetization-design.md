# Thumos Monetization Design Doc

## Philosophy

Conversations are the oil. They build the soul file, create sunken cost, and produce the data that makes matching valuable. We never paywall conversations.

Premium is a quality filter. $29.99/mo signals commitment and curates the matching pool. Every premium user is someone serious about connection.

## Tiers

### Free

| Feature | Detail |
|---------|--------|
| Soul conversations | Unlimited (DeepSeek model) |
| Soul file | Full — all sections, compass, spectrum, values, moments |
| Soulmate profile | Can create and edit |
| Match visibility | "You have X matches" — names hidden except 1 |
| Match messaging | 1 match unlocked per month, full messaging |
| Match reasoning | Hidden ("Upgrade to see how you connect") |
| Badge | None |

### Thumos Premium — $29.99/month

| Feature | Detail |
|---------|--------|
| Soul conversations | Unlimited (Claude Opus — best quality) |
| Soul file | Full |
| Soulmate profile | Can create and edit |
| Match visibility | All matches revealed with names |
| Match messaging | Unlimited |
| Match reasoning | Full "How you connect" text |
| Badge | Premium icon visible to matches |
| Future | Active exploration features (TBD) |

### Pricing Options

| Plan | Price | Per month |
|------|-------|-----------|
| Monthly | $29.99 | $29.99 |
| Annual | $239.99 | $19.99 (save 33%) |

Annual plan reduces churn and locks in committed users. No weekly plan — weekly pricing attracts casual users we want to filter out.

## Unit Economics

### Cost per free user (~3 conversations/week, DeepSeek)

| Component | Monthly cost |
|-----------|-------------|
| Conversations (DeepSeek) | $1.07 |
| Reflection snapshots (DeepSeek) | $0.26 |
| Visible synthesis (DeepSeek) | $0.16 |
| Hidden synthesis (DeepSeek) | $0.15 |
| Match evaluations (Haiku) | $0.04 |
| Infrastructure | $0.05 |
| **Total** | **~$1.73** |

Free users cost under $2/mo. Sustainable at scale with zero revenue — they're building the matching pool and their own lock-in.

### Cost per premium user (~3 conversations/week, Opus + prompt caching)

| Component | Monthly cost |
|-----------|-------------|
| Conversations (Opus, cached) | $3.00 |
| Reflection snapshots (Haiku) | $0.55 |
| Visible synthesis (Opus) | $1.82 |
| Hidden synthesis (Haiku) | $0.34 |
| Match evaluations (Haiku) | $0.35 |
| Match messaging overhead | $0.50 |
| Infrastructure | $0.10 |
| **Total** | **~$6.66** |

### Margin

| | Revenue | Cost | Margin |
|---|---------|------|--------|
| Free user | $0 | $1.73 | -$1.73 |
| Premium (monthly) | $29.99 | $6.66 | **+$23.33 (78%)** |
| Premium (annual) | $19.99/mo | $6.66 | **+$13.33 (67%)** |

At 5% conversion rate:
- 1,000 users → 50 premium → $1,500/mo revenue, $950 free user cost → **$550/mo net**
- 10,000 users → 500 premium → $15,000/mo revenue, $9,500 free user cost → **$5,500/mo net**
- Breakeven: ~8 free users per 1 premium user (we can sustain ~19:1)

## Feature Details

### Model Routing by Tier

Free users route through `value_v1` profile (DeepSeek via Fireworks). Premium users route through `frontier_v1` profile (Claude Opus). The routing happens server-side based on subscription status — the user never sees a model name.

Conversation quality difference is real but subtle. DeepSeek produces good reflective dialogue. Opus produces exceptional reflective dialogue — more nuanced observations, better memory of earlier threads, sharper questions. Premium users will feel the difference over time without being able to name it.

**Implementation:** Add `subscription_tier` field to users table (`free` | `premium`). Model profile selection in `soul-converse` handler checks tier instead of using the global default.

### Match Gating

**Free users:**
- Matching pipeline evaluates them against all candidates (same as premium)
- `GET /soulmate-matches` returns: `{ match_count: 4, matches: [{ ...one_unlocked_match }], locked_count: 3 }`
- The 1 unlocked match rotates monthly (highest score match that hasn't been unlocked before)
- Locked matches show no name, no reasoning — just the count
- Free users can message their 1 unlocked match with no restrictions

**Premium users:**
- All matches returned with full details
- Reasoning text included
- Unlimited messaging with all matches

**Implementation:** Add `free_match_unlocked_at` timestamp to track the monthly rotation. The `get-matches` handler checks tier and returns full or gated response.

### Premium Badge

Premium users display a small icon next to their name in the match list and chat. This serves two purposes:

1. **Social proof for the premium user** — their match knows they're serious
2. **Soft conversion pressure on free users** — "this person paid $30/mo to talk to you"

The badge is a simple field in the match response: `is_premium: true`. The iOS client renders a small icon (suggest: a subtle gold dot or minimal mark — not flashy, consistent with Thumos aesthetic).

**Design principle:** The badge should feel like a quiet signal of commitment, not a status symbol. Think: a small gold mark, not a crown or star.

**Implementation:** `GET /soulmate-matches` and `GET /match-messages` include `is_premium` boolean for each matched user. iOS renders badge conditionally.

### Prompt Caching

Enable Anthropic prompt caching on the soul-converse endpoint. The system prompt + early transcript are identical across exchanges within a session — cache hit rate should be 80-90%.

Expected savings: conversation cost drops from ~$10/mo to ~$3/mo per premium user.

**Implementation:** Add `cache_control` breakpoints in the Claude API call at the system prompt boundary and at the transcript prefix boundary.

## Subscription Infrastructure

### Server-side

- Add `subscription_tier` (`free` | `premium`) and `subscription_expires_at` to `users` table
- Add `POST /verify-receipt` endpoint — receives App Store receipt, validates with Apple, updates tier
- Add `GET /subscription-status` endpoint — returns current tier and expiry
- Cron job or webhook to handle expiration/renewal

### iOS-side

- StoreKit 2 for subscription management (native, no RevenueCat dependency needed)
- Product IDs: `com.trythumos.premium.monthly`, `com.trythumos.premium.annual`
- Paywall screen shown when user taps a locked match or tries to see reasoning
- Settings screen shows current plan with manage/cancel link

### Receipt Validation

Use Apple's App Store Server API v2 (not the deprecated `verifyReceipt` endpoint). Server-side validation ensures users can't fake premium status.

## Migration Path

### Phase 1 (v1.1 — current)
- All features free for all users
- Build user base, gather feedback, tune matching quality

### Phase 2 (v1.2 — monetization)
- Add subscription infrastructure
- Add model routing by tier
- Add match gating
- Add premium badge
- No free trial — the unknown is the hook. Trials let people grab matches and disappear.

### Phase 3 (v1.3 — future)
- Active exploration features for premium (TBD)
- Possibly: credits system for a la carte features

## Resolved Decisions

### 1. Free match includes reasoning — yes
The 1 free match/month shows full "How you connect" text. Give them the complete taste so they know what they're paying for when they upgrade.

### 2. Messaging rules by tier

| Scenario | Can send? | Can read? |
|----------|-----------|-----------|
| Premium → Premium | Yes | Yes |
| Premium → Free | Yes | Yes |
| Free → their 1 unlocked match | Yes | Yes |
| Free → locked matches | No | No |
| Free → premium who messaged them | **No — "Pay to reply"** | **Yes — can see the message** |
| Lapsed premium → existing matches | No new messages | Can see full history |

**The "pay to reply" moment:** A free user sees a message from a premium match they can't reply to. This is the highest-conversion moment in the app. They know someone serious is reaching out, they can read what they said, and the only barrier is $29.99.

**Lapsed premium:** All existing matches and message history remain visible (read-only). No new messages allowed. They should have exchanged contact info while active — but if they didn't, the conversation is frozen, not deleted. Re-subscribing unfreezes everything instantly.

### 3. No priority queue — same matching pipeline for all
At current scale, no need to differentiate. Revisit when user base grows.

### 4. No free trial
Trials attract free-trial-hoppers who grab matches and disappear. The 1 free match/month already demonstrates value. The unknown — "you have 4 matches waiting" — is the hook. A trial removes the mystery.

## Messaging Implementation Detail

The `match-messages` handler needs tier-aware logic:

```
POST /match-messages (send)
  - Premium user: allow to any match
  - Free user: allow only to their 1 unlocked match of the month
  - Lapsed premium: reject with "Resubscribe to continue messaging"
  - Free user replying to premium who messaged them: reject with "Upgrade to reply"

GET /match-messages (read)
  - All tiers: can read all messages in matches they have access to
  - Free user: can read messages from premium users who messaged them
```

The iOS client shows the reply input bar disabled with a subtle "Upgrade to reply" prompt when the user can read but not send.
