# Personality Research Synthesis — Actionable Findings for Thumos

**Date:** 2026-03-28 (updated 2026-04-12)
**Papers analyzed:** 6
**Focus:** What can we learn from recent personality-assessment research to improve Thumos's soul mirror conversations, extraction pipeline, and soul file quality?

---

## Papers Reviewed

| # | Paper | Core Question |
|---|-------|--------------|
| 1 | Peters et al. 2024 — "LLM Personality Inference from Free-Form Chat" | Can an LLM infer Big Five traits from casual conversation? |
| 2 | Zhang et al. 2025 — "Fewer Rounds May Be Better Than More" | Does longer conversation improve personality assessment? |
| 3 | Park et al. 2024 — "Generative Agent Simulations of 1,000 People" | Can a 2-hour interview create a faithful digital twin? |
| 4 | PSI 2025 — "Personality Simulation via Theory-Informed Structured Interview" | Can 32 targeted questions match a 2-hour interview? |
| 5 | Liu et al. 2025 — "Proactive Conversational Agents with Inner Thoughts" | How should an AI decide when to steer conversation? |
| 6 | Heine et al. 2024 — "The Quest for Genuine Self-Knowledge (Self-Insight Motive)" | What drives people to seek self-understanding? |

---

## Part 1: What the Research Says

### 1.1 Personality IS measurable from conversation (Peters 2024)

- **r = 0.443** correlation between GPT-4 inferred Big Five traits and self-reported BFI-2 scores, from just **15 turns** of conversation (~19 minutes).
- Chatbot prompting strategy matters **4x more** than how the user is instructed. An AI explicitly prompted to understand the user's personality achieved r=.443 vs r=.117 for a generic assistant — same user, same conversation length.
- **No UX penalty.** Users rated the personality-assessment conversation equally natural, pleasant, and engaging as a casual "getting to know you" chat. People don't mind being understood — they welcome it.
- Three independent scoring passes averaged together improved reliability. Multi-pass inference > single-pass.
- **Implication for Thumos:** Our entire approach is validated. An AI that explicitly tries to understand you produces better personality models without feeling intrusive.

### 1.2 First impressions carry the most signal (Zhang 2025)

This paper's headline finding is counterintuitive: **1-2 rounds of interaction (4-12 turns) produce more accurate personality assessments than 3-6 rounds.**

Why:
- **User engagement decays.** Average turns per round dropped from ~6.0 in round 1 to ~4.0 by round 2, then flatlined. Users say less with less effort as conversations go on.
- **Signal dilution.** As conversations expand to cover more topics, personality-relevant signals get buried in noise.
- **Trait contradiction.** Some traits (especially Conscientiousness) produce contradictory signals in extended conversations — initial structured behavior gives way to casual patterns.

**Critical exception — Openness:** This is the one dimension where longer interaction actually helps. Curiosity, creativity, and willingness to explore new directions become more apparent over multiple rounds.

**Agent personality is not neutral.** The personality of the AI significantly changes which user traits are elicited:
- A **neurotic agent** in round 1 dramatically improved Neuroticism assessment (the anxious agent evoked users' own emotional stability patterns).
- A **conscientious agent** in round 1 produced the best Agreeableness assessment.
- **Warm/open agents** improved Openness assessment over longer interactions.
- The agent is an active ingredient in what the user reveals, not a neutral observer.

**Neuroticism is the hardest to capture from text**, across all models and all interaction lengths. Text-based conversation fundamentally struggles with emotional stability assessment.

**Implication for Thumos:**
- Our first extraction (at exchange 8) is likely capturing peak-quality personality data. Later extractions in the same session may add noise.
- Multiple shorter sessions > fewer longer sessions. Each new session brings a fresh "round 1" with high engagement.
- The soul file's emotional-landscape sections should be treated as lower-confidence observations.

### 1.3 Breadth of coverage matters enormously (Park 2024)

Park et al. conducted 2-hour voice interviews with 1,000 people and built digital twins that replicated their survey responses with **85% normalized accuracy** and personality traits at **80% of human test-retest reliability**.

Key structural insights:

**The interview covered 14 distinct life domains** in sequence:
1. Life story (open-ended, ~10 min)
2. Crossroads / turning points (~5 min)
3. Family & relationships (~7 min)
4. Neighborhood & living situation (~5 min)
5. Daily routine & work (~8 min)
6. Law enforcement experiences (~3 min)
7. Political views (~10 min)
8. Race & social issues (~6 min)
9. Health (~11 min)
10. Emotional/mental wellbeing (~8 min)
11. Finances (~13 min)
12. Demographics (~4 min)
13. Upbringing (~4 min)
14. Values & future hopes (~4 min)

**Even 20% of the interview (24 minutes) outperformed structured surveys.** In ablation studies, removing 80% of the transcript still produced agents that outperformed composite agents built from hundreds of survey items. A focused 25-30 minute conversation is more predictive than any questionnaire.

**Content matters more than linguistic style.** When transcripts were converted to dry bullet-point summaries (stripping voice, tone, and all linguistic cues), agents still performed at 0.83 normalized accuracy (vs 0.85 for full transcript). What people say matters far more than how they say it.

**The 4-expert reflection module was critical.** Before answering questions about a person, the system pre-generated reflections from 4 expert perspectives:
- Psychologist — personality traits, emotional patterns, values
- Behavioral Economist — financial goals, decision-making, risk preferences
- Political Scientist — political identity, ideological positions
- Demographer — occupation, income, social status

This is architecturally identical to Thumos's 4-expert synthesis (psychologist, sociologist, linguist, narrative analyst).

**Implication for Thumos:**
- Our biggest gap is **breadth of topic coverage**. Thumos conversations currently go deep on whatever the user brings up. The research shows that systematically covering multiple life domains produces dramatically better personality models.
- Our 4-expert synthesis is validated by independent research. Consider whether our expert set is optimal (more on this below).
- Extraction should prioritize concrete facts, stated beliefs, and life circumstances over tonal observations.


dev note: 1. we should instruct AI to as all 14 apsets mentioned here; we need to discuss the best way to achieve this natually; 2. prioritize concrete facts, stated beliefs, and life circumstances;

### 1.4 Targeted questions achieve the same in 1/4 the time (PSI 2025)

PSI developed **32 theory-informed open-ended questions** that achieved comparable personality prediction accuracy to Park's 2-hour interview in just **34 minutes**.

The questions were designed using McAdams' Narrative Identity Theory and follow a chronological life-narrative arc:

**Phase 1 — Origins & Education (Q1-5):** Where are you from? What kind of student were you? Influential teachers?

**Phase 2 — Identity Formation (Q6-10):** Childhood heroes. What did you want to be? How have dreams changed?

**Phase 3 — Family (Q11-15):** Family personalities. How are you similar/different? Best/worst of childhood.

**Phase 4 — Work (Q16-21):** First job. What you do now and why. Best/worst of current work.

**Phase 5 — Relationships (Q22-25):** Adult friendships. Strongest/weakest qualities as a friend.

**Phase 6 — Self & World (Q26-32):** What are you most proud of? What frightens you? Tell me about a time you didn't know if you'd make it.

**The cardinal rule: Ask for stories, not self-assessments.**
- Bad: "Do you value artistic experiences?" → yields brief yes/no
- Good: "Describe a moment when you felt inspired by an artistic experience" → rich narrative revealing multiple personality facets

**Use "gear-shifting" transitions** between topics: "Shifting gears to your childhood..." This signals topic changes explicitly, making them feel intentional rather than jarring.

**No single question is sufficient; the ensemble matters.** Each question makes a small but meaningful contribution, with importance varying by personality domain. Personality is revealed through accumulated patterns across many responses.

**Implication for Thumos:**
- We should steer conversations to cover all 6 life domains over the course of multiple sessions, not let every session free-form on a single topic.
- Questions should be narrative-eliciting ("Tell me about a time...") rather than self-assessment ("Are you someone who...").
- 32 well-designed questions across 2-3 Thumos sessions could produce a soul file as good as a 2-hour interview.
- "Gear-shifting" transitions should be part of the AI's steering vocabulary.

### 1.5 How to steer without being annoying (Liu 2025)

This paper solves the hardest UX problem: how does the AI decide when to change the subject?

**Core insight: The AI should maintain a parallel stream of "inner thoughts"** — candidate things it could say or ask — running alongside the conversation. At each moment, it evaluates whether any thought has enough intrinsic motivation to warrant expression.

**8 heuristics for scoring a steering candidate** (ordered by importance):
1. **Relevance** — Does this topic connect naturally to what was just said?
2. **Information Gap** — Does it fill genuinely missing understanding?
3. **Balance** — Am I dominating, or should I steer more?
4. **Coherence** — Would this pivot feel like a natural extension or a jarring redirect?
5. **Dynamics** — Is the conversation stalling (pivot welcome) or flowing (pivot disruptive)?
6. **Expected Impact** — Would this deepen understanding meaningfully?
7. **Originality** — Has this ground already been covered?
8. **Urgency** — Is there something time-sensitive to address?

**The key mechanism: silence pressure.** If a topic hasn't been covered for many turns, its priority gradually increases (pressure = `1.02^turns_since_coverage`). This replaces a hard "steer every N turns" rule with a softer, accumulating pressure that only triggers when natural.

**Thought retention.** If a steering candidate scores too low to express, it stays in the reservoir. It can resurface later when the conversation shifts to make it naturally relevant. The AI "remembers" what it wanted to ask and waits for the right moment.

**Users strongly prefer moderate proactivity ("Active Contributor"):**
- Too passive: "Paradoxical — enthusiastic when addressed but otherwise disengaged." 7/12 rated worst.
- Too aggressive: Polarizing. Some found it overwhelming, others liked the energy.
- **Sweet spot:** Speaks when it has something meaningful to add. Lets the user lead most of the time. Steers only when coverage gap + natural bridge align. **6/12 preferred, clear winner.**

**Implication for Thumos:**
- Don't force topic transitions. Hold uncovered topics in a reservoir and wait for a natural bridge.
- Implement accumulating pressure per uncovered domain — the longer a domain goes uncovered, the lower the threshold for steering.
- Default to following the user's lead (System 1: "Tell me more about that"). Only use deliberate steering (System 2: topic pivot) when pressure exceeds threshold AND the conversation offers a natural connection.
- Before steering, generate both reasons FOR and reasons AGAINST the pivot. This adversarial evaluation prevents over-steering.

---

## Part 2: What This Means for Thumos

### 2.1 The Biggest Gap: Topic Coverage

Every paper converges on the same finding: **breadth of coverage matters more than depth on any single topic.** Park showed 14 domains. PSI showed 6 phases. Zhang showed signal dilutes with depth.

Thumos currently lets the user go wherever they want. This produces great depth but patchy coverage. A user might have 5 sessions about relationships and work, but zero exploration of their origins, values, fears, or daily life. The soul file ends up lopsided.

**Proposed: 7 Life Domains for Thumos**

Drawing from PSI's 6 phases and Park's 14 modules, adapted for Thumos's reflective (not survey-like) context:

| Domain | What It Covers | PSI Equivalent | Park Equivalent |
|--------|---------------|----------------|-----------------|
| **Origins** | Where you're from, childhood, formative experiences | Phase 1-2 | Modules 1-2, 13 |
| **Relationships** | Family, friendships, romantic partners, social world | Phase 3, 5 | Module 3 |
| **Work & Purpose** | Career, daily routine, what drives you | Phase 4 | Modules 5, 11 |
| **Values & Beliefs** | What matters most, worldview, spirituality | Phase 6 (partial) | Modules 7-8, 14 |
| **Emotional Life** | How you handle stress, fears, joy, vulnerability | Phase 6 (partial) | Module 10 |
| **Growth & Change** | Turning points, how you've evolved, resilience | Phase 2, 6 | Module 2 |
| **Aspirations** | Hopes, dreams, what you're building toward | Phase 6 (partial) | Module 14 |

The hidden soul file should track coverage scores per domain. The conversation agent should steer toward uncovered domains using the Inner Thoughts framework — accumulating pressure + natural bridging, never forced pivots.

### 2.2 Early Signal Weighting

Zhang's finding that first-round data is most diagnostic has a practical implication: **weight early-session exchanges higher during extraction.**

Current state: Haiku extracts reflection notes every 8 exchanges, treating all exchanges equally.

Proposed: Add a position signal to extraction. Exchanges 1-4 of a new session carry more personality-diagnostic weight than exchanges 10-15 of the same session. This doesn't mean ignoring later exchanges — it means the extraction prompt should note that early exchanges tend to reveal authentic patterns while later exchanges may show engagement decay.

### 2.3 Session Length Optimization

The research suggests our SESSION_MAX_EXCHANGES=15 may be slightly high. Zhang shows signal peaks at 4-12 turns. Park shows 25-30 minutes is sufficient. PSI achieves full coverage in 34 minutes (~32 questions).

A Thumos session of 12 exchanges (24 messages) is roughly 15-20 minutes of interaction. This captures peak signal without entering the diminishing-returns zone.

**Proposal:** Consider reducing SESSION_MAX_EXCHANGES from 15 to 12. Not critical, but the research suggests the last 3 exchanges add more noise than signal.

### 2.4 Question Design Principles

Across all 5 papers, a consistent pattern emerges for what makes a good personality-eliciting question:

1. **Story-eliciting, not self-assessing:** "Tell me about a time when..." >> "Are you someone who..."
2. **Concrete, not abstract:** "What was your first job like?" >> "How do you feel about work?"
3. **Open-ended, not binary:** "What's something you're proud of?" >> "Are you proud of your accomplishments?"
4. **Pivotal moments over general patterns:** "Can you describe an event that changed your trajectory?" >> "How has your life been going?"
5. **Multiple facets per question:** Good questions naturally reveal several personality dimensions at once

These principles should inform the system prompt in `soul.ts`.

### 2.5 Expert Synthesis Validation

Park (2024) independently arrived at a 4-expert reflection module (psychologist, behavioral economist, political scientist, demographer). Thumos uses psychologist, sociologist, linguist, narrative analyst. Both approaches validate multi-perspective synthesis.

**Possible refinement:** Our linguist expert focuses on how users communicate (voice patterns, register, density). Park found that content > style for prediction accuracy. Consider whether the linguist's focus should shift more toward extracting stated beliefs and values from language rather than analyzing communication style. Or add a 5th "values/beliefs" expert lens.

### 2.6 Neuroticism / Emotional Patterns Caveat

Zhang found Neuroticism is the hardest dimension to assess from text, across all models and all interaction lengths. This has direct implications for the soul file's emotional sections:

- The "whatYouCarry" and emotional aspects of the soul file should be treated as **lower-confidence observations** by the synthesis pipeline.
- Flag emotional-pattern insights as tentative across fewer sessions.
- Text inherently under-represents emotional stability; don't overindex on emotional content in the soul file until there are many sessions of data.

---

## Part 3: Spider Chart Framework

The user wants a visual personality spider chart on the soul file screen. The research informs what axes to use and how to score them.

### 3.1 Framework Design: "Soul Compass"

Rather than using raw Big Five labels (which feel clinical), translate them into soul-file-native language that maps to our 7 visible soul file sections. Each axis should be:
- Measurable from conversation (validated by research)
- Meaningful to the user (not jargon)
- Representable as a "shape" not a "score" (no axis is better than another)

| Axis | What It Captures | Maps to Big Five | Measurability from Chat | Soul File Section |
|------|-----------------|------------------|------------------------|-------------------|
| **Openness** | Curiosity, creativity, willingness to explore | Openness | Moderate (needs extended interaction per Zhang) | howYouThink |
| **Vitality** | Energy, enthusiasm, social engagement | Extraversion | High (visible early) | howYouMove |
| **Warmth** | Compassion, trust, care for others | Agreeableness | Moderate | howYouConnect |
| **Depth** | Introspection, intellectual engagement | Openness facet + custom | High (conversation inherently reveals) | howYouThink |
| **Purpose** | Direction, discipline, values-driven action | Conscientiousness | High (early signal) | whatLightsYouUp |
| **Resilience** | Emotional stability, adaptability, grit | Inverse Neuroticism | Low-moderate (hardest from text) | whatYouCarry |
| **Autonomy** | Independence, self-determination, agency | Custom (SDT-inspired) | Moderate | yourContradictions |
| **Connection** | Relationship investment, social depth | Custom (Agreeableness facet) | High | howYouConnect |

### 3.2 Scoring Approach

Scores should be derived during synthesis, not as a separate step:
- The 4-expert panel already analyzes personality from multiple angles
- Add a scoring step to synthesis: each expert rates each axis 0-100 based on accumulated evidence
- Final score = weighted average across experts (psychologist weighted higher for Resilience, sociologist for Connection, etc.)
- Store in hidden soul file as `compassScores: { openness: 72, vitality: 85, ... }`
- Expose via visible soul file or a new field in the API response

### 3.3 Confidence Gating

- Don't show axes until there's enough data to score them meaningfully
- Minimum: 2 sessions with coverage of the relevant domain
- Show axes as "emerging" (dashed line on spider) until 4+ sessions
- Resilience axis should require more sessions than others (per Zhang's finding about Neuroticism difficulty)

### 3.4 Architecture

**No separate API call needed.** The spider data is derived from synthesis data that already exists. Add `compass_scores` to the visible soul file response:

```
visible_soul_file: {
  ...existing fields...,
  compass_scores: {
    openness: 72,
    vitality: 85,
    warmth: 68,
    depth: 90,
    purpose: 75,
    resilience: null,  // not enough data yet
    autonomy: 63,
    connection: 78
  }
}
```

Null values = not enough evidence. The iOS spider chart renders only non-null axes.

---

## Part 4: Prioritized Implementation Roadmap

### Priority 1: Coverage-Aware Topic Steering
**Impact: High | Effort: Medium**
- Add domain coverage tracking to hidden soul file
- Modify system prompt in `soul.ts` to be aware of uncovered domains
- Implement soft steering with accumulating pressure (Inner Thoughts pattern)
- Use "gear-shifting" transitions for natural topic pivots

### Priority 2: Spider Chart (Soul Compass)
**Impact: High (user-facing, differentiating) | Effort: Medium**
- Add compass scoring to synthesis pipeline
- Add `compass_scores` to visible soul file schema
- iOS: Small spider chart on soul file screen, expandable on tap
- Confidence gating (null until enough data)

### Priority 3: Question Design Upgrade
**Impact: Medium | Effort: Low**
- Update system prompt to favor story-eliciting questions
- Add PSI-style pivotal-moment questions to the prompt repertoire
- "Tell me about a time..." > "How do you feel about..."

### Priority 4: Early Signal Weighting
**Impact: Medium | Effort: Low**
- Modify extraction prompt to note exchange position
- Weight first 4-8 exchanges of a session higher

### Priority 5: Session Length Tuning
**Impact: Low | Effort: Trivial**
- Consider reducing SESSION_MAX_EXCHANGES from 15 to 12
- Not urgent — current value is in the right ballpark

### Priority 6: Expert Panel Refinement
**Impact: Low-Medium | Effort: Low**
- Consider shifting linguist expert toward content extraction
- Consider adding values/beliefs expert perspective
- Low priority — current 4-expert panel is validated by Park 2024

---

## Appendix: Paper-by-Paper Detail

### Peters 2024 — Key Numbers
- 566 participants, 15 turns each, ~19 min median
- Assessment condition: r = .443 (mean across Big Five)
- Acquaintance condition: r = .218
- Assistant baseline: r = .117
- No significant UX difference across conditions
- 3 independent scoring passes averaged for reliability

### Zhang 2025 — Key Numbers
- 1,260 interaction rounds, 42 participants, 5 LLM agents
- 6 LLMs tested (GPT-4.1-Nano through Claude-4-Sonnet)
- Round 1: ~6 turns, highest signal
- Round 2+: ~4 turns, declining engagement
- Openness: only trait that benefits from longer interaction
- Neuroticism: highest MAE across all conditions

### Park 2024 — Key Numbers
- 1,052 participants, 2-hour voice interviews
- 81.71 follow-up questions on top of 99 scripted questions
- 6,491 words average transcript length
- Normalized personality correlation: 0.80 (vs human test-retest 0.95)
- GSS prediction: 85% normalized accuracy
- 20% of interview (24 min) still outperformed structured surveys
- Content-only (bullet points): 0.83 vs full transcript 0.85

### PSI 2025 — Key Numbers
- 32 open-ended questions, 34 minutes average
- Self-other correlation: r = 0.36 (matching meta-analytic benchmark)
- Inter-rater reliability ICC: 0.76
- Best model (GPT-4o): r = 0.64 Extraversion, 0.63 Neuroticism
- Weakest: r = 0.41 Agreeableness, 0.43 Openness
- 6 life domain phases, chronological narrative arc

### Liu 2025 — Key Numbers
- CHI '25, 24-participant formative study + 100 simulated + 12 live users
- 8 evaluation heuristics (Relevance most important at 77 mentions)
- Silence pressure: λ = 1.02 per timestep
- Active Contributor preferred by 6/12 (imThreshold = 3.59)
- Selective Participant worst: 7/12 rated it last
- 82% preferred Inner Thoughts over baseline in simulation

### Heine 2024 — Key Numbers
- Introduces Self-Insight Motive (SIM) scale — distinct from self-esteem, narcissism, or curiosity
- SIM driven by: curiosity about self, desire for self-improvement, openness to uncomfortable truths
- SIM is **situationally activated**: stronger after life instability (breakups, moves, career changes)
- SIM predicts feedback-seeking behavior — high-SIM people actively want to be assessed
- SIM is distinct from self-reflection (rumination); it's forward-looking and action-oriented
- Implication: dating app users in transition are primed for self-discovery framing

---

## Part 5: Opener Architecture — Applied Research (2026-04-12)

This section synthesizes all 6 papers into a specific prescription for Thumos's opening conversation design. It identifies what the current system gets wrong and what research says to do instead.

### 5.1 The Core Insight (Peters 2024)

The "assessment" condition — where the chatbot was explicitly prompted to elicit personality-relevant information — produced the **best personality inferences (mean r=.443) AND users rated the experience equally positively** as the naturalistic acquaintance condition. There was no tradeoff between assessment accuracy and user experience.

The "acquaintance" condition (naturalistic chat, no personality targeting) still worked (mean r=.218) but significantly worse. The "assistant" condition (ChatGPT-style helpful bot) was worst on both inference accuracy and user experience.

**First-principles answer: don't hide the assessment behind small talk. Embed it inside a conversational frame.**

### 5.2 Six Principles for Opener Design

**Principle 1: Start concrete and biographical, not abstract and introspective.**

The PSI opens with "Where are you from? Where did you grow up and what was the place like?" then moves to "What kind of student were you in school?" Park et al. follows the same pattern — life story first, then childhood, then work, then relationships, then values. McAdams' narrative identity theory shows that prompting for pivotal moments and meaningful relationships yields far richer personality data than asking about routine events. But you have to earn the right to ask about pivotal moments by starting with factual, low-threat recall questions.

**Principle 2: Question design matters more than opener framing.**

The PSI makes a critical distinction: simply rephrasing a personality scale item as a question ("Do you value artistic experiences?") yields a dead-end yes/no. But asking "Describe a moment when you felt inspired by an artistic or aesthetic experience" opens a narrative. For Thumos, this means conversation design is about behavioral prompts that invite storytelling, not clever icebreakers.

**Principle 3: Reciprocity is real but underexplored.**

Peters et al. reference Harmsen et al. (2023) on reciprocity in human-voicebot conversations — users self-disclose more when the system self-discloses first. Liu et al. confirms that conversations felt more natural when agents responded to what others said and then shared something about themselves, rather than just extracting. The AI should offer something before asking — a brief observation, a self-disclosure, a reaction — not just drill questions.

**Principle 4: The self-insight motive is a framing weapon (Heine 2024).**

People with a strong self-insight motive are driven by curiosity, self-improvement desire, and openness. The SIM gets stronger after life instability (breakups, moves, career changes) — exactly Thumos's target audience. The SIM drives feedback-seeking behavior. So the opener framing should activate this motive: position the conversation as an opportunity for genuine self-discovery, not as a personality test.

**Principle 5: Defensiveness comes from purpose mismatch, not hard questions.**

Park et al. opened with "Tell me the story of your life — start from the beginning" and it worked in 2-hour sessions with 1,000 people. The difference: the interviewer was described as "friendly and curious," used voice, had a visible progress bar, and participants knew the purpose. Defensiveness comes from a mismatch between the perceived purpose (I'm here to date) and the actual experience (I'm being psychoanalyzed). The fix isn't softer questions — it's better framing of why the questions matter.

**Principle 6: Don't pretend it's not assessment — transparency builds trust.**

Don't try to make it feel like a casual chat that happens to be assessment. The Peters data shows that explicit assessment framing doesn't hurt UX. The Park data shows that 1,000 people completed 2-hour AI interviews that opened with "Tell me the story of your life." What hurts is when the purpose feels hidden or the questions feel disconnected from what the user signed up for. Be direct about what you're doing and why.

### 5.3 Recommended Conversation Arc

**Layer 1: Framing (first message)**
Activate the self-insight motive and set expectations in one brief statement:
> "This isn't a quiz. Think of it more like a conversation that helps you see yourself clearly — then we use that to find someone who actually fits."

**Layer 2: Biographical (exchanges 1-3)**
Open with concrete, low-threat questions that already reveal personality:
- "Where did you grow up, and what was it like?" (PSI Q1 — tone of answer reveals nostalgia vs. criticism, detail vs. terseness)
- "What does your everyday life look like right now?"
- "What's the most spontaneous thing you've done recently?"

**Layer 3: Relational (exchanges 4-6)**
Transition to how they relate to others:
- "How would you describe the people in your family?" (PSI Q11)
- "What makes you a good friend?" (PSI Q24)

**Layer 4: Reciprocity checkpoints**
After every 2-3 user responses, the AI offers something back — a brief reflection, a pattern noticed, an honest observation. Not flattery. The Liu et al. paper shows that agents who "responded first and then shared something about themselves" were rated as more coherent and engaging.

**Layer 5: Introspective (exchanges 7+)**
Only after establishing conversational trust:
- Values, fears, dreams, turning points
- "What frightens you now?" (PSI Q28)
- "Tell me about a time you didn't know if you'd make it" (PSI Q32)

### 5.4 The Trap to Avoid

Don't try to make it feel like a casual chat that happens to be assessment. The Peters data shows that explicit assessment framing doesn't hurt UX. The Park data shows 1,000 people completed 2-hour AI interviews opening with "Tell me the story of your life." What hurts is when the purpose feels hidden or the questions feel disconnected from what the user signed up for.

### 5.5 Current System Gaps → Proposed Changes

| Gap | Current State | Research Says | Proposed Fix |
|-----|--------------|---------------|--------------|
| **First-ever intro** | "Tell me about yourself and what you're looking for" — vague, creates decision paralysis | Start with concrete biographical question (PSI Q1) | Rewrite intro to end with "where did you grow up, and what was it like?" |
| **Assessment transparency** | Hidden behind "warm friend" persona | Explicit framing doesn't hurt UX (Peters) | Add self-insight framing: "helps you see yourself clearly, then I find someone who fits" |
| **Reciprocity** | No mechanism — AI only asks questions | Users disclose more when AI gives first (Harmsen, Liu) | New principle: "Give something back every 2-3 exchanges" |
| **Question design** | Some pool questions are self-labels ("Are you more of a...") | Story prompts >> self-labels (PSI) | Rewrite 7 weak questions to behavioral/story format |
| **Default steering** | "are they seeing anyone" as early target | Start biographical, not relationship-status | Reorder steerToTopics: origin → present life → play |
| **Opening prompt** | "Think late-night gathering energy — light, fun" | Don't hide assessment; be transparent about purpose | Rewrite to acknowledge biographical-first arc + transparency |

### 5.6 Implementation Files

All changes are prompt-only — no schema, handler, or API contract changes:

- `src/domain/i18n/{en,de,es,fr,ja,ko,pt-BR,zh-CN}.ts` — Intro rewrite, 2 principle changes, opening prompt, 7 pool questions
- `src/domain/soul.ts` — Default steerToTopics + steeringReasoning
- `tests/integration/soulMirrorHandlers.test.ts` — Update intro assertion
