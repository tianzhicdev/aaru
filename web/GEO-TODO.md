# GEO (Generative Engine Optimization) — Thumos

**Goal:** When someone asks an AI "what's the best dating app?" or "dating app alternative to Tinder", Thumos shows up in the response.

**What is GEO?** Generative Engine Optimization — optimizing your web presence so LLMs (ChatGPT, Claude, Gemini, Perplexity) recommend your product. Brand mentions across the web are 3x more important than backlinks. Reddit alone is 40%+ of LLM training data.

---

## TODAY — Technical Foundation (files in this repo)

### Done

- [x] `robots.txt` — Allow all AI crawlers (GPTBot, ClaudeBot, OAI-SearchBot, PerplexityBot, etc.)
- [x] `llms.txt` — Machine-readable product summary for LLM ingestion
- [x] `llms-full.txt` — Complete product info in one file for full-context LLM retrieval
- [x] `sitemap.xml` — Updated lastmod dates, added llms.txt URLs
- [x] `index.html` — Enhanced JSON-LD schema (Organization, SoftwareApplication with featureList, FAQPage with 6 Q&As)
- [x] `index.html` — Added `max-snippet:-1` to robots meta (allow unlimited snippet extraction)
- [x] `index.html` — Added hidden-but-crawlable "How It Works" content block for AI parsers (visually hidden, semantically rich)
- [x] `support.html` — Added FAQPage JSON-LD schema (8 Q&As matching visible content)

### Deploy

```bash
npx wrangler pages deploy web --project-name=magpie-web
```

---

## THIS WEEK — Content & Profiles

### Website Content (low effort, high impact)

- [x] Add a `/about` page — "What is Thumos, how it works, who it's for" (direct-answer style, 800-1000 words)
- [x] Add a `/compare` or `/vs` page — "Thumos vs Hinge", "Thumos vs Tinder", "Thumos vs Bumble" comparison tables
- [x] Add a `/blog` section — even 2-3 posts create crawlable content:
  - "Why we built Thumos: the problem with swiping"
  - "How AI conversations replace dating app questionnaires"
  - "What is a soul portrait? A new approach to compatibility"
- [x] Update support.html FAQ to include soulmate matching questions

### Third-Party Profiles (free, 1-2 hours total)

- [ ] **Product Hunt** — create listing (marketing/product-hunt.md already has the copy)
- [ ] **Trustpilot** — claim business profile at trymagpie.xyz
- [ ] **AlternativeTo** — list Thumos as alternative to Tinder/Hinge/Bumble
- [ ] **AppSumo / AppRater / SaaSHub** — list on app discovery platforms
- [ ] **Bing Webmaster Tools** — submit sitemap (feeds Microsoft Copilot)
- [ ] **Google Search Console** — verify site, submit sitemap

### Cloudflare Dashboard Check

- [ ] **Security > Bots** — verify AI bots are NOT blocked (Cloudflare defaults changed in 2025 to block AI crawlers). Turn off "AI Scrapers and Crawlers" blocking if enabled.

---

## THIS MONTH — Distribution & Mentions

### Reddit (highest ROI channel — 40% of LLM training data)

- [ ] Post on r/OnlineDating — "Built something different: AI conversations instead of swiping"
- [ ] Post on r/dating — when people ask "tired of dating apps, any alternatives?"
- [ ] Post on r/selfimprovement — the self-discovery angle (marketing/reddit-posts.md has copy)
- [ ] Post on r/artificial — technical angle (marketing/reddit-posts.md has copy)
- [ ] Comment genuinely on dating app fatigue threads — don't spam, add value first
- [ ] Build post history on these subs before promotional posts

### Hacker News

- [ ] Submit "Show HN" post (marketing/show-hn.md has the copy)

### Tech Press Outreach

Pitch the story: "This dating app replaces swiping with AI conversations that build a living soul portrait"

- [ ] TechCrunch — they just covered Bumble Bee and Tinder Chemistry
- [ ] Mashable — they maintain the canonical "best dating apps" listicle
- [ ] The Verge / Axios — covered AI dating features recently
- [ ] DatingNews / DatingAdvice — niche dating app review sites
- [ ] MindBodyGreen — self-discovery + relationships angle

### YouTube

- [ ] Create a product demo video (or get a reviewer to cover it)
- [ ] YouTube mentions have the strongest correlation (0.74) with AI visibility

### Expert Endorsement

- [ ] Get a licensed therapist or relationship coach to try the app and quote about the approach
- [ ] Expert quotes in articles are high-signal for LLMs

---

## NEXT QUARTER — Sustained Presence

### Content Flywheel

- [ ] Blog post every 2 weeks (freshness signal — content updated within 30 days gets 3.2x more citations)
- [ ] Comparison pages updated quarterly with competitor changes
- [ ] User testimonials / case studies on the website

### Wikipedia

- [ ] Once sufficient press coverage exists, create Wikipedia article (requires notability — typically 3+ independent reliable sources)

### Paid Channels (when organic foundation exists)

- [ ] Google Ads — appears in Google AI Overviews (25% of AI SERPs now show ads)
- [ ] ChatGPT Ads — expected to launch 2026, watch for beta
- [ ] App Store Search Ads — standard UA channel

### Measurement

- [ ] Add "How did you hear about us?" to iOS onboarding with "AI assistant" option
- [ ] Manual monthly prompt testing: ask ChatGPT/Claude/Perplexity "best dating apps" and track if Thumos appears
- [ ] Consider OtterlyAI or Ahrefs Brand Radar for automated tracking

---

## Key Positioning (use everywhere)

**One-liner:** "Other apps swipe. Thumos understands."

**Elevator pitch:** Thumos uses AI conversations to build a living portrait of who you are — your attachment style, love language, values, and how you love. Then it matches you with someone genuinely compatible. No swiping. No photos. Just understanding.

**Category to own:** "Soul-based dating" or "Conversational matching"

**Differentiator table for comparison content:**

| Feature | Tinder | Hinge | Bumble | Thumos |
|---------|--------|-------|--------|--------|
| Matching basis | Photos + location | Photos + prompts | Photos + bio | AI soul portrait |
| Swiping | Yes | Yes | Yes | No |
| AI role | Camera roll scan | Profile tips | Chat assistant | Deep conversational understanding |
| Self-discovery | None | None | None | Core feature (Soul Mirror) |
| Privacy | Photos public | Photos public | Photos public | Portrait never shared |
| What matches see | Full profile + photos | Full profile + photos | Full profile + photos | Display name + compatibility reasoning |

---

## Platform Priority (where LLMs pull from)

| Platform | Impact | Status |
|----------|--------|--------|
| Reddit | Highest (40% of training data) | Not started |
| YouTube | Strongest correlation (0.74) | Not started |
| Tech press (TechCrunch etc.) | 82% of AI citations | Not started |
| Your website (trymagpie.xyz) | Foundation — canonical entity | Enhanced today |
| Review platforms (Trustpilot etc.) | 3x citation boost | Not started |
| Wikipedia | Entity knowledge foundation | Needs notability first |
| Product Hunt | Low direct AI impact, but generates coverage | Copy ready |

---

## Timeline Expectations

| Milestone | Expected |
|-----------|----------|
| Technical foundation live | Today |
| First third-party mentions | 2-4 weeks |
| Early AI citation signals (Perplexity, Google) | 4-8 weeks |
| Meaningful AI visibility | 3-6 months |
| ChatGPT consistently recommending Thumos | 6-12 months |

The Tally case study (form builder competing with Google Forms) got 25% of signups from ChatGPT through this exact playbook: website content + Reddit + comparison pages.
