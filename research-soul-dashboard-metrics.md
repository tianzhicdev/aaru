# Research: Soul Dashboard Metrics — What to Show Users and How

## The Core Question

Should Thumos show personality/values "judgements" to users? If so, which frameworks? As words or metrics? What does the evidence say?

---

## TL;DR Recommendation

**Yes, show them — but be deliberate about what and how.**

The evidence strongly supports showing users structured personality and values feedback. It drives engagement (Spotify Wrapped is the proof-of-concept), satisfies a deep psychological need for self-insight, and is the single best lever to make the soul file feel *valuable* rather than just *interesting*. But the implementation matters enormously. The wrong framework (MBTI) or the wrong display (raw scores without narrative) will feel cheap. The right approach combines scientifically valid dimensional metrics with warm, narrative interpretation.

**Recommended dashboard layers, in order of priority:**

1. **Big Five personality profile** — radar/spider chart + short narrative per trait
2. **Schwartz values circumplex** — circular chart showing value priorities
3. **Attachment style** — 2D plot (anxiety × avoidance) with quadrant label
4. **Moral foundations profile** — bar chart across 5-6 foundations
5. **Philosophical orientation** — narrative labels (not scores) for existential stance

---

## 1. Which Personality Framework? Big Five Wins, Decisively

### The Evidence Against MBTI
MBTI is the most recognized personality system (~2M tests/year), but it has serious scientific problems:

- **Poor test-retest reliability**: Up to 50% of people get a different type on retest (Pittenger, 2005)
- **False dichotomies**: Introversion-Extraversion is a spectrum, not a binary. MBTI forces a cut at the median, so someone at the 49th percentile is "opposite" to someone at the 51st
- **Weak predictive validity**: A 2024 ClearerThinking.org study directly compared MBTI vs Big Five on 37 life outcomes — Big Five was ~2× more accurate across the board

However: MBTI's *cultural penetration* is real. People know what "INTJ" means. This matters for virality.

### The Case for Big Five (OCEAN)
The Big Five (Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism) is the standard model in personality psychology. Key advantages:

- **Dimensional, not categorical** — captures nuance on a continuum
- **Strong cross-cultural validity** — replicated in 50+ countries (McCrae & Costa, 1997)
- **Predictive power** — predicts job performance, relationship satisfaction, health outcomes, mortality
- **LLM-inferable from conversation** — Recent research (2024-2026) shows LLMs can infer Big Five traits from conversational text with moderate convergent validity (r = 0.38–0.58 against standard questionnaires). This is directly relevant to Thumos's conversational inference approach

**Key papers:**
- McCrae, R. R., & Costa, P. T. (1997). Personality trait structure as a human universal. *American Psychologist*, 52(5), 509–516.
- Pellert et al. (2024). Large language models can infer psychological dispositions of social media users. *PNAS Nexus*. [PMC11211928](https://pmc.ncbi.nlm.nih.gov/articles/PMC11211928/)
- Conversational Big Five validation study (2026) finding r = 0.38–0.58 convergent validity from guided LLM conversations vs IPIP-50.

### Practical Recommendation for Thumos
Use Big Five as the primary personality layer. You can *optionally* map Big Five scores to an approximate MBTI-like label for cultural recognition (this mapping is well-established — e.g., high Openness + low Agreeableness ≈ "NT" types), but always show the dimensional profile as primary. This gives you scientific validity AND cultural recognizability.

---

## 2. Values Frameworks: Schwartz Is the Gold Standard

### Schwartz Theory of Basic Values
Shalom Schwartz's values theory identifies 10 (refined to 19) universal values organized in a circular motivational structure. Validated across 82 countries.

The 10 basic values: Self-Direction, Stimulation, Hedonism, Achievement, Power, Security, Conformity, Tradition, Benevolence, Universalism.

These cluster into 4 higher-order dimensions:
- **Openness to Change** (Self-Direction, Stimulation) vs. **Conservation** (Security, Conformity, Tradition)
- **Self-Enhancement** (Achievement, Power) vs. **Self-Transcendence** (Benevolence, Universalism)

Why this matters for Thumos: Values are *more stable* than personality traits and *more predictive of compatibility* in relationships. Two people with aligned values but different personalities can thrive together; misaligned values with similar personalities often fail.

**Key papers:**
- Schwartz, S. H. (2012). An overview of the Schwartz theory of basic values. *Online Readings in Psychology and Culture*, 2(1). [GVSU ScholarWorks](https://scholarworks.gvsu.edu/orpc/vol2/iss1/11/)
- Schwartz, S. H. (2012). Refining the theory of basic individual values. *Journal of Personality and Social Psychology*, 103(4), 663–688. [PDF](https://scottbarrykaufman.com/wp-content/uploads/2017/09/Schwartz-2012-19-values-JPSP.pdf)
- Validation of 17-item inventory for four higher-order values (2024). *Journal of Personality Assessment*. [Taylor & Francis](https://www.tandfonline.com/doi/full/10.1080/00223891.2024.2311193)

### Assessment Method
The Portrait Values Questionnaire (PVQ) works by comparing the person to short descriptions rather than asking them to rate abstract concepts. This is closer to what Thumos already does — it can infer values from conversational content rather than asking questionnaire-style questions.

---

## 3. Attachment Style: Critical for the Matching Use Case

Bartholomew & Horowitz (1991) proposed a 4-category model of adult attachment based on two dimensions:
- **Anxiety** (model of self): Do I worry about being abandoned/unworthy?
- **Avoidance** (model of others): Do I trust others to be responsive?

The four styles:
| | Low Avoidance | High Avoidance |
|---|---|---|
| **Low Anxiety** | Secure | Dismissive |
| **High Anxiety** | Preoccupied | Fearful |

This is perhaps the single most useful metric for Thumos Phase 2 (matching). Research consistently shows that attachment style is one of the strongest predictors of relationship dynamics and satisfaction.

**Key paper:**
- Bartholomew, K., & Horowitz, L. M. (1991). Attachment styles among young adults: A test of a four-category model. *Journal of Personality and Social Psychology*, 61(2), 226–244.

### Display Recommendation
Show this as a 2D plot with the user's position marked, plus a label. This is one case where the visual (a position on a grid) communicates far better than a number.

---

## 4. Moral Foundations: Reveals What People Care About

Jonathan Haidt's Moral Foundations Theory identifies 5-6 innate moral intuitions:
- **Care/Harm**
- **Fairness/Cheating** (split into Equality + Proportionality in 2023 revision)
- **Loyalty/Betrayal**
- **Authority/Subversion**
- **Sanctity/Degradation**

This is useful for Thumos because it surfaces *what someone finds morally important* — which is often invisible in regular conversation but hugely important for deep compatibility.

A 2019 paper from Aston University showed that personality traits (Big Five) influence moral foundations *through* values (Schwartz), establishing a clear causal chain: Personality → Values → Moral Intuitions.

**Key papers:**
- Graham, J., et al. (2011). Mapping the moral domain. *Journal of Personality and Social Psychology*, 101(2), 366–385. [PMC3116962](https://pmc.ncbi.nlm.nih.gov/articles/PMC3116962/)
- Graham, J., Haidt, J., & Nosek, B. A. (2009). Liberals and conservatives rely on different sets of moral foundations. *Journal of Personality and Social Psychology*, 96(5), 1029–1046.
- Personality → Values → Moral Foundations pathway (2019). [Aston University](https://publications.aston.ac.uk/id/eprint/39046/1/APIR_Final_28_March_2019.pdf)

---

## 5. Philosophical Orientation: Handle With Care

Your brainstorm mentions "nihilism, existentialism" — there is actually a validated psychometric for this now.

The **Existential Nihilism Scale (ENS)** was developed and validated in 2023 (Forsythe & Mongrain, York University). It's an 8-item scale with strong psychometric properties tested across undergraduate (N=329) and community (N=307) samples. There's also a newer **Optimistic Nihilism Scale (ONS)** from 2024.

However, I'd recommend *not* showing these as scores. Unlike the Big Five or Schwartz values, philosophical orientation is:
- Highly context-dependent
- Loaded with cultural connotations (telling someone they score high on "nihilism" feels like a judgment)
- Better expressed as narrative ("You tend to construct your own meaning rather than seeking inherent purpose")

**Key paper:**
- Forsythe, J. E., & Mongrain, M. (2023). The Existential Nihilism Scale (ENS): Theory, development, and psychometric evaluation. *Journal of Psychopathology and Behavioral Assessment*. [Springer](https://link.springer.com/article/10.1007/s10862-023-10052-w)

---

## 6. Words vs. Metrics: The Evidence Says Both

### The Barnum Effect Warning
The Barnum/Forer effect (1948) shows people readily accept vague personality descriptions as accurate — the mean accuracy rating was 4.3/5 for completely generic horoscope-style feedback. This means:

- **Pure narrative** without specific metrics risks feeling like astrology — warm but empty
- **Pure metrics** without narrative feels clinical and impersonal
- **The combination** — specific dimensional scores PLUS warm narrative interpretation — is what makes feedback feel both *accurate* and *meaningful*

### Insight vs. Self-Reflection (Key Distinction)
A study by Grant, Franklin, & Langford (2002) found that **insight** (understanding of self) was positively associated with life satisfaction and happiness, but **self-reflection** (tendency to examine self) was *not* — and was actually associated with higher anxiety. The implication: Thumos should deliver *insight* (clear, structured understanding) rather than just prompting more reflection.

**Key paper:**
- Grant, A. M., Franklin, J., & Langford, P. (2002). The Self-Reflection and Insight Scale. *Social Behavior and Personality*, 30(8), 821–835. [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0191886908003383)

### The Self-Insight Motive
Recent research (Heine & Schmukle, 2025) identified a "self-insight motive" — the dispositional tendency to seek accurate self-knowledge. People with a strong self-insight motive tend to be more curious, open to experience, and growth-oriented. These are likely Thumos's core users. Giving them structured metrics *feeds* this motive.

**Key paper:**
- Heine, C., Schmukle, S. C., & Dufner, M. (2025). The quest for genuine self-knowledge: An investigation into individual differences in the self-insight motive. *European Journal of Personality*. [SAGE](https://journals.sagepub.com/doi/10.1177/08902070241272184)

### The Spotify Wrapped Model
Spotify Wrapped is the best real-world proof that personality-style feedback drives massive engagement. Key psychological mechanisms (per behavioral science analyses):

- **Identity reinforcement**: Seeing your listening data reflected back validates self-concept
- **Concrete specificity**: Not "you like music" but "you were in the top 1% of listeners of X"
- **Shareability**: Structured formats (cards, charts) are inherently more shareable than paragraphs
- **Gamification**: Rankings, percentiles, and comparisons activate reward circuits

The lesson for Thumos: structured metrics are inherently more shareable and engaging than pure narrative. A spider chart with 5 Big Five dimensions is a "Wrapped card" for personality.

**Sources:**
- [The Decision Lab — Behavioral Science Behind Spotify Wrapped](https://thedecisionlab.com/insights/consumer-insights/the-behavioral-science-behind-spotify-wrappeds-viral-success)
- [Irrational Labs — Spotify Wrapped Behavioral Science](https://irrationallabs.com/blog/spotify-wrapped-behavioral-science/)

---

## 7. Can LLMs Actually Infer These Traits From Conversation?

This is the technical feasibility question. The answer is: **yes, with caveats**.

| Framework | LLM Inference Feasibility | Evidence |
|---|---|---|
| Big Five | **Moderate-Good** (r = 0.38–0.58) | Pellert et al. 2024; conversational validation 2026 |
| Schwartz Values | **Good** (values are expressed through language choices) | Inferred from social media text in multiple studies |
| Attachment Style | **Moderate** (requires relationship-focused conversation) | Therapist-coding from transcripts is well-established |
| Moral Foundations | **Good** (moral language is highly detectable) | MFT has strong NLP/computational social science literature |
| Philosophical Orientation | **Moderate** (existential themes emerge naturally in deep conversation) | Less studied computationally |

The key advantage Thumos has: the conversation is specifically *designed* to elicit reflective, personal content — far richer signal than social media posts or general chat. The 7-domain structure already steers toward personality-relevant topics.

---

## 8. Proposed Dashboard Architecture

### Layer 1: Personality Profile (Big Five)
- **Visual**: Spider/radar chart (you already have this — expand it)
- **Display**: 5 dimensions, each on a 0-100 scale
- **Labels**: Use warm labels, not raw trait names. E.g., "Curiosity & Imagination" not "Openness to Experience"; "Emotional Sensitivity" not "Neuroticism"
- **Narrative**: 1-2 sentence interpretation per trait, drawn from conversation evidence
- **Optional**: Show approximate MBTI-equivalent as a secondary badge (e.g., "Your pattern resembles INFJ tendencies")

### Layer 2: Core Values (Schwartz)
- **Visual**: Circular/wheel chart showing relative priority of 10 value domains
- **Display**: Top 3 values highlighted, bottom 3 de-emphasized
- **Narrative**: "You prioritize Self-Direction and Universalism, suggesting you value both personal freedom and concern for all people"

### Layer 3: Attachment Pattern
- **Visual**: 2D scatter plot (Anxiety × Avoidance) with user's position marked
- **Display**: Quadrant label (Secure / Preoccupied / Dismissive / Fearful) + confidence
- **Narrative**: Warm, non-pathologizing description of relational style
- **Note**: This is probably the most sensitive metric. Frame as "relational style" not "attachment issues"

### Layer 4: Moral Foundations
- **Visual**: Horizontal bar chart, 5-6 bars
- **Display**: Relative emphasis across foundations
- **Narrative**: "You're strongly driven by Care and Fairness, with less emphasis on Authority — suggesting you evaluate situations primarily through the lens of individual wellbeing"

### Layer 5: Philosophical Stance (Words Only)
- **Visual**: None (or subtle iconography)
- **Display**: 2-3 descriptive labels from a curated set (e.g., "Meaning-Maker", "Pragmatic Optimist", "Existential Explorer")
- **Narrative**: Short paragraph interpreting their philosophical orientation as expressed in conversation

### Design Principles
1. **Metrics + narrative together** — never raw scores alone
2. **Warm language** — "Your emotional landscape is rich and responsive" not "High Neuroticism"
3. **Evidence-grounded** — each metric links back to conversational moments ("Based on your reflection about X...")
4. **Progressive disclosure** — show the spider chart first, let users drill into each dimension
5. **Shareable cards** — each layer can be exported as a visual card (the Spotify Wrapped lesson)

---

## 9. What NOT to Do

- **Don't use MBTI as the primary framework** — use it only as an optional secondary label mapped from Big Five scores
- **Don't show raw scores without context** — a "73" on Openness means nothing without interpretation
- **Don't pathologize** — "Fearful Attachment" is accurate terminology but sounds clinical; use "You tend to want closeness but also feel cautious about vulnerability"
- **Don't over-specify early** — if you only have 2 conversations of data, don't claim high confidence. Show metrics as "emerging" with a confidence indicator
- **Don't make it feel like a test** — Thumos's advantage is that assessment emerges from natural conversation, not a questionnaire. Preserve that feeling.

---

## 10. Impact on Phase 2 (Matching)

The hidden soul file already exists for agent-facing use. These frameworks directly serve matching:

- **Big Five**: Complementarity research is mixed, but similarity on Agreeableness and Conscientiousness predicts satisfaction
- **Schwartz Values**: Value alignment is one of the strongest predictors of long-term relationship success
- **Attachment**: Secure + Secure pairings are most stable; Anxious + Avoidant pairings are most volatile
- **Moral Foundations**: Similar moral profiles predict fewer values-based conflicts

The dual soul file architecture (visible = warm + accurate, hidden = clinical + agent-facing) maps perfectly onto this: the hidden file stores raw dimensional scores for algorithmic matching, while the visible file presents the warm narrative version.

---

## Key References

1. McCrae, R. R., & Costa, P. T. (1997). Personality trait structure as a human universal. *American Psychologist*, 52(5), 509–516.
2. Schwartz, S. H. (2012). An overview of the Schwartz theory of basic values. *Online Readings in Psychology and Culture*, 2(1).
3. Bartholomew, K., & Horowitz, L. M. (1991). Attachment styles among young adults. *JPSP*, 61(2), 226–244.
4. Graham, J., et al. (2011). Mapping the moral domain. *JPSP*, 101(2), 366–385.
5. Forsythe, J. E., & Mongrain, M. (2023). The Existential Nihilism Scale. *J. Psychopathology and Behavioral Assessment*.
6. Pellert, M., et al. (2024). Large language models can infer psychological dispositions. *PNAS Nexus*. [PMC11211928](https://pmc.ncbi.nlm.nih.gov/articles/PMC11211928/)
7. Grant, A. M., et al. (2002). Insight vs self-reflection and well-being. *Social Behavior and Personality*.
8. Heine, C., et al. (2025). The self-insight motive. *European Journal of Personality*.
9. Forer, B. R. (1949). The fallacy of personal validation. *J. Abnormal and Social Psychology*, 44(1), 118–123.
10. ClearerThinking.org (2024). Big Five vs MBTI predictive accuracy comparison across 37 life outcomes.
11. LMLPA: Language Model Linguistic Personality Assessment (2025). *Computational Linguistics*, MIT Press.
12. Psychometric Evaluation of LLM Embeddings for Personality Prediction (2024). [PMC12262148](https://pmc.ncbi.nlm.nih.gov/articles/PMC12262148/)
