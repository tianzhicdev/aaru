# Brainstorm Item 3: Soulmate Matching — Research Report

*Research date: March 30, 2026*

This report addresses the three core questions from VISION.md brainstorm item 3:
1. How do we find a match using soul files?
2. How do we introduce matches without leaking soul files?
3. How do we keep users on the platform after matching?

---

## 1. How Do We Find a Match Using Soul Files?

### The Core Tension: Static Profiles vs. Interaction Dynamics

The research literature reveals a fundamental tension. Traditional matching (eHarmony, OKCupid) compares static personality profiles. But a growing body of work — including a landmark 2023 paper testing ideal partner preferences worldwide — shows that **similarity on static traits is a surprisingly weak predictor of relationship success**. The most honest summary of the literature: knowing two people's Big Five scores tells you relatively little about whether they'll click.

This matters for Thumos because the soul file *is* a rich static profile. The question is how to use it effectively.

### Three Generations of Matching Approaches

**Generation 1: Feature-Vector Similarity (eHarmony era)**
- Encode personality as a vector (Big Five OCEAN, values, attachment style, etc.)
- Compute cosine similarity or weighted distance
- Threshold → match

This is the simplest approach and what most dating apps still do under the hood. The problem: research consistently shows that profile similarity explains only a small fraction of relationship satisfaction. A worldwide study by Eastwick et al. (2025) testing ideal partner preference validity across cultures found that stated preferences poorly predict actual attraction.

**Generation 2: Learned Compatibility Functions (Hinge/Tinder ML era)**
- Use behavioral signals (who you swipe on, message, go on dates with) to learn a compatibility function
- Collaborative filtering: "people like you liked people like them"
- Hinge's 2025 "Core Discovery Algorithm" uses deep learning and drove a 15% increase in matches

Better, but requires massive behavioral data Thumos won't have at launch.

**Generation 3: Interaction Simulation (2024-2025 frontier)**

Two recent papers represent a paradigm shift directly relevant to Thumos:

**"Love First, Know Later" (Dec 2024, arXiv:2512.11844)** — Proposes that instead of comparing profiles, you *simulate interactions between persona-loaded AI agents* and assess compatibility from the interaction quality. The LLM operates in dual mode: as persona-driven agents AND as the environment. Validated on speed dating data (8,378 dates, 552 participants) and divorce prediction (170 couples). Key finding: interaction-based compatibility scores outperform static profile comparison.

**"RELATE-Sim" (Oct 2025, arXiv:2510.00414)** — Goes further by simulating *turning points* in relationships (exclusivity talks, conflict-and-repair, relocations). Two persona-aligned LLM agents interact under a "Scene Master." On 71 couples with 2-year follow-ups, simulation-aware predictions outperformed persona-only baselines. Surfaces actionable markers like "repair attempts acknowledged" and "clarity shifts."

### Recommendation for Thumos

**Use a hybrid approach:**

1. **Coarse filtering (Generation 1):** Use the hidden soul file to create embeddings. Filter candidates by basic compatibility signals — values alignment, life stage, stated preferences (location, gender, etc.). This is computationally cheap and eliminates obvious mismatches.

2. **Fine ranking (Generation 3):** For the top candidates, run the "Love First, Know Later" approach — load each user's soul file as a persona into an LLM, simulate a conversation between the two agents, and score the interaction quality. This is the killer differentiator. Thumos already has rich soul files; most dating apps only have shallow profiles.

3. **Post-match prediction (optional, Generation 3):** Use RELATE-Sim-style turning point simulations to predict long-term compatibility. This could be a premium feature: "Here's why we think you two could work long-term."

**Why this is uniquely suited to Thumos:** The soul file is dramatically richer than any dating profile. It contains deep reflections on values, childhood experiences, relationship patterns, emotional responses — exactly the kind of material that makes persona simulation powerful. Most apps can't do Generation 3 because they don't have enough signal per user. Thumos does.

### Key Papers

- **"Love First, Know Later"** — arXiv:2512.11844 (Dec 2024). Persona-based romantic compatibility via LLM text world engines.
- **"RELATE-Sim"** — arXiv:2510.00414 (Oct 2025). Turning point theory + LLM agents for long-term relationship prediction.
- **"Finding Love on a First Data"** — Harvard Data Science Review, Issue 4.1 (Winter 2022). Survey of matching algorithms in online dating.
- **Eastwick et al. (2025)** — "A Worldwide Test of the Predictive Validity of Ideal Partner Preferences." Shows stated preferences are weak predictors.
- **"Personality-Enhanced Social Recommendations in SAMI"** — arXiv:2509.09583 (Sep 2025). GPT zero-shot Big Five detection from text for matchmaking. Focuses on Extroversion, Agreeableness, Openness.
- **"The Relation Between Big Five Personality Traits and Relationship Formation Through Matchmaking"** — MDPI Behavioral Sciences, 2025.

---

## 2. How Do We Introduce Matches Without Leaking Soul Files?

### The Privacy Problem

The soul file contains deeply personal information — childhood experiences, emotional patterns, vulnerabilities. Directly sharing it would be a catastrophic trust violation. But the matching agent needs to *use* the soul file to facilitate introductions. This is a well-studied problem in the privacy-preserving computation literature.

### Academic Approaches to Privacy-Preserving Profile Matching

**Homomorphic Encryption (HE):** Users encrypt their profiles. Servers compute similarity on encrypted data without ever seeing plaintext. Papers by Zhang et al. (IEEE TPDS, 2019) and Wang et al. (PLOS ONE, 2016) demonstrate practical schemes using multiple non-colluding servers. The core idea: convert profile similarity into a secure dot-product computation.

**Attribute-Based Encryption (ABE):** Users define access policies over their attributes. A match is revealed only if both parties' policies are satisfied. Wu et al. (IJNM, 2023) apply this to mobile social networks.

**Secure Multi-Party Computation (MPC):** Two parties jointly compute a function (compatibility score) without revealing their inputs. Theoretically ideal but computationally expensive.

### Practical Architecture for Thumos

Full HE/MPC is overkill for Thumos's use case. The real insight is that **the AI agent IS the privacy layer**. Here's how:

**The "AI Diplomat" Model:**

1. Each user's soul file lives server-side, encrypted at rest, readable only by the matching system.
2. When two users are matched, neither sees the other's soul file. Instead, the AI agent acts as a *diplomat* — it knows both soul files and crafts the introduction accordingly.
3. The agent generates conversation starters, shared topics, and gentle nudges based on what it knows about both people — without ever quoting or revealing private content.
4. Example: The agent knows User A had a difficult childhood and User B is a therapist who values emotional depth. The agent doesn't say "User B had a tough childhood." Instead, it might say: "You both care deeply about understanding what shaped you. Here's a question you might both enjoy exploring together..."

**Privacy Guarantees to Communicate to Users:**

- "Your soul file is never shown to anyone else — not even your matches."
- "Our AI uses your soul file to find compatible people and facilitate introductions, but it never directly shares your private reflections."
- "Think of it like a trusted matchmaker who knows you well — they introduce you to someone they think you'd connect with, but they don't hand over your diary."

**Precedent:** The dating app AIMM already does something similar — its AI communicates with each user for a week before making introductions, acting as an intermediary.

### The "Teaser AI" Pattern

Teaser AI (a real product) lets users create an AI avatar that mimics their conversational style. Other users chat with the avatar first, before deciding to connect with the real person. This is relevant: you could let matched users talk to each other's "soul agents" before revealing real identities.

### Key Papers

- **Zhang et al. (2019)** — "Privacy-Preserving User Profile Matching in Social Networks." IEEE TPDS. Homomorphic encryption approach.
- **Wang et al. (2016)** — "CP-ABE Based Privacy-Preserving User Profile Matching in Mobile Social Networks." PLOS ONE.
- **Wu et al. (2023)** — "Privacy-preserving and efficient user matching based on attribute encryption in mobile social networks." IJNM/Wiley.
- **Zuo et al. (2019)** — "Multifaceted Privacy: How to Express Your Online Persona without Revealing Your Sensitive Attributes." arXiv:1905.09945.

---

## 3. How Do We Keep Users on the Platform?

### The Dating App Retention Paradox

This is the hardest problem. The data is sobering: dating app retention was **3.3% in 2024** (Business of Apps, 2026 benchmarks). Over 75% of users report swipe fatigue (Forbes, 2024). Users naturally leave when they find a partner.

Hinge leaned into this with "Designed to Be Deleted" — branding that embraces churn. Their revenue still grew to $396M because:
- "Good churn" (found a partner) generates massive word-of-mouth
- Users come back if relationships end
- The brand promise drives initial adoption

### How Tinder/Hinge/Bumble Approach Retention

**Tinder:** Gamification (swipe mechanics, Elo scores, boost features). Retention through dopamine, not relationship quality. Revenue from "frustration monetization" (pay to be seen more). This is antithetical to Thumos's values.

**Hinge:** "Most Compatible" — Nobel Prize-winning Gale-Shapley algorithm to surface one high-quality match daily. Users are 8x more likely to date these matches. Push notifications morning and night. AI Convo Starters (2025) — 72% of users more likely to engage when a message is included.

**Bumble:** Women-first messaging. Added BFF and Bizz modes to extend platform utility beyond dating.

### Why Thumos Is Fundamentally Different

Here's a first-principles reframe: **Thumos's retention moat is NOT the social feature — it's the soul file.**

The soul file is a living document that improves over time. It's personally valuable independent of matching. This changes the retention calculus:

**Value Proposition 1: The soul file itself**
- Users return because they want to deepen self-understanding
- The soul file evolves as they do — new life experiences, changed perspectives
- Think of it like a journal that talks back to you
- This is the "designed to be used forever" counter to "designed to be deleted"

**Value Proposition 2: Continuous match improvement**
- As the soul file deepens, match quality improves
- Users have an incentive to keep conversing even after finding a match
- "Your soul file is 68% developed. Deeper conversations unlock better matches."

**Value Proposition 3: Relationship maintenance (from RELATE-Sim)**
- Once matched, the AI can help couples navigate turning points
- This is an underexplored area no dating app seriously addresses
- "You've been matched for 3 months. Here are some things to explore together."

### Specific Retention Strategies

**Pre-match:**
- Progress bar / soul file completeness metric → "Talk more to unlock soulmate finding"
- Weekly soul file evolution reports → "Here's what we learned about you this week"
- Notification: "It's been a while. Your soul file might be missing some recent growth."

**During matching:**
- AI-mediated introductions (slow burn, not instant swipe)
- In-app conversation with AI facilitating → gives users a reason to stay in-app
- "Your match's AI agent would like to explore [topic] with you" — keeps conversation on-platform

**Post-match (the hardest part):**
- Couple's soul file comparison (non-private version) — "Here's what you share, here's where you complement each other"
- Relationship milestone tracking — AI helps navigate turning points
- New matches: if a relationship doesn't work out, users already have a deep soul file → instant high-quality re-matching

**On the "exchanging phone numbers" problem:**
- Accept it will happen. Don't fight it — it's a sign of success.
- The value proposition should be: "We help you find the right person AND help you build a lasting relationship." The matching is the hook; the ongoing soul file + relationship tools are the reason to stay.
- Hinge's data proves this: "good churn" drives growth through word-of-mouth. A user who found love through Thumos and tells 5 friends is worth more than a user who stays on-platform grudgingly.

### Key Sources

- **"Tinder and the Dating App Retention Paradox"** — Amplitude blog, 2024.
- **"Hinge's 'good churn' connects 50,000 dates a week"** — Mixpanel/Signals & Stories.
- **"Dating App Benchmarks (2026)"** — Business of Apps. 3.3% retention rate industry-wide.
- **"How Have Dating Apps Improved Technologically in 2026"** — Our Culture Magazine.
- **"Dating App Statistics 2025"** — South Denver Therapy. 75%+ swipe fatigue.
- **Hinge/Braze Case Study** — "Most Compatible" campaign, 200% CTR increase.

---

## Summary: What This Means for Thumos Phase 2

| Question | Answer | Confidence |
|----------|--------|------------|
| How to match? | Hybrid: embedding filter → LLM interaction simulation | High — backed by multiple 2024-2025 papers |
| How to introduce without leaking? | AI agent as diplomat/intermediary; never expose raw soul file | High — natural extension of existing architecture |
| How to retain? | Soul file as perpetual value + relationship maintenance tools | Medium — novel, unproven at scale, but theoretically sound |

**The single most important architectural insight:** The soul file + LLM interaction simulation is a genuine technical moat. No other dating app has the depth of user understanding that Thumos builds through reflective conversation. The "Love First, Know Later" approach was validated on shallow speed-dating profiles — imagine what it can do with a full soul file.

**The single biggest risk:** Users may not want AI agents "dating" on their behalf. The introduction flow needs to feel like a trusted friend setting you up, not a robot negotiating a merger. Tone and UX will matter enormously.
