# Soul Artifact Redesign v3

## Problems (evidence from fd5c conversation, 115 messages)

1. **Domain coverage all "untouched"** — reflection prompt doesn't enumerate domain names
2. **Repeated questions** — user called it out twice; 57 questions asked, only 5 tracked
3. **Topic circling** — steering points model at already-explored territory
4. **Duplicate content** — expert reflections, core drivers accumulate near-duplicates
5. **Overlapping fields** — Big Five scored 3x independently; values in 3 places
6. **Hidden insights too good to hide** — expert observations are genuinely valuable

---

## Design Decisions

1. **Visible and Hidden are generated independently** — fully parallel, no shared assessment step
2. **Input: raw messages + latest reflection note only** — no older soul files fed into prompts
3. **Reflection notes are fully overwritten** each time (clean-slate from full transcript)
4. **All artifacts are versioned** — INSERT new rows, query latest valid
5. **JSON schema enforcement** — Anthropic `output_config.format`, Fireworks OpenAI-compatible endpoint
6. **Psychometric scores live ONLY in visible** — hidden is purely clinical process notes
7. **Post-generation merge for accumulative fields only** — crystallized moments, expert reflections
8. **Steering via 4 simple fields** — currentThreads, avoidPastObservations, avoidPastQuestions, steerToTopics
9. **Steering pressure is LLM-assessed** — not message-count formula

---

## ReflectionNote — "What's happening in this conversation"

**Job:** Conversation-state tracker for live steering.
**Cadence:** Every 5 messages (completely overwritten each time, clean-slate).
**Consumer:** Live conversation system prompt.
**Input:** Full transcript only (no existing note).

### Fields

| Field | Type | Purpose |
|---|---|---|
| `factualAnchors` | `Record<string, string>` (max 12) | Verbatim quotes grounding identity |
| `tensions` | `string[]` (max 5) | Contradictions or pulls in different directions |
| `recurringThemes` | `string[]` (max 5) | Topics/patterns that keep resurfacing |
| `notableAbsences` | `string[]` (max 3) | Significant things not mentioned |
| `emotionalArc` | `string` | How emotional state shifted across conversation |
| `recentAssistantQuestions` | `string[]` (max 15) | Distinct questions already asked. Anti-repeat. |
| `currentThreads` | `string[]` (max 4) | What's actively being discussed right now |
| `avoidPastObservations` | `string[]` (max 6) | Observations/reflections the assistant has already made that should not be repeated |
| `avoidPastQuestions` | `string[]` (max 8) | Specific questions already asked that should not be reasked |
| `steerToTopics` | `string[]` (max 4) | Underexplored life areas with specific entry angles |
| `steeringPressure` | `"minimal" \| "gentle" \| "moderate" \| "strong"` | How aggressively to steer. LLM-assessed. |
| `steeringReasoning` | `string` | Why this pressure level — what signals is the LLM reading |

### Removed (vs current)

`inferredBigFive`, `attachmentSignals`, `valueSignals`, `moralFoundationSignals`, `conflictStyle`, `meaningOrientation` — psychometrics don't belong in the conversation tracker. `domainCoverage` — replaced by `steerToTopics`. `openLoops` — split into `currentThreads` (active) and `steerToTopics` (dormant).

### Why `avoidPastObservations` and `avoidPastQuestions` are separate

They serve different functions:
- **`avoidPastQuestions`**: "What woke you up?" / "What does achievement look like?" — the assistant should not rephrase and re-ask these
- **`avoidPastObservations`**: "You carry your parents' scarcity instinct" / "The irony of building connection while distancing" — the assistant keeps restating these. They're valid insights but become repetitive when echoed back every 3rd response

Combining them would blur what the model should avoid *asking* vs avoid *saying*.

### Steering pressure: LLM-assessed, not formula

**Why not message count?** The user's critique is correct: 50 messages total but "family" introduced 1 message ago → the right pressure on family is zero (it's fresh), while the right pressure *away from* career (30 messages deep) is strong. A global count captures neither.

**Research support:** PCQPR (EMNLP 2024) uses LLM-generated reflection as the steering mechanism. Therapy redirection research (2024) found the best signal for "when to steer" is whether the user is still producing new semantic content, not conversation length.

**What the LLM should assess:**
```
Determine steeringPressure based on the actual conversation state:
- "minimal": User is in productive flow, actively sharing new content. Follow their lead.
- "gentle": Current thread is cooling (shorter answers, repeating prior points).
  Look for natural bridges to unexplored territory.
- "moderate": Current thread is saturated AND multiple life areas unexplored.
  Actively introduce new domains.
- "strong": Conversation is circling. User has given closure signals on current topics.
  Redirect persistently.

Key signals to read:
- Is the user still offering NEW information, or restating what they've said?
- Are responses getting shorter / more agreement-only?
- Has the user redirected or said "we talked about this"?
- How many life areas remain completely untouched?

Include your reasoning in steeringReasoning so the conversation agent understands WHY.
```

**Structural guardrails in the conversation prompt:**
- If total messages < 10: override to "minimal" regardless of LLM assessment
- If user's last message introduced a new topic: suppress steering for this turn

### How steering is rendered in the system prompt

Replace the current INNER COMPASS block with a flat directive:

```
NAVIGATION (private):
Pressure: MODERATE — current thread (systemic extraction) has been explored for 30+ messages
  with declining novelty. User gave short answers in last 3 exchanges. Relationships and
  emotional life are untouched.
Active threads: marketing anxiety, friend's cold response
Steer toward: romantic life (mentioned "school and girls" once, never explored),
  daily routines (completely absent), specific childhood memories beyond poverty
Don't re-observe: "You carry your parents' scarcity instinct" (said 4x),
  "The irony of building connection while distancing" (said 3x)
Don't re-ask: "What does achievement look like?", "What happens if Thumos fails?",
  "How do you stay open while protecting yourself?"
```

### 7-domain reference checklist

The reflection prompt includes the 7 life domains as a reference (not as structured output):

```
When generating steerToTopics, consider whether these life areas have been explored:
origins, relationships, work & purpose, values & beliefs, emotional life,
growth & change, aspirations

Be specific in steerToTopics — not just "relationships" but
"romantic life — mentioned 'school and girls' early but never explored since"
```

---

## HiddenSoulFile — "The AI's private process notes"

**Job:** Clinical observations the user shouldn't see. The AI's conversation playbook.
**Cadence:** On soul file synthesis (async).
**Consumer:** Debug/analytics. Eventually: live conversation steering (future).
**Input:** Raw messages + latest reflection note (no existing hidden file).
**Analogy:** Psychotherapy process notes — clinician hypotheses, not patient records.

### Fields

| Field | Type | Purpose |
|---|---|---|
| `confidence` | `"low" \| "medium" \| "high"` | Overall confidence in assessment |
| `expertReflections` | `{ psychologist[], sociologist[], linguist[], narrativeAnalyst[] }` | 4-lens clinical analysis, max 6 per lens |
| `coreDrivers` | `{ driver, strength, inferred, evidence }[]` (max 6) | What actually motivates this person beneath their self-narrative |
| `coreValues` | `string[]` (max 6) | Clinical framing of values (may differ from user-facing) |
| `voice` | `{ register, density, humorStyle, conflictStyle, voiceExamples, disclosureRate, signaturePatterns }` | How to talk *to* this person |
| `depthMap` | `{ domainCoverage[] }` | 7 life domains with depth tracking (analytics) |
| `analystNotes` | `string[]` (max 6) | Meta-observations, clinical alerts, growth edges |
| `honestInsights` | `string[]` (max 3) | Critical observations worth surfacing to the user (rewritten compassionately in visible file) |

### Removed (vs current)

| Field | Why |
|---|---|
| `bigFiveScores` | Lives in visible file's `personalitySpectrum`. Hidden file doesn't need its own copy — nobody reads it from there. |
| `schwartzProfile` | Lives in visible file's `topValues`. |
| `attachmentScores` | Lives in visible file's `relationalStyle`. Clinical *implications* of attachment go in `expertReflections.psychologist`. |
| `moralFoundations` | Assessment intermediate. Insights go in `expertReflections`. |
| `meaningOrientation` | Assessment intermediate. Insights go in `expertReflections.narrativeAnalyst`. |
| `depthMap.safeEntryPoints` | Was populated from recurringThemes (already explored). Counter-productive. |
| `depthMap.unlockTopics` | Replaced by reflection note's `steerToTopics`. |
| `depthMap.avoidEarly` | Replaced by reflection note's steering. |
| `depthMap.currentlyLiveTopics` | Replaced by reflection note's `currentThreads`. |

### What the hidden file IS for

The hidden file answers questions the user should never see:

1. **What do expert lenses see?** (expertReflections)
   - "Fearful attachment style now visible in real-time: hypervigilance to micro-expressions paired with active distancing"
   - "The 'miswant' realization functions as origin story, not hinge point"

2. **What actually drives this person?** (coreDrivers)
   - "Security (conflicted): holds gold 'in hope for the best' despite recognizing safety as miswant"
   - These may differ from the user's self-narrative

3. **How should I talk to them?** (voice)
   - Register, humor style, disclosure rate, signature patterns
   - "Dry, sparse humor; declarative statements; formal register even in vulnerable moments"

4. **What should I know but not say?** (analystNotes)
   - "Building in isolation; fearful attachment could create friction as Thumos scales"
   - "Scarcity instinct won't yield to rationality alone"

5. **What honest truth would help them?** (honestInsights → feeds visible `honestMirror`)

### Deduplication

Since each synthesis is clean-slate (no existing file in prompt), accumulation of near-duplicates within a single run is handled by prompt instruction:

```
Each expert reflection must be genuinely distinct. If two observations overlap,
keep only the sharper one. Maximum 6 per lens.
```

Cross-run accumulation is handled by versioning — each synthesis produces a fresh version. The merge step only applies to `expertReflections` and `analystNotes` (accumulative fields where early insights might not resurface).

---

## VisibleSoulFile — "Here's what we see in you"

**Job:** User-facing soul portrait. "Accurate and loving" — honest, not flattering.
**Cadence:** Same as hidden (async synthesis).
**Consumer:** The user (iOS app).
**Input:** Raw messages + latest reflection note (no existing visible file).

### Fields

| Field | Type | Purpose |
|---|---|---|
| `portrait` | `string` | Opening narrative, 2-3 sentences |
| `howYouMove` | `string` | Prose section |
| `howYouThink` | `string` | Prose section |
| `howYouConnect` | `string` | Prose section |
| `whatYouCarry` | `string` | Prose section |
| `whatLightsYouUp` | `string` | Prose section |
| `yourContradictions` | `string` | Prose section |
| `yourVoice` | `string` | Prose section |
| `crystallizedMoments` | `{ quote, reflection }[]` (max 10) | Verbatim quotes + reflections |
| `openThreads` | `string[]` (max 5) | Unresolved topics worth returning to |
| `compassScores` | 8-axis, 0-100 | Depth, warmth, purpose, autonomy, openness, vitality, connection, resilience |
| `personalitySpectrum` | Big Five, position 0-100 + label + evidence | **SINGLE SOURCE for personality scores** |
| `topValues` | `{ value, description }[]` (max 4) | **SINGLE SOURCE for values** |
| `relationalStyle` | `string` | **SINGLE SOURCE for attachment narrative** |
| `honestMirror` | `string[]` (max 3) | Compassionate but honest observations |

### Psychometrics live HERE, not in hidden

The visible file is the single source of truth for:
- **Personality** (`personalitySpectrum`) — Big Five with warm labels
- **Values** (`topValues`) — Schwartz-informed but user-readable
- **Attachment** (`relationalStyle`) — narrative form, not clinical scores

The hidden file captures the *clinical implications* of these in `expertReflections` (e.g., "fearful attachment style driving isolation pattern") without duplicating the raw scores.

### Merge: only crystallized moments

**Why merge crystallized moments?** Research on LLM reproducibility (2025) shows that for subjective extraction tasks like "pick the best quotes from 100+ messages," repeated runs produce as low as 30-51% overlap. Without accumulation, the user's favorite quote might vanish between synthesis runs — creating a "flickering identity" that undermines the product.

**Everything else: fresh generation.** Scores, narratives, sections — all regenerated clean from transcript + reflection note each time. No anchoring bias, no error accumulation.

| Field | Strategy |
|---|---|
| `crystallizedMoments` | **Accumulate** — dedup by quote, cap at 10, recency-biased |
| Everything else | **Fresh generation** — latest synthesis wins |

---

## Honest Mirror (Issue 6)

### Flow

1. Hidden prompt generates `honestInsights` (clinical language, max 3)
2. Visible prompt generates `honestMirror` (compassionate rewrite, max 3)
3. They are generated independently — both prompts can identify honest observations from the transcript

### Examples from fd5c conversation

**Hidden `honestInsights`:**
```
"Growth edge is relational, not technical. Marketing forces emotional engagement
with defensive energy that triggers distancing response."
```

**Visible `honestMirror`:**
```
"Your biggest growth edge isn't the code or the product — it's staying present when
someone responds with the cold indifference that makes you want to pull away."
```

### Tone guidelines for `honestMirror`
1. Second person, not clinical third person
2. Grounded in their own words and specific evidence
3. Names the pattern without diagnosing
4. Ends with an opening, not a verdict
5. Never cruel, never flattering — just clear

---

## Generation Pipeline

### Current (3 calls, serial dependency)
```
Transcript + ReflectionNote + existing files
         ↓
    Assessment (Opus) — derives psychometrics [SERIAL BOTTLENECK]
         ↓
    Visible (Opus) + Hidden (Haiku) in parallel
         ↓
    Merge with existing files (all fields)
```

### Proposed (2 calls, fully parallel, clean-slate)
```
Raw messages + latest ReflectionNote
         ↓
    Visible (Opus) + Hidden (Haiku) fully parallel
         ↓
    Merge crystallized moments only (visible)
    Merge expert reflections + analyst notes only (hidden)
         ↓
    INSERT as new version
```

### Benefits
| | Current | Proposed |
|---|---|---|
| LLM calls per synthesis | 3 (1 serial + 2 parallel) | 2 (fully parallel) |
| Cost (frontier_v1) | 2 Opus + 1 Haiku | 1 Opus + 1 Haiku |
| Latency | Assessment blocks | Nothing blocks |
| Anchoring bias | Existing files in prompt | None |
| Error accumulation | Additive merge on all fields | Merge only on accumulative fields |
| Debugging | Trace through 3 steps | Each output → 1 prompt |
| Hidden file token cost | ~40% wasted on psychometric fields | Lean clinical output |

---

## Versioning

### Schema
```sql
ALTER TABLE reflection_snapshots ADD COLUMN version INTEGER DEFAULT 1;
-- visible_soul_files and hidden_soul_files already have version column
-- Change from upsert to INSERT
-- Query: WHERE user_id = $1 AND status = 'ready' ORDER BY version DESC LIMIT 1
```

No cleanup/retention policy for now.

---

## JSON Schema Enforcement

| Provider | Mechanism |
|---|---|
| Anthropic (direct) | `output_config.format` with `json_schema` — GA, no beta header |
| Fireworks | `response_format` with `json_schema` on OpenAI-compatible endpoint (`/inference/v1/chat/completions`) |

Keep defensive `parseJsonObject()` as fallback for `max_tokens` truncation.

---

## Summary of All Changes

| Change | Effort | Impact |
|---|---|---|
| Overwrite reflection notes (clean-slate) | Small | Eliminates stale data |
| Replace steering with currentThreads / avoidPastObservations / avoidPastQuestions / steerToTopics | Medium | Fixes topic circling (Issue 3) |
| LLM-assessed steeringPressure with reasoning | Small | Context-aware steering |
| Raise recentAssistantQuestions cap to 15 | Small | Reduces repetition (Issue 2) |
| Remove psychometrics from hidden file | Medium | Eliminates overlap (Issue 5) |
| Remove assessment step | Medium | Simplifies pipeline, cuts cost |
| Add honestInsights / honestMirror | Small | Addresses Issue 6 |
| Fresh generation (no existing files in prompts) | Small | Kills anchoring + error accumulation |
| Merge only accumulative fields (moments, reflections, notes) | Small | Keeps pipeline lean |
| Version all artifacts | Medium | Rollback safety (Issue 4) |
| JSON schema enforcement | Medium | Prevents malformed output (Issue 1) |
