# Design: Google & Apple Sign-In for Thumos

> Status: **Future** — documented for when we're ready to implement.

## Context

Thumos currently uses device-based anonymous auth (device UUID → user). This means one device = one user, no multi-device, no account recovery. We want to add Google/Apple Sign-In so users can:
- Sign in across multiple devices
- Recover their account if they lose a device
- Keep anonymous/guest mode for users who don't want to sign in

**Design principle**: No vendor lock-in. Store provider-agnostic identity data (`provider` + `sub` claim). Server verifies ID tokens directly using JWKS — no vendor SDKs on the backend.

---

## Data Available from Providers

| Field | Apple | Google |
|-------|-------|--------|
| Permanent user ID (`sub`) | Yes | Yes |
| Email | Yes (or private relay `*@privaterelay.appleid.com`) | Yes |
| Email verified | Yes | Yes |
| Name | First sign-in only, then gone forever | Always |
| Profile picture | No | Yes (URL) |
| Hide My Email | Built-in (user choice) | No equivalent |

**Key**: The `sub` claim is the only stable identifier. Email can change. Name may be hidden. Always key on `provider + sub`.

---

## Architecture: How It Fits

```
Current:  device_id → ensureUser() → user → session token
New:      id_token  → verifySocialIdToken() → findOrCreateUser() → session token
                                                    ↕
                                            user_identities table
```

- Social auth is a **parallel path**, not a modification of device auth
- Both paths end with the same HMAC session token (reuse `issueSessionToken()`)
- Existing anonymous flow is untouched — zero changes to `bootstrap-soul`

---

## 1. Database Migration

**File**: `db/migrations/YYYYMMDD_social_auth.sql`

```sql
-- Identity linking table (provider-agnostic)
CREATE TABLE user_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('apple', 'google')),
  provider_sub TEXT NOT NULL,
  email TEXT,
  email_verified BOOLEAN DEFAULT false,
  display_name TEXT,
  profile_picture_url TEXT,
  raw_claims JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_sub),
  UNIQUE(user_id, provider)
);

CREATE INDEX user_identities_user_id_idx ON user_identities(user_id);

-- Allow social-first users (no device)
ALTER TABLE users ALTER COLUMN device_id DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT users_device_id_key;
CREATE UNIQUE INDEX users_device_id_unique_idx ON users(device_id) WHERE device_id IS NOT NULL;
```

---

## 2. Server: JWT Verification Module

**New file**: `workers/src/socialAuth.ts`
**New dependency**: `jose` (works on Cloudflare Workers V8 — confirmed)

- `verifyAppleIdToken(idToken, audience)` — fetches JWKS from `https://appleid.apple.com/auth/keys`, verifies RS256 JWT
- `verifyGoogleIdToken(idToken, audience)` — fetches JWKS from `https://www.googleapis.com/oauth2/v3/certs`, verifies RS256 JWT
- `verifySocialIdToken(provider, idToken, config)` — dispatches to the right verifier
- Returns `VerifiedIdentity { provider, providerSub, email, emailVerified, displayName, profilePictureUrl, rawClaims }`
- Uses `jose.createRemoteJWKSet()` for automatic JWKS caching

---

## 3. Server: DB Functions

**Modified file**: `workers/src/db.ts`

- `findUserIdentity(sql, provider, providerSub)` → look up existing linked identity
- `createSocialUser(sql, displayName, modelProfileId)` → INSERT user with `device_id = NULL`
- `linkUserIdentity(sql, userId, identity)` → INSERT into `user_identities`
- `getUserIdentities(sql, userId)` → list linked providers for settings UI

---

## 4. Server: New Endpoint `POST /social-auth`

**New file**: `workers/src/handlers/social-auth.ts`
**Modified file**: `workers/src/index.ts` (add route)
**Modified file**: `workers/src/env.ts` (add `APPLE_CLIENT_ID?`, `GOOGLE_CLIENT_ID?`)

Three scenarios:

| Scenario | Condition | Action |
|----------|-----------|--------|
| Returning social user | Identity found in `user_identities` | Load user → issue session |
| New social user | No identity, no existing session | Create user → link identity → issue session |
| Account linking | No identity, valid `x-thumos-session` header | Link identity to session's user |

**Request**: `{ provider: "apple"|"google", id_token: string, device_id?: string }`
**Response**: Same shape as `bootstrap-soul` response + `linked: boolean` (additive field)

Reuses `issueSessionToken()` from `workers/src/auth.ts` — no changes to session infrastructure.

---

## 5. Contract Updates

- **New file**: `contracts/social-auth.response.json` — golden fixture
- **Modified**: `src/contracts/api.ts` — add `SocialAuthWireRequest`, `SocialAuthWireResponse`
- **Modified**: `tests/unit/contracts.test.ts` — verify fixture
- **Modified**: `ThumosTests/ContractTests.swift` — verify iOS decoding

Response extends bootstrap response (additive `linked` field) — old clients ignore unknown keys.

---

## 6. iOS: Native Sign-In SDKs

**Apple Sign-In** — `AuthenticationServices` framework (built into iOS, no dependency)
**Google Sign-In** — `GoogleSignIn` SPM package (add to `project.yml`)

### New files:
- `Thumos/App/AuthService.swift` — wraps Apple/Google SDK calls, returns `(provider, idToken, displayName)`
- `Thumos/App/SignInView.swift` — "Sign in with Apple" + "Sign in with Google" buttons

### Modified files:
- `Thumos/App/BackendClient.swift` — add `socialAuth(provider:idToken:deviceId:)` method
- `Thumos/App/AppModel.swift` — add `socialSignIn()` method, `isLinkedToSocialAccount` state
- `Thumos/App/SecureStore.swift` — add `SocialAuthIdentity` for storing linked provider info
- `project.yml` — add GoogleSignIn dependency + Apple Sign-In entitlement

### UI placement:
1. **Settings/account section** — accessible from Soul File tab, for upgrading anon → social
2. **Optional on first launch** — after consent, "Sign in to sync across devices" with "Skip" option

---

## 7. Account Linking & Multi-Device

**Upgrade flow**: Anonymous user taps "Sign in with Apple" → sends existing session + ID token → server links identity to their user → same user_id, all data preserved.

**Multi-device flow**: New device → Sign in with Apple → server finds existing `user_identities` row → issues session for the existing user → all data (messages, soul file, matches) immediately accessible.

**Conflict**: If identity is already linked to a different user, return 409 with explanation. iOS offers "sign in as that user" or "stay as guest".

---

## 8. Env Secrets

```bash
wrangler secret put APPLE_CLIENT_ID    # "com.trythumos.app"
wrangler secret put GOOGLE_CLIENT_ID   # from Google Cloud Console
```

No API keys needed — ID token verification uses public JWKS endpoints only.

---

## 9. Implementation Order

| # | Task | Files |
|---|------|-------|
| 1 | DB migration | `db/migrations/YYYYMMDD_social_auth.sql` |
| 2 | `jose` dependency | `workers/package.json` |
| 3 | JWT verification module | `workers/src/socialAuth.ts` |
| 4 | DB functions | `workers/src/db.ts` |
| 5 | Social auth handler | `workers/src/handlers/social-auth.ts` |
| 6 | Route + env types | `workers/src/index.ts`, `workers/src/env.ts` |
| 7 | Contract fixture + types | `contracts/`, `src/contracts/api.ts` |
| 8 | TS tests | `tests/unit/socialAuth.test.ts`, `tests/integration/socialAuth.test.ts` |
| 9 | iOS: Google Sign-In dep | `project.yml` |
| 10 | iOS: AuthService + SignInView | `Thumos/App/AuthService.swift`, `Thumos/App/SignInView.swift` |
| 11 | iOS: Backend + AppModel + SecureStore | Modified files |
| 12 | iOS: Contract tests | `ThumosTests/` |

**Server deploys first** (new endpoint, backward compatible). iOS update follows.
