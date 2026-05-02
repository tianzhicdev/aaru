# Thumos Website — Implementation Spec

## Overview

Static site at `trymagpie.xyz`. Three purposes:
1. **App Store compliance** — privacy policy + support URL (hard requirements)
2. **Landing page** — SEO + social sharing + App Store marketing URL
3. **Foundation** — can add blog later for organic traffic

## Tech Stack

- **Plain HTML + CSS** — no build step, no framework, no JS (except analytics snippet)
- **Hosting**: Cloudflare Pages (free tier — unlimited bandwidth, 500 builds/month)
- **Analytics**: Cloudflare Web Analytics (free, cookie-free, no GDPR banner needed)
- **Deploy**: connect GitHub repo → auto-deploy on push, build output = `web/`

## Design System

Matches the iOS app exactly:

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#FAFAFA` | Page background |
| `--text` | `#1A1A1A` | Body text |
| `--text-muted` | `#6B6B6B` | Secondary text, captions |
| `--accent` | `#D4B04D` | Gold highlights, links, CTAs |
| `--accent-hover` | `#BFA043` | Hover state |
| `--surface` | `#F0F0F0` | Cards, FAQ items |
| `--border` | `#E0E0E0` | Subtle dividers |
| `--font` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` | Body |
| `--font-serif` | `Georgia, 'Times New Roman', serif` | Portrait quotes, hero tagline |

**Typography scale:**
- Hero title: 3rem / 700
- Section heading: 1.5rem / 600
- Body: 1.125rem / 400
- Caption: 0.875rem / 400

**Layout:** Single column, max-width 680px, generous vertical spacing (4-6rem between sections). Mobile-first. No hamburger menu — just inline nav links.

## Pages

### 1. Landing Page (`index.html`)

**Content blocks (top to bottom):**

1. **Nav** — "Thumos" wordmark left, "Privacy" + "Support" links right.

2. **Hero** — App name in spaced uppercase, serif tagline "The spirit within.", 2-sentence description, App Store badge. Centered. Lots of breathing room.

3. **How it works** — Three steps: Talk → Reflect → Discover. The AI listens, quietly extracts patterns during conversation, and builds a living portrait over time.

4. **Quote** — "I'm not a therapist. I'm a mirror." The AI's actual positioning line.

5. **Soul file preview** — Styled card showing a realistic (but fictional) soul file excerpt. Portrait + 2 section previews. Show, don't tell.

6. **Bottom CTA** — App Store badge + "Private by design. No account needed."

7. **Footer** — Privacy, Support, © Kwafy LLC.

### 2. Privacy Policy (`privacy.html`)

Covers: what data we collect (anonymous device ID, messages, soul file, activity timestamps), how it's used (AI responses, soul file synthesis, continuity), third-party AI (Anthropic Claude — not used for training), storage (Neon Postgres via Cloudflare Workers), user rights (access, deletion, portability), CCPA, children, analytics.

### 3. Support Page (`support.html`)

FAQ format covering: what Thumos is, not therapy disclaimer (988 crisis line), privacy, soul file mechanics, AI provider (Claude by Anthropic), data deletion, pricing (free), App Store link.

## File Structure

```
web/
├── SPEC.md              ← this file
├── DEPLOY.md            ← deployment instructions
├── index.html           ← landing page
├── privacy.html         ← privacy policy
├── support.html         ← support/FAQ
├── style.css            ← shared styles
├── robots.txt           ← search engine directives
├── sitemap.xml          ← sitemap
└── assets/
    ├── og-image.png     ← Open Graph social preview (1200x630)
    ├── app-store-badge.svg
    ├── favicon.ico
    ├── favicon-16x16.png
    ├── favicon-32x32.png
    └── apple-touch-icon.png
```

## Cloudflare Pages Deployment

See DEPLOY.md for details.

## Not in v1

- Blog / SEO content articles (add later)
- JavaScript interactions (no JS needed)
- Cookie consent banner (Cloudflare Analytics is cookie-free)
- User accounts or login
- App Store screenshots on the landing page (keep it text-focused, mysterious)
