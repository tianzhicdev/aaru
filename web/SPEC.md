# Thumos Website — Implementation Spec

## Overview

Static site at `trythumos.com/thumos`. Three purposes:
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

```
┌─────────────────────────────────────┐
│  Thumos                    Privacy  │
│                            Support  │
├─────────────────────────────────────┤
│                                     │
│           T H U M O S               │
│       The spirit within.            │
│                                     │
│   An AI that helps you understand   │
│   who you really are — through      │
│   honest, reflective conversation.  │
│                                     │
│   No quizzes. No labels. Just a     │
│   mirror.                           │
│                                     │
│       [Download on App Store]       │
│                                     │
├─────────────────────────────────────┤
│                                     │
│          How it works               │
│                                     │
│  ① Talk                             │
│  Have an open conversation. Thumos  │
│  asks one question at a time.       │
│  Listens more than it speaks.       │
│                                     │
│  ② Reflect                          │
│  The AI notices patterns — your     │
│  words, your contradictions, what   │
│  you didn't say.                    │
│                                     │
│  ③ Discover                         │
│  Your soul file builds over time.   │
│  A living portrait written in your  │
│  own language. Not labels. You.     │
│                                     │
├─────────────────────────────────────┤
│                                     │
│       "I'm not a therapist.         │
│        I'm a mirror."              │
│                   — Thumos          │
│                                     │
├─────────────────────────────────────┤
│                                     │
│   What your soul file looks like    │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Portrait                      │  │
│  │ "You move through the world   │  │
│  │  like someone who built       │  │
│  │  walls to protect their       │  │
│  │  creative space, then forgot  │  │
│  │  where you put the door."     │  │
│  ├───────────────────────────────┤  │
│  │ HOW YOU THINK                 │  │
│  │ You reach for metaphors       │  │
│  │ before logic...               │  │
│  ├───────────────────────────────┤  │
│  │ YOUR CONTRADICTIONS           │  │
│  │ You crave solitude but your   │  │
│  │ best memories are crowded...  │  │
│  └───────────────────────────────┘  │
│                                     │
│  7 sections. Crystallized moments.  │
│  Evolves with every conversation.   │
│                                     │
├─────────────────────────────────────┤
│                                     │
│       [Download on App Store]       │
│                                     │
│  Privacy · Support                  │
│  © 2026 Kwafy LLC             │
│                                     │
└─────────────────────────────────────┘
```

**Content blocks (top to bottom):**

1. **Nav** — "Thumos" wordmark left, "Privacy" + "Support" links right. Sticky on scroll? No — keep it simple.

2. **Hero** — App name in spaced uppercase (`letter-spacing: 0.3em`), serif tagline "The spirit within.", 2-sentence description, App Store badge. Centered. Lots of breathing room.

3. **How it works** — Three numbered steps. Gold circled numbers. Short copy (2 sentences each). The three steps map to the actual product flow: Talk → Reflect (extraction every 8 exchanges) → Discover (soul file).

4. **Quote** — "I'm not a therapist. I'm a mirror." in italic serif. This is the AI's actual line from the system prompt. It's the single most powerful positioning line.

5. **Soul file preview** — Styled card showing a realistic (but fictional) soul file excerpt. Portrait + 2 section previews. This is the "show don't tell" moment. Use the same gold section labels and typography as the iOS app.

6. **Bottom CTA** — App Store badge again + brief "Free. No account needed." line.

7. **Footer** — Privacy, Support, © Kwafy LLC.

**SEO meta:**
```html
<title>Thumos — The Spirit Within | AI Soul Mirror</title>
<meta name="description" content="Thumos is a soul mirror — an AI that helps you understand who you really are through honest, reflective conversation. No quizzes. No labels. Just a mirror.">
<meta property="og:title" content="Thumos — The Spirit Within">
<meta property="og:description" content="An AI soul mirror. Understand who you really are through reflective conversation.">
<meta property="og:image" content="https://trythumos.com/thumos/assets/og-image.png">
<meta property="og:url" content="https://trythumos.com/thumos/">
<link rel="canonical" href="https://trythumos.com/thumos/">
```

**Structured data (JSON-LD):**
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Thumos",
  "operatingSystem": "iOS",
  "applicationCategory": "LifestyleApplication",
  "offers": { "@type": "Offer", "price": "0" },
  "description": "A soul mirror — AI-powered reflective conversation that builds a living portrait of who you are."
}
```

### 2. Privacy Policy (`privacy.html`)

**Required by:** Apple App Store, GDPR, CCPA

**Sections:**

1. **What Thumos is** — AI-powered reflective conversation app
2. **Data we collect:**
   - Device-generated anonymous ID (stored in Keychain, not linked to Apple ID)
   - Conversation messages (text you type)
   - Soul file content (AI-generated portrait based on your conversations)
   - Basic usage data (session count, exchange count)
3. **How we use your data:**
   - To generate AI responses during conversation
   - To build and update your soul file
   - To maintain conversation continuity across sessions
4. **Third-party AI provider — Anthropic:**
   - "Your conversation messages are processed by Claude, an AI model made by Anthropic (anthropic.com)."
   - "Anthropic processes your messages to generate responses. Anthropic does not use your conversations to train their models."
   - Link to Anthropic's privacy policy
5. **Data storage:**
   - Hosted on Supabase (PostgreSQL, US region)
   - Conversations persist until you delete them or your account
   - Sessions auto-complete after 72 hours of inactivity
6. **Your rights (GDPR Art. 15-20):**
   - Access: request a copy of your data
   - Deletion: "Delete My Data" button in app, or email support
   - Portability: request data export
7. **CCPA:**
   - "We do not sell your personal information."
   - "We do not share your data with third parties for advertising."
8. **Children:**
   - Not intended for children under 13
9. **Changes:**
   - We'll update this page; date at top
10. **Contact:**
    - Support email

**Effective date:** [launch date]

### 3. Support Page (`support.html`)

**FAQ format:**

**What is Thumos?**
Thumos is a soul mirror — an AI that helps you understand who you really are through honest, reflective conversation. It builds a living portrait (your "soul file") that evolves with every conversation.

**Is this therapy?**
No. Thumos is not a therapist and does not provide medical advice, diagnosis, or treatment. It's a reflective tool — a mirror, not a prescription. If you're in crisis, please contact a mental health professional or call 988 (Suicide & Crisis Lifeline).

**Who sees my conversations?**
Only you. Your conversations are processed by Anthropic's Claude AI to generate responses. No human at Thumos or Anthropic reads your conversations. Your soul file is private to you.

**How does the soul file work?**
As you talk, Thumos listens for patterns — your words, your metaphors, your contradictions, what you don't say. Every few exchanges, it synthesizes what it heard into your soul file. Over multiple conversations, this portrait becomes richer and more accurate. It's written in your own language, in second person ("you..."), like a character portrait from a novel.

**How do I delete my data?**
Open the app → Settings → "Delete My Data." This permanently deletes your conversations, soul file, and device identity. You can also email us at [support email].

**What AI powers Thumos?**
Thumos uses Claude, made by Anthropic. Conversation responses use Claude Opus. Soul file synthesis uses Claude Opus and Haiku. Anthropic does not use your data to train their models.

**Is Thumos free?**
Yes. Thumos is free to use.

**Contact:**
[support email]

## File Structure

```
web/
├── SPEC.md              ← this file
├── index.html           ← landing page
├── privacy.html         ← privacy policy
├── support.html         ← support/FAQ
├── style.css            ← shared styles
└── assets/
    ├── og-image.png     ← Open Graph social preview (1200x630)
    └── app-store-badge.svg
```

## Cloudflare Pages Deployment

1. Cloudflare dashboard → Pages → Create project → Connect to GitHub
2. Build settings: build output directory = `web/`, no build command needed
3. Custom domain: add `trythumos.com` → create route for `/thumos/` path
4. Enable Web Analytics (dashboard toggle → copy snippet into HTML)

**Path handling:** The site lives at `/thumos/`. All internal links use relative paths (`privacy.html`, not `/thumos/privacy.html`) so the site works both locally and deployed. Cloudflare routes `/thumos/*` to the Pages project root.

## Asset Checklist

- [ ] `og-image.png` — 1200x630, gold "THUMOS" text on near-white bg, tagline below
- [ ] `app-store-badge.svg` — Apple's official "Download on the App Store" badge
- [ ] `favicon.ico` — simple gold "T" on white, or app icon scaled down

## Not in v1

- Blog / SEO content articles (add later)
- JavaScript interactions (no JS needed)
- Cookie consent banner (Cloudflare Analytics is cookie-free)
- User accounts or login
- App Store screenshots on the landing page (keep it text-focused, mysterious)
