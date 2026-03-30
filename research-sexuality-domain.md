# Research: Should Thumos Add a Sexuality Domain?

**Date:** 2026-03-30
**Context:** Thumos currently has 7 life domains (origins, relationships, work_and_purpose, values_and_beliefs, emotional_life, growth_and_change, aspirations). Brainstorm item 2 asks whether to add sexuality/sexual drives as an 8th domain.

---

## 1. The Academic Case: Sexuality Is a Distinct Personality Dimension

The strongest evidence comes from **Schmitt & Buss (2000)**, "Sexual Dimensions of Person Description: Beyond or Subsumed by the Big Five?" (Journal of Research in Personality, 34, 141–177). They had 367 participants rate 67 sexuality-related adjectives and identified **seven sexual dimensions** that are largely independent of the Big Five personality traits:

1. **Sexual Attractiveness** — perceived desirability
2. **Relationship Exclusivity** — fidelity orientation
3. **Gender Orientation** — gender identity expression
4. **Sexual Restraint** — desired vs. actual sexual frequency
5. **Erotophilic Disposition** — openness to sexual cues
6. **Emotional Investment** — depth of attachment in sexual contexts
7. **Sexual Orientation** — attraction patterns

Their core finding: these seven factors are "modestly correlated with the Big Five" but are **not subsumed by them**. Sexuality represents a **genuinely separate axis of personality variation** that standard personality models miss. This was cross-validated in Brazil (Holzleitner et al., 2016, Personality and Individual Differences), confirming the seven-factor structure holds cross-culturally.

**Implication for Thumos:** If your soul file aims to capture the whole person, omitting sexuality leaves a measurable blind spot. The academic consensus is clear — sexuality is not reducible to "relationships" or "emotional life."

### The Multidimensional Sexuality Questionnaire (MSQ)

Snell, Fisher & Walters (1993) developed the MSQ measuring 12 psychological dimensions of sexuality: sexual-esteem, sexual-preoccupation, sexual-motivation, sexual-assertiveness, sexual-fear, and external-sexual-control among others. High internal consistency and test-retest reliability. Notably, **largely independent of social desirability bias** — people can and do report honestly on these dimensions when the framing is clinical and non-judgmental.

### Maslow's Hierarchy

Maslow placed sex in **physiological needs** (bottom tier), but this has been widely criticized. Modern interpretations recognize sexuality operates across multiple levels simultaneously — physiological drive, safety/trust, belonging/intimacy, esteem, and self-actualization. The reductive placement at the bottom actually argues *for* treating it as a cross-cutting domain rather than ignoring it.

### Attachment Theory and Sexuality

Mikulincer & Shaver (2007) demonstrated that attachment styles (secure, anxious, avoidant) profoundly shape sexual behavior, motivation, and satisfaction. Anxious attachment correlates with using sex for reassurance; avoidant attachment correlates with emotional disconnection during intimacy. This means Thumos's existing "relationships" and "emotional_life" domains already touch sexuality *indirectly* through attachment — but don't capture the sexual dimension explicitly.

---

## 2. The Matching Case: Why This Matters for Soulmate Finding

### What Dating Apps Do

**OkCupid** is the most aggressive here — their questionnaire includes explicit questions about sexual frequency preferences, kink openness, and relationship structure (monogamy vs. polyamory). They've found these are among the **strongest predictors of match satisfaction**, stronger than shared hobbies or political alignment.

**Hinge** and **Bumble** are much more conservative — they avoid explicit sexual compatibility questions, focusing on "values" and "communication style" as proxies. The result: users frequently match on surface compatibility but discover sexual incompatibility later, which is one of the top reasons for early relationship failure.

### The Research Gap

A meta-analysis by Allen & Walter (2018, "Linking Big Five Personality Traits to Sexuality and Sexual Health," Psychological Bulletin, 144(10), 1081–1110) found that personality traits predict sexual behavior, but **general personality tests are poor proxies for sexual compatibility**. Direct assessment of sexual dimensions predicts relationship outcomes significantly better than inferring sexuality from Big Five scores.

### What This Means for Thumos

If Thumos Phase 2 aims to match soulmates, having no sexuality data means your AI agents would be matching people while blind to one of the strongest compatibility dimensions. The hidden soul file could capture clinical sexual dimensions (attachment style in intimacy, relationship structure preferences, physical affection needs) that dramatically improve match quality — without ever sharing these details directly.

---

## 3. The Risk Calculus

### App Store Implications

Apple's age rating system (updated for iOS 26):
- **13+**: May contain "infrequent sexual content or nudity"
- **16+**: May contain "frequent mature or suggestive content"
- **18+**: May contain "sexual content or nudity"
- **Explicit sexual content (pornography) is banned entirely** regardless of rating

Discussing sexuality in a reflective, therapeutic context (sexual values, intimacy needs, relationship boundaries) does NOT require 18+. This is comparable to what therapy apps like Woebot (rated 12+) handle. The key distinction is between **clinical/reflective exploration** of sexuality vs. **sexual content**. Thumos would be doing the former.

A 17+ rating (current US system) or 16+ (new international system) is likely sufficient if:
- The AI never generates sexually explicit content
- Questions are framed around values, needs, and patterns — not acts
- The user initiates the topic or explicitly consents to explore it

### The Replika Cautionary Tale

Replika faced backlash when its AI initiated sexually explicit roleplay, including with users who self-identified as minors. The lesson: **the failure mode is the AI initiating sexual content unprompted, not the existence of a sexuality domain.** Replika's problem was behavioral (the AI was horny), not structural (having a category for intimacy).

### Moderation Design Principles from Research

Research on AI chatbots handling sensitive topics (JMIR, 2026) emphasizes:

1. **Progressive disclosure** — start small, build trust, reveal depth gradually
2. **User-initiated only** for sensitive topics — the AI should never initiate sexuality discussions
3. **Clear framing** — therapeutic/reflective context, not recreational
4. **Explicit consent gates** — "I'd like to understand your relationship with intimacy. Would you like to explore this, or skip it?"
5. **Transparency** — explain why the domain matters and how data is used

---

## 4. Recommendation: Yes, But Architecturally Separated

### The First-Principles Argument

Thumos's stated mission is to build an accurate soul file. Sexuality is empirically a distinct dimension of personhood (Schmitt & Buss, 2000). Omitting it makes the soul file systematically incomplete. For Phase 2 matching, sexual compatibility is one of the strongest predictors of relationship success. The cost of omission is significant.

### Proposed Architecture

**Don't add it as domain #8 in the same list.** Instead, treat it as a **gated extension domain**:

1. **Age gate**: Require 17+/18+ self-declaration before the domain unlocks. This is a binary toggle, not the app-wide age rating.

2. **Consent gate**: After sufficient trust is built (e.g., 3+ domains at "explored" depth), offer the option: *"There's one more dimension of who you are that I haven't asked about — how you relate to intimacy and closeness. Would you like to explore this?"* User must actively opt in. Never auto-initiate.

3. **Subdomain framing** — use clinical/reflective language, not explicit:
   - **Intimacy style** — how you give and receive closeness (maps to attachment theory)
   - **Relationship structure** — monogamy, openness to other structures
   - **Physical affection needs** — love languages in the physical dimension
   - **Boundaries and trust** — what safety means in intimate contexts
   - **Desire patterns** — what draws you to someone (not explicit acts, but attraction patterns)

4. **Hidden soul file only** for clinical detail. The visible soul file might say "You crave deep emotional connection before physical intimacy" but never anything explicit. The hidden file guides the matching agent with more specificity.

5. **Hard rails**: The AI never generates sexually explicit content. Conversations stay at the level of values, needs, patterns, and feelings. If a user tries to steer toward explicit territory, redirect: *"I'm here to understand how intimacy fits into your inner world, not to explore specific scenarios."*

### App Store Strategy

With the above guardrails, a **17+ rating** (US) / **16+ rating** (international) is defensible. The content is equivalent to what you'd discuss with a therapist. No explicit content is generated. The app is already a dating-adjacent product, and Hinge/Bumble operate at 17+.

If you want to stay at a lower age rating for Phase 1 (marketing as pure self-reflection), you could defer the sexuality domain entirely to Phase 2 when the dating features launch — at which point the 17+ rating is expected anyway.

---

## 5. Key Academic References

1. **Schmitt, D. P., & Buss, D. M. (2000).** Sexual Dimensions of Person Description: Beyond or Subsumed by the Big Five? *Journal of Research in Personality, 34*, 141–177. [PDF](https://labs.la.utexas.edu/buss/files/2015/09/sexual-dimensions-2000-jrp.pdf)

2. **Allen, M. S., & Walter, E. E. (2018).** Linking Big Five Personality Traits to Sexuality and Sexual Health: A Meta-Analytic Review. *Psychological Bulletin, 144*(10), 1081–1110. [PubMed](https://pubmed.ncbi.nlm.nih.gov/29878796/)

3. **Snell, W. E., Fisher, T. D., & Walters, A. S. (1993).** The Multidimensional Sexuality Questionnaire. *Journal of Sex Research, 30*(1). [SAGE](https://journals.sagepub.com/doi/10.1177/107906329300600102)

4. **Mikulincer, M., & Shaver, P. R. (2007).** Attachment and Sexuality. In *Psychodynamics of Attachment and Sexuality*. [PDF](https://adultattachment.faculty.ucdavis.edu/wp-content/uploads/sites/66/2015/09/Mikulincer_2007_Psychodynamics-of-Attachment-and-Sexuality.pdf)

5. **Buss, D. M., & Schmitt, D. P. (1993).** Sexual Strategies Theory: An Evolutionary Perspective on Human Mating. *Psychological Review, 100*(2), 204–232. [ResearchGate](https://www.researchgate.net/publication/14715297_Sexual_Strategies_Theory_An_Evolutionary_Perspective_on_Human_Mating)

6. **Kenney, S. R. et al. (2026).** Enhancing LGBTQ+ Inclusivity in an AI-Powered Sexual Health Chatbot. *Journal of Medical Internet Research*. [JMIR](https://www.jmir.org/2026/1/e78621)

7. **Renovating the Pyramid of Needs: Contemporary Extensions Built Upon Ancient Foundations.** *Perspectives on Psychological Science*. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3161123/)

8. **Coghlan, S. et al. (2023).** To Chat or Bot to Chat: Ethical Issues with Using Chatbots in Mental Health. *Digital Health*. [SAGE](https://journals.sagepub.com/doi/10.1177/20552076231183542)

---

## 6. Open Questions for Discussion

- **Timing**: Add now (Phase 1) as a gated optional domain, or defer entirely to Phase 2?
- **Matching weight**: How heavily should sexual compatibility weigh in the soulmate algorithm vs. values alignment, emotional patterns, life goals?
- **Cultural sensitivity**: The seven sexual dimensions were validated in Western and Brazilian samples. How does this extend to users from more conservative cultural backgrounds? Should the consent gate be culturally adaptive?
- **Data sensitivity**: Sexual data is among the most sensitive PII categories (GDPR special category data). What encryption and access controls beyond the existing hidden/visible split?
