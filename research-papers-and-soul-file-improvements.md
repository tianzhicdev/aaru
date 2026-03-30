# Research Report: Two Papers on Relationship Simulation + Implications for Thumos

*March 30, 2026 — Based on full reading of both papers and the Thumos codebase*

---

## Part 1: Paper Summaries and Key Takeaways

### Paper A: "Love First, Know Later" (arXiv:2512.11844, Dec 2024)

**Core thesis:** Compatibility is not a property of two profiles — it's an emergent property of two people *interacting*. Traditional matching compares static attributes; this paper simulates the interaction itself and assesses compatibility from the simulation.

**Architecture — the LLM Text World Engine:**
The LLM operates in dual mode: (1) as persona-driven agents following behavioral policies derived from user profiles, and (2) as the environment, generating topics, modeling emotional state transitions, and driving how the conversation evolves. Each pair gets a full interaction trajectory — states capturing the evolving context and actions representing agent responses.

**The "Love Observer" — how they score compatibility:**
After simulation, a specialized observer LLM extracts three ratings: each participant rates the interaction from their perspective (r1, r2), plus an external observer rating based on conversational flow, mutual engagement, and value alignment (r3). These combine via learned weights into a compatibility score. The observer is calibrated using 10 in-context learning examples of known match/non-match outcomes.

**Two simulation modes:**
- **Speed Dating Mode** — brief dialogues testing initial chemistry. Uses INNER_THOUGHT (private feelings) + RESPONSE (what you say) format. The private/public split is critical — it captures the gap between what people feel and what they show, which is where compatibility signals actually live.
- **Critical Events Mode** — simulates pivotal scenarios (career conflicts, trust breaches, caregiver burdens). Uses a "world engine" that narrates environmental changes without ever speaking for the agents. This tests fundamental compatibility through high-stakes moments.

**Key psychological insight — Sparse Rewards Hypothesis:**
Relationship outcomes are determined by responses to a small number of critical moments. Routine interactions contribute minimally. This aligns with Gottman's research on marriage — he can predict divorce from watching couples discuss a disagreement for 15 minutes. The critical moments are: conflict resolution, value-alignment discussions, first-date impressions. These rare but deterministic moments are where character is revealed.

**Key psychological insight — Deterministic Decisions Hypothesis:**
In critical moments, individuals exhibit consistent decision patterns. Your personality shows up reliably at turning points — you're not random. Trait activation theory and situational strength research back this up. This means a simulation of how someone behaves at a turning point is actually predictive.

**Results:**
- Speed dating: LLM methods modestly outperform logistic regression and cosine similarity baselines (F1 0.67 vs 0.66, AUC 0.60 vs 0.61). Not huge, but the method works without any fine-tuning.
- Divorce prediction: LLM Love Observer achieves F1 0.90, AUC 0.92 — comparable to logistic regression on 54-question surveys (F1 0.95, AUC 1.00). This is remarkable: persona simulation nearly matches direct survey data.

**What this reveals about human psychology:**
1. What people *say* they want in a partner poorly predicts who they actually choose. Behavior at moments of tension reveals more than stated preferences.
2. The gap between inner thought and outer response is where compatibility lives. Two people who both think kind things but say defensive things have a different compatibility profile than two people whose thoughts and words align.
3. Compatibility can be decomposed into: shared interests/values, communication quality, mutual attraction signals, and long-term potential. But these must be assessed through interaction, not self-report.
4. Users can iteratively refine their agents through feedback — their agent becomes a better model of them over time. This is essentially what Thumos's soul file does.

---

### Paper B: "RELATE-Sim" (arXiv:2510.00414, Oct 2025)

**Core thesis:** Most dating tech optimizes for getting together, not staying together. RELATE-Sim models how couples behave at consequential turning points — exclusivity talks, conflict-and-repair episodes, relocations — rather than static traits. It shifts focus from matchmaking to maintenance.

**What Turning Point Theory says about humans:**
Turning point theory (Baxter & Bullis, 1986; Baxter & Erbert, 1999) defines a turning point as "any event or occurrence associated with change in a relationship." These events recalibrate commitment norms — bringing partners closer or pushing them apart. The key insight: long-term stability is better explained by interactional processes — communication quality, responsiveness under stress, conflict repair, and perceived partner commitment — than by demographics or personality profiles.

**Six categories of turning points (the relationship lifecycle):**
1. **Initial Formation** — first disclosures, exclusivity talk, clarifying intentions
2. **Relationship Development** — negotiating routines and roles, aligning values, setting boundaries
3. **Challenges or Tests** — relocation, financial strain, time scarcity, third-party competition
4. **Conflict & Repair** — grievance episodes, apologies and forgiveness, boundary renegotiation
5. **Deepening or Milestones** — cohabitation, engagement/marriage, parenting/caregiving, health events
6. **Other Modern Turning Points** — social media stressors, parasocial/online ties, immigration/visa issues, public visibility of the relationship

**Agent architecture — three-layer memory:**
Each relationship agent maintains:
- **Identity Memory** (long-term, preloaded) — personality, background, prior relationship history. Retrieved semantically.
- **Simulation Memory** (episodic, dynamic) — emotionally charged moments across scenes. Accumulated over the simulation.
- **Scene Memory** (short-term, inline) — what just happened, what was said, what was felt.

This three-layer design enables context-sensitive behavior from moment to moment while maintaining a believable long-term arc.

**Emotion Appraisal:**
The agent computes an affect vector from context cues: joy, acceptance, fear, surprise, sadness, disgust, anger, anticipation (Plutchik's wheel). Memory retrieval uses a *hybrid similarity score* combining text-based semantic embeddings AND emotion-based embeddings, weighted by a parameter λ. This ensures memories that are emotionally congruent (not just topically similar) surface during emotionally charged scenes.

**Eight interpretable relationship states:**
Every scene is labeled with these states to track the relationship:
- **conflict** — criticism, defensiveness, contempt, stonewalling
- **repair_outcome** — apology, forgiveness, establishing new rituals
- **clarity** — labels, exclusivity, future plans explicitly negotiated
- **constraints** — tangible commitments (leases, pets, finances)
- **alternatives** — interest in rivals, secrecy, jealousy
- **transition** — life changes (moves, jobs, distance)
- **network** — social approval or disapproval from friends/family/peers
- **breakup_marker** — clear statements or trial separations

**Results (N=71 couples, 2-year follow-ups):**
- Persona-only baseline: 48.5% accuracy predicting relationship end state (essentially coin-flip)
- Simulation-aware: 64.4% accuracy (+15.8 percentage points, p=0.005)
- Between-group separation tripled: the simulation spreads the cohorts farther apart on the commitment scale, making classification much easier
- Key finding: the simulation *downweights* commitment more strongly for the decreased-status cohort (−14.5%) than the increased-status cohort (−10.6%), showing it correctly detects fragility through stress-testing

**What this reveals about human psychology:**
1. **What predicts relationship endurance is fundamentally different from what predicts initial attraction.** Personality match gets you in the door; conflict-repair patterns determine if you stay.
2. **Repair attempts are the single most diagnostic behavior.** Couples where repair attempts are acknowledged diverge sharply from those where repairs fail. Gottman's "Four Horsemen" (criticism, contempt, defensiveness, stonewalling) are confirmed as relationship poisons.
3. **Commitment is not a feeling — it is a behavioral pattern.** It's observable through investments (time, resources, shared constraints), quality of alternatives (how attentive to other options), and satisfaction with conflict resolution.
4. **The inner thought / outer behavior split matters enormously.** Agents generate both INNER_THOUGHT (private) and RESPONSE (public). When inner thoughts diverge sharply from responses, it signals conflict avoidance — a major predictor of long-term trouble.
5. **Memory matters for relationships the way it matters for individuals.** Emotionally tagged memories (not just semantic ones) are retrieved during new emotional situations. How you felt during a past conflict shapes how you respond to the next one. This is essentially what attachment theory describes.
6. **Relationships are not static compatibility scores — they're dynamic trajectories.** A couple can be "compatible" at one stage and incompatible at another. The turning point framework captures this dynamism.

---

## Part 2: What This Means for Thumos — Concrete Improvements

### 2A. Domain Topics (currently 7 domains)

**Current domains:** origins, relationships, work_and_purpose, values_and_beliefs, emotional_life, growth_and_change, aspirations

**What the papers reveal is missing:**

Both papers heavily feature dimensions that Thumos's domains don't explicitly cover. The research shows these are critical for understanding a person *and* for matching:

1. **Conflict style / repair patterns** — RELATE-Sim's single most predictive dimension. How someone handles disagreement, whether they stonewall or engage, whether they can apologize, whether they acknowledge repair attempts. Currently Thumos's hidden soul file has `conflictStyle` as a single string in the voice profile, but it's treated as a linguistic observation, not a deep exploration.

   **Recommendation:** Don't add a new domain — instead, enrich `emotional_life` and `relationships` to explicitly probe conflict behavior. Add to the reflection prompt instructions to look for: conflict patterns, defensiveness triggers, repair capacity, stonewalling tendencies, criticism vs. complaint distinction.

2. **Attachment style** — The psychologist pass in soul synthesis mentions "attachment style" but there's no domain that directly explores it. Attachment (secure, anxious, avoidant, disorganized) is one of the most robust predictors of relationship behavior in the literature.

   **Recommendation:** The `relationships` domain label should be expanded. Current label: "Relationships — family, friendships, romantic partners, social world." Should be: "Relationships — how you attach, trust, and navigate closeness and distance. Family, friendships, romance, patterns of connection and disconnection."

3. **Response to stress and constraint** — RELATE-Sim's "Challenges or Tests" category is about how people respond when life gets hard: financial pressure, time scarcity, competing demands. This is different from "emotional_life" (which focuses on feelings) — it's about behavioral response under pressure.

   **Recommendation:** `growth_and_change` currently focuses on "turning points, how you've evolved, resilience." This is close but backward-looking. Consider reframing it or adding conversation openers that probe present-tense stress responses, not just past growth narratives.

4. **Inner thought vs. outer behavior gap** — Both papers use the INNER_THOUGHT / RESPONSE split as a core architectural feature. The gap between what people think and what they say is where personality actually lives. Thumos's conversation does surface this naturally (people reveal private thoughts during reflective conversation), but the soul file doesn't explicitly track it.

   **Recommendation:** Add to the hidden soul file: `innerOuterGap` — observations about where the user's stated behaviors differ from their emotional reality. The psychologist expert pass should specifically look for this. Example: "Claims to be easygoing about plans, but language tightens noticeably when discussing others' unpredictability."

### 2B. Conversation Improvements

**Current conversation design strengths:**
- One question at a time ✓
- Uses user's own words ✓
- Notices contradictions ✓
- Memory/reference back ✓
- Domain steering with pressure levels ✓

**What the papers suggest adding:**

1. **Critical moment probing**

   Love First, Know Later's core insight is that critical moments reveal more than routine interactions. Currently, Thumos's conversation is exploratory and reflective — it asks "what shaped you?" and "what do you believe?" These are important but they're *narrative self-report*.

   The gap: Thumos never puts the user into a hypothetical situation and asks how they'd respond. This is exactly what the papers show is most predictive.

   **Recommendation:** After the soul file reaches medium confidence, introduce occasional "scenario moments" — not as quizzes, but as reflective prompts:
   - "Imagine someone you love deeply just told you they got a dream job offer in another city. What's the first thing you'd feel — before you figured out what to say?"
   - "When you and someone close disagree about something important, what usually happens? Not what you *wish* happened — what actually happens?"
   - "Think about a time someone hurt you and then tried to make it right. What did they do? Did it work?"

   These are still reflective questions, not personality tests. But they probe *behavioral patterns at turning points* — exactly what RELATE-Sim shows is most predictive.

   **Implementation:** Add these to `DOMAIN_OPENING_POOL` under `relationships` and `emotional_life`. Add a new steering pressure level: when domainCoverage shows explored/deep across 4+ domains and confidence is medium+, the system can begin introducing scenario-style probes.

2. **Emotion-aware memory retrieval**

   RELATE-Sim uses emotion embeddings alongside semantic embeddings for memory retrieval. When a user is in an emotionally charged state, the system retrieves memories that match *emotionally*, not just topically.

   Currently, Thumos's reflection note tracks `emotionalArc` as a single string. The steering context doesn't use emotion state for retrieval — it uses `recurringThemes`, `openLoops`, and `factualAnchors`.

   **Recommendation:** Add an `emotionalState` field to the reflection note — a lightweight affect assessment (not the full Plutchik wheel, but perhaps: current dominant emotion, emotional temperature high/medium/low, emotional direction rising/falling/stable). The conversation system prompt should reference this so the AI can calibrate its approach — you don't probe deeply when someone is emotionally depleted.

3. **The "what you actually do vs. what you say you'd do" distinction**

   Both papers treat self-report as unreliable and simulate behavior instead. Thumos can't simulate, but it *can* be designed to notice the gap between stated values and revealed behavior.

   **Recommendation:** In the reflection prompt, add an explicit instruction: "Note any discrepancies between what the user says they value/believe and what their stories/behaviors actually reveal. This is not a judgment — it's a diagnostic signal. Example: user says they value independence, but every major life decision they describe was made to please someone else."

### 2C. Reflection Note Improvements

**Current reflection note fields:** factualAnchors, tensions, recurringThemes, notableAbsences, emotionalArc, domainCoverage, recentAssistantQuestions, openLoops

**Recommended additions based on the papers:**

1. **`attachmentSignals`** — array of strings. Observations about attachment patterns: how they describe closeness, distance, trust, abandonment, dependence. From the psychologist lens.

2. **`conflictPatterns`** — array of strings. How they describe handling disagreements: fight/flight/freeze/fawn, repair attempts, stonewalling tendencies, the Gottman "Four Horsemen" indicators.

3. **`criticalMomentResponses`** — array of {scenario, response, interpretation}. When the user describes how they handled a turning point (not hypothetical — actual stories they've told), capture it. These are the "sparse rewards" from Love First, Know Later — the rare but highly informative moments.

4. **`statedVsRevealed`** — array of strings. Discrepancies between declared values/beliefs and behavioral evidence. This is the inner/outer gap that both papers identify as critical.

5. **`emotionalState`** — object with `dominantEmotion: string`, `temperature: "high" | "medium" | "low"`, `trend: "rising" | "falling" | "stable"`. Lightweight affect tracking for emotion-aware steering.

### 2D. Soul File Improvements

#### Visible Soul File

**Current sections:** howYouMove, howYouThink, howYouConnect, whatYouCarry, whatLightsYouUp, yourContradictions, yourVoice

These are beautiful and should stay. But for matching purposes, the visible soul file is missing:

1. **`howYouFight`** — "How you navigate disagreement — your instinct when things get tense, whether you lean in or pull back, and what repair looks like for you." This is RELATE-Sim's #1 predictive dimension, presented in the soul file's poetic register.

2. **`howYouLove`** — "How you show up in closeness — what safety looks like to you, what pulls you toward someone, what makes you withdraw." This captures attachment style in the user-facing, non-clinical way.

**Compass scores current:** openness, vitality, warmth, depth, purpose, resilience, autonomy, connection

**Recommended additions:**
- `conflictResilience` — ability to navigate disagreement without damage (0-100)
- `emotionalRegulation` — steadiness under stress, ability to self-soothe (0-100)
- `repairCapacity` — ability to apologize, forgive, and rebuild after rupture (0-100)

These three dimensions are what RELATE-Sim identifies as the strongest predictors of long-term relationship success. They're not traditional dating profile dimensions — they're relationship *maintenance* dimensions. This is the unique value Thumos can offer.

#### Hidden Soul File

**Current structure is strong.** The 4-expert analysis (psychologist, sociologist, linguist, narrativeAnalyst) maps well to the research. Recommended changes:

1. **Add a 5th expert: `relationshipAnalyst`**

   Distinct from the psychologist (who looks at individual psychology) and sociologist (who looks at group positioning), the relationship analyst specifically looks at:
   - Attachment style and its evidence
   - Conflict style mapped to Gottman's framework
   - Repair patterns (does this person acknowledge repair attempts? initiate them?)
   - Investment/alternatives/satisfaction balance (Investment Model, Rusbult)
   - Turning point behavior patterns from their stories

   This expert's output directly feeds the matching algorithm.

2. **Expand `coreDrivers` to include relationship-specific drivers:**

   Current drivers are general ("need for control", "fear of abandonment", etc.). Add a `relational` boolean flag to drivers that specifically predict relationship behavior. Example:
   ```
   {driver: "fear of engulfment", strength: 0.7, inferred: true, relational: true, evidence: "repeatedly describes needing space after intimacy"}
   ```

3. **Add `playbook` field — behavioral if→then rules:**

   RELATE-Sim's persona synthesis produces a 5-7 rule "playbook" of actionable if→then behaviors. Example:
   - "If criticized → initial freeze, then delayed defensive response, rarely immediate repair"
   - "If partner shows vulnerability → strong protective instinct, may over-function"
   - "If autonomy threatened → becomes quiet, withdraws, processes alone before re-engaging"

   This is enormously valuable for matching. Two people whose playbooks are compatible (one person's "if criticized → immediate apology" pairs well with another's "if partner apologizes → quick forgiveness") have predictably better outcomes than two people whose playbooks create escalation loops.

   **Add `behavioralPlaybook: Array<{trigger: string, response: string, relational_impact: string}>`** to the hidden soul file.

4. **Add `emotionProfile` field:**

   From RELATE-Sim's emotion embedding approach. Track baseline emotional tendencies:
   ```
   emotionProfile: {
     baseline: {joy: 0.6, fear: 0.2, anger: 0.1, ...},  // Plutchik-style
     triggers: [{emotion: "anger", context: "feeling unheard", intensity: "high"}],
     regulationStyle: "suppresses then floods" | "steady processing" | "immediate expression" | ...
   }
   ```

### 2E. Summary: Priority-Ordered Changes

**High priority (directly backed by strong evidence, feasible now):**

1. Add `conflictPatterns` and `attachmentSignals` to the reflection note — these are the two most predictive dimensions in the research and they can be inferred from existing conversations
2. Add `behavioralPlaybook` to the hidden soul file — if→then rules derived from conversation stories, directly usable by matching agents
3. Add critical-moment probing questions to the conversation — hypothetical scenarios that reveal behavioral patterns at turning points
4. Add relationship analyst as 5th expert in soul synthesis — dedicated to extracting matching-relevant signals

**Medium priority (valuable but requires more design work):**

5. Add `howYouFight` and `howYouLove` sections to visible soul file
6. Add `conflictResilience`, `emotionalRegulation`, `repairCapacity` compass scores
7. Add `statedVsRevealed` to reflection notes — the inner/outer gap tracker
8. Add `emotionalState` to reflection notes for emotion-aware conversation steering

**Lower priority (nice to have, more speculative):**

9. Expand `emotionProfile` in hidden soul file with Plutchik-style baseline
10. Add `relational` flag to coreDrivers
11. Hybrid emotion+semantic retrieval for memory (requires embedding infrastructure)

---

## Part 3: The Bigger Picture

These two papers, taken together, point toward a fundamental reframing of what Thumos is building.

**The soul file is not a dating profile — it's a behavioral model.**

A dating profile says "I like hiking and I'm looking for someone kind." A behavioral model says "When this person faces conflict, they freeze for 6-12 hours, then return with a carefully worded message acknowledging both sides. They struggle to apologize directly but show remorse through acts of service. They feel most connected when sharing a quiet activity together without pressure to talk."

The second is infinitely more useful for predicting whether two people will be happy together. And it's exactly what the soul file can become through reflective conversation — without ever asking the user to fill out a questionnaire.

The soul mirror conversation is already building this behavioral model. The improvements above are about making the extraction more systematic and the representation more structured — so that when Phase 2's matching algorithm needs to answer "will these two people navigate a conflict well together?", it has the signals to do so.

**The matching algorithm should not be "who is similar" — it should be "who would interact well."**

Both papers show that simulating interaction outperforms comparing attributes. For Thumos, this means the Phase 2 matching system should:
1. Use the hidden soul file (especially the behavioral playbook) to create LLM personas
2. Simulate interactions between pairs at critical moments
3. Score the interaction quality — especially repair patterns and emotional regulation
4. Rank matches by predicted interaction quality, not profile similarity

The soul file is the persona. The richer and more behaviorally specific it becomes, the better the simulation, the better the matches. This is the flywheel.
