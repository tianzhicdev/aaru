# Soul Dashboard V2 — Implementation Spec

**Status**: Draft
**Date**: 2026-03-30
**Scope**: Near-term + medium-term changes from research findings
**Research basis**: `research-paper-analysis-and-thumos-implications.md`

---

## Overview

This spec covers four interconnected changes:

1. **Restructured data model** — new fields on both soul files, rethink hidden→visible boundary
2. **Multi-call synthesis pipeline** — split the single Opus call into assessment → narrative/clinical
3. **Enriched reflection snapshots** — add psychological signals (Big Five, attachment, values, moral foundations)
4. **Redesigned iOS soul file UI** — dashboard with spectrum bars, value pills, tappable compass, collapsible sections

All changes are additive — existing fields remain, new fields have defaults/nulls, no breaking migration.

---

## 1. Data Model Changes

### 1A. ReflectionNote — add psychological signal fields

**File**: `src/domain/schemas.ts` (reflectionNoteSchema)

Add these fields to the reflection note (all optional, default empty):

```typescript
// Add to reflectionNoteSchema
inferredBigFive: z.object({
  openness:          z.object({ score: z.number().min(0).max(100), confidence: z.enum(["low","medium","high"]), evidence: z.string() }).nullable().default(null),
  conscientiousness:  z.object({ score: z.number().min(0).max(100), confidence: z.enum(["low","medium","high"]), evidence: z.string() }).nullable().default(null),
  extraversion:       z.object({ score: z.number().min(0).max(100), confidence: z.enum(["low","medium","high"]), evidence: z.string() }).nullable().default(null),
  agreeableness:      z.object({ score: z.number().min(0).max(100), confidence: z.enum(["low","medium","high"]), evidence: z.string() }).nullable().default(null),
  neuroticism:        z.object({ score: z.number().min(0).max(100), confidence: z.enum(["low","medium","high"]), evidence: z.string() }).nullable().default(null),
}).default({ openness: null, conscientiousness: null, extraversion: null, agreeableness: null, neuroticism: null }),

attachmentSignals: z.array(z.object({
  dimension: z.enum(["anxiety", "avoidance"]),
  signal: z.string(),
  strength: z.enum(["weak", "moderate", "strong"])
})).default([]),

valueSignals: z.array(z.object({
  value: z.string(),     // Schwartz value name
  evidence: z.string(),
  direction: z.enum(["high_priority", "low_priority"])
})).default([]),

moralFoundationSignals: z.array(z.object({
  foundation: z.enum(["care", "fairness", "loyalty", "authority", "purity"]),
  signal: z.string()
})).default([]),

conflictStyle: z.string().default(""),      // narrative observation
meaningOrientation: z.string().default(""), // narrative observation
```

**Migration impact**: None — reflection snapshots are stored as JSON blobs in `reflection_snapshots.note`. New fields default to empty/null. Existing snapshots parse without error (Zod defaults handle missing fields).

**Prompt change**: `buildReflectionPrompt` in `soulFile.ts` must request these new fields. See §3.

### 1B. VisibleSoulFile — add dashboard-facing fields

**File**: `src/domain/schemas.ts` (visibleSoulFileSchema)

```typescript
// Add inside visibleSoulFileSchema, after compassScores

personalitySpectrum: z.object({
  openness:             z.object({ position: z.number().min(0).max(100), label: z.string(), evidence: z.string() }).nullable().default(null),
  conscientiousness:    z.object({ position: z.number().min(0).max(100), label: z.string(), evidence: z.string() }).nullable().default(null),
  extraversion:         z.object({ position: z.number().min(0).max(100), label: z.string(), evidence: z.string() }).nullable().default(null),
  agreeableness:        z.object({ position: z.number().min(0).max(100), label: z.string(), evidence: z.string() }).nullable().default(null),
  emotionalSensitivity: z.object({ position: z.number().min(0).max(100), label: z.string(), evidence: z.string() }).nullable().default(null),
}).default({
  openness: null, conscientiousness: null, extraversion: null,
  agreeableness: null, emotionalSensitivity: null
}),

topValues: z.array(z.object({
  value: z.string(),           // e.g. "Self-Direction"
  description: z.string()      // 1-sentence warm description
})).max(3).default([]),

relationalStyle: z.string().nullable().default(null),  // 2-3 sentence narrative
```

**DB change**: These are stored as JSON columns (new columns on `visible_soul_files`):

```sql
-- Migration: 20260330_soul_dashboard_v2.sql
ALTER TABLE visible_soul_files
  ADD COLUMN IF NOT EXISTS personality_spectrum JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS top_values JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS relational_style TEXT DEFAULT NULL;
```

**Workers change**: `soulApp.ts` — update `VisibleSoulFileRow`, `rowToVisibleSoulFile`, and `upsertVisibleSoulFile` to include the 3 new columns.

**iOS change**: `Models.swift` — update `VisibleSoulFile` struct with new Codable fields (optional, backward compatible).

### 1C. HiddenSoulFile — add structured psychological profiles

**File**: `src/domain/schemas.ts` (hiddenSoulFileSchema)

```typescript
// Add inside hiddenSoulFileSchema, after analystNotes

bigFiveScores: z.object({
  openness:          z.object({ score: z.number(), confidence: z.number(), evidence: z.string() }).nullable().default(null),
  conscientiousness:  z.object({ score: z.number(), confidence: z.number(), evidence: z.string() }).nullable().default(null),
  extraversion:       z.object({ score: z.number(), confidence: z.number(), evidence: z.string() }).nullable().default(null),
  agreeableness:      z.object({ score: z.number(), confidence: z.number(), evidence: z.string() }).nullable().default(null),
  neuroticism:        z.object({ score: z.number(), confidence: z.number(), evidence: z.string() }).nullable().default(null),
}).default({ openness: null, conscientiousness: null, extraversion: null, agreeableness: null, neuroticism: null }),

schwartzProfile: z.array(z.object({
  value: z.string(),
  priority: z.number().min(1).max(10),  // 1 = highest priority
  evidence: z.string()
})).max(10).default([]),

attachmentScores: z.object({
  anxiety:   z.number().min(0).max(100).nullable().default(null),
  avoidance: z.number().min(0).max(100).nullable().default(null),
  style:     z.enum(["secure", "preoccupied", "dismissive", "fearful"]).nullable().default(null),
  evidence:  z.string().default("")
}).default({ anxiety: null, avoidance: null, style: null, evidence: "" }),

moralFoundations: z.object({
  care:      z.number().min(0).max(100).nullable().default(null),
  fairness:  z.number().min(0).max(100).nullable().default(null),
  loyalty:   z.number().min(0).max(100).nullable().default(null),
  authority: z.number().min(0).max(100).nullable().default(null),
  purity:    z.number().min(0).max(100).nullable().default(null),
}).default({ care: null, fairness: null, loyalty: null, authority: null, purity: null }),

meaningOrientation: z.enum([
  "meaning_present", "meaning_seeking", "meaning_ambivalent", "meaning_skeptical"
]).nullable().default(null),
```

**DB change**: Hidden soul files store everything as JSON columns. Add new columns:

```sql
ALTER TABLE hidden_soul_files
  ADD COLUMN IF NOT EXISTS big_five_scores JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS schwartz_profile JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS attachment_scores JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS moral_foundations JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS meaning_orientation TEXT DEFAULT NULL;
```

**Workers change**: `soulApp.ts` — update `HiddenSoulFileRow`, `rowToHiddenSoulFile`, and `upsertHiddenSoulFile`.

### 1D. Field migration summary

| Layer | Field | Type | Default | Breaking? |
|---|---|---|---|---|
| ReflectionNote | inferredBigFive | object of nullable scores | all null | No |
| ReflectionNote | attachmentSignals | array | [] | No |
| ReflectionNote | valueSignals | array | [] | No |
| ReflectionNote | moralFoundationSignals | array | [] | No |
| ReflectionNote | conflictStyle | string | "" | No |
| ReflectionNote | meaningOrientation | string | "" | No |
| VisibleSoulFile | personalitySpectrum | object of nullable entries | all null | No |
| VisibleSoulFile | topValues | array | [] | No |
| VisibleSoulFile | relationalStyle | string | null | No |
| HiddenSoulFile | bigFiveScores | object of nullable scores | all null | No |
| HiddenSoulFile | schwartzProfile | array | [] | No |
| HiddenSoulFile | attachmentScores | object | all null | No |
| HiddenSoulFile | moralFoundations | object | all null | No |
| HiddenSoulFile | meaningOrientation | enum | null | No |

All additive. Old clients ignore unknown fields. Old data parses with Zod defaults.

---

## 2. Multi-Call Synthesis Pipeline

### Current state

One Opus call produces both visible + hidden soul files via `<<<SPLIT>>>` delimiter. One prompt does 4-expert analysis + poetic writing + clinical analysis + compass scoring. ~8192 max tokens.

### Problem

Analytical scoring and poetic writing are cognitively competing tasks within a single generation. The prompt is already 300+ lines. Adding Big Five, Schwartz, attachment, and moral foundations would push it past reliable single-call output.

### New pipeline

```
                  ┌──────────────────────┐
                  │  1. ASSESSMENT CALL  │  ← Opus, analytical mode
                  │  (Big Five, Schwartz,│     temperature: 0.2
                  │   attachment, moral  │     max_tokens: 4096
                  │   foundations, etc.)  │
                  └──────────┬───────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼                              ▼
  ┌───────────────────┐          ┌───────────────────┐
  │ 2A. VISIBLE CALL  │          │ 2B. HIDDEN CALL   │
  │ (portrait, sects, │  ← Opus  │ (expert reflect., │  ← Haiku
  │  spectrum, values, │   0.5    │  drivers, voice,  │   0.2
  │  relational style)│   6144   │  depth map, notes)│   3072
  └───────────────────┘          └───────────────────┘
         (parallel)                    (parallel)
```

### Implementation

**File**: `src/domain/soulFile.ts`

Add three new prompt builders:

#### `buildAssessmentPrompt(messages, reflectionNote, existingHidden)`

```
System: You are a psychometric analyst. Assess personality, values, attachment,
        moral foundations, and meaning orientation from conversation transcripts.
        Output valid JSON only.

Output JSON:
{
  "bigFive": {
    "openness": { "score": 0-100, "confidence": 0.0-1.0, "evidence": "..." },
    ...5 traits
  },
  "schwartzValues": [
    { "value": "Self-Direction", "priority": 1, "evidence": "..." },
    ...up to 10
  ],
  "attachment": {
    "anxiety": 0-100 | null,
    "avoidance": 0-100 | null,
    "style": "secure|preoccupied|dismissive|fearful" | null,
    "evidence": "..."
  },
  "moralFoundations": {
    "care": 0-100 | null,
    ...5 foundations
  },
  "meaningOrientation": "meaning_present|meaning_seeking|meaning_ambivalent|meaning_skeptical" | null,
  "conflictStyle": "narrative description",
  "coreDrivers": [...existing format],
  "coreValues": [...strings]
}

Rules:
- Use null for any dimension with insufficient evidence.
- Cite specific quotes or behavioral patterns as evidence.
- With <15 user messages, most scores should be null.
- Big Five: score on the trait itself (0 = low, 100 = high).
- Schwartz: rank by priority (1 = most important to this person).
- Attachment: anxiety = fear of abandonment; avoidance = discomfort with closeness.
```

#### `buildVisibleNarrativePrompt(messages, reflectionNote, assessment, existingVisible)`

Same as current visible portion of `buildSoulSynthesisPrompt`, but:
- Receives the assessment JSON as input context (not generating it)
- Adds `personalitySpectrum` output (warm labels derived from Big Five scores)
- Adds `topValues` output (top 3 Schwartz values with warm descriptions)
- Adds `relationalStyle` output (narrative from attachment + conflict style)
- Personality spectrum uses warm bipolar labels:

```
PERSONALITY SPECTRUM — display labels
Each is a bipolar spectrum. Position the user on it (0-100).
Write a 1-sentence "label" using their own language/metaphors.

openness:             Consistency ←→ Curiosity
conscientiousness:    Spontaneity ←→ Structure
extraversion:         Solitude ←→ Engagement
agreeableness:        Challenge ←→ Harmony
emotionalSensitivity: Calm ←→ Sensitive

Only score dimensions with evidence from the assessment. Use null otherwise.
Include a brief "evidence" string grounding each score.
```

#### `buildHiddenClinicalPrompt(messages, reflectionNote, assessment, existingHidden)`

Same as current hidden portion, but receives assessment as input. Uses Haiku (cheaper, faster — the hard analytical work is done). Still produces: expertReflections, voice, depthMap, analystNotes. Now also populates: bigFiveScores, schwartzProfile, attachmentScores, moralFoundations, meaningOrientation (copied/refined from assessment).

### Orchestration

**File**: `workers/src/soulApp.ts` — `runSoulSynthesis()`

```typescript
// Step 1: Assessment (sequential — needed by steps 2a/2b)
const assessmentRaw = await callClaude(
  assessmentSystemPrompt,
  [{ role: "user", content: buildAssessmentPrompt(...) }],
  { apiKey, model: "claude-opus-4-20250514", maxTokens: 4096, temperature: 0.2 }
);
const assessment = parseAssessment(assessmentRaw);
if (!assessment) { /* fallback to existing synthesis */ }

// Step 2a + 2b: Visible + Hidden (parallel)
const [visibleRaw, hiddenRaw] = await Promise.all([
  streamToString(streamClaude(
    visibleSystemPrompt,
    [{ role: "user", content: buildVisibleNarrativePrompt(..., assessment, ...) }],
    { apiKey, model: "claude-opus-4-20250514", maxTokens: 6144, temperature: 0.5 }
  )),
  callClaude(
    hiddenSystemPrompt,
    [{ role: "user", content: buildHiddenClinicalPrompt(..., assessment, ...) }],
    { apiKey, model: "claude-haiku-4-5-20251001", maxTokens: 3072, temperature: 0.2 }
  )
]);
```

### Fallback

If assessment call fails → fall back to current single-call synthesis (backward compatible). The existing `buildSoulSynthesisPrompt` and `parseSoulSynthesis` remain as fallback path.

### Cost estimate

| Current | New |
|---|---|
| 1× Opus (8K out) | 1× Opus (4K out) + 1× Opus (6K out) + 1× Haiku (3K out) |
| ~$0.12/synthesis | ~$0.16/synthesis |

~33% cost increase, but substantially better output quality due to task separation. The Haiku call is negligible cost.

---

## 3. Reflection Snapshot Prompt Changes

**File**: `src/domain/soulFile.ts` — `buildReflectionPrompt()`

Append to the existing output spec:

```
Additionally, output these psychological signal fields:

- "inferredBigFive": For each of the 5 traits (openness, conscientiousness,
  extraversion, agreeableness, neuroticism), provide {"score": 0-100,
  "confidence": "low|medium|high", "evidence": "quote or observation"}
  or null if insufficient evidence.
  These are ROUGH RUNNING ESTIMATES that evolve as more conversation accumulates.

- "attachmentSignals": Array of observed signals about relational attachment.
  Each: {"dimension": "anxiety|avoidance", "signal": "what you observed",
  "strength": "weak|moderate|strong"}.
  Look for: fear of abandonment (anxiety), discomfort with closeness (avoidance),
  reassurance-seeking, withdrawal patterns, trust language.

- "valueSignals": Array of observed value priorities.
  Each: {"value": "Schwartz value name", "evidence": "what they said/did",
  "direction": "high_priority|low_priority"}.
  Schwartz values: Self-Direction, Stimulation, Hedonism, Achievement, Power,
  Security, Conformity, Tradition, Benevolence, Universalism.

- "moralFoundationSignals": Array of moral reasoning signals.
  Each: {"foundation": "care|fairness|loyalty|authority|purity",
  "signal": "what they said"}.
  Detect through: reactions to injustice (fairness), concern for suffering (care),
  group loyalty language (loyalty), respect for hierarchy (authority),
  disgust/purity language (purity).

- "conflictStyle": 1-2 sentences on how they describe handling disagreements.
  Empty string if no evidence.

- "meaningOrientation": 1-2 sentences on their relationship with meaning/purpose.
  Empty string if no evidence.
```

Increase `maxTokens` from 1400 → 2000 for the reflection call.

These signals are **accumulative** — each reflection snapshot adds new signals from the latest 10 messages. The synthesis pipeline aggregates them into scores.

---

## 4. Conversation Prompt Additions

**File**: `src/domain/soul.ts` — `buildSoulSystemPrompt()`

### 4A. Attachment-eliciting prompts

Add to the opening pool for `relationships` domain:

```typescript
["relationships", "When someone you care about pulls away, what's your first instinct?"],
["relationships", "What does it take for you to really trust someone new?"],
```

### 4B. Moral foundation probes

Add to the steering system — activated when `values_and_beliefs` reaches `explored` depth. These are optional scenario prompts the assistant MAY use when steering toward values:

```
SCENARIO PROMPTS (use naturally, do not present as a quiz):
- "A friend asks you to cover for them at work — nothing wrong, just a personal day. What's your gut reaction?"
- "Someone cuts ahead of you in line and then looks embarrassed — how do you feel?"
- "A family tradition doesn't make sense to you anymore — do you keep doing it?"
```

### 4C. Insight delivery mode

Add a new paragraph to the Inner Compass section, after the steering pressure logic:

```
INSIGHT DELIVERY: When a domain reaches "explored" or "deep" depth,
shift from pure questioning to offering grounded observations.
Example: "I notice you describe work in terms of obligation but
creativity in terms of flow — that tension seems important."
Ground observations in their own words. Do not diagnose.
Maximum one insight per 3-4 exchanges. Still ask questions,
but alternate with observations.
```

---

## 5. iOS UI Redesign

### 5A. New Swift models

**File**: `Thumos/App/Models.swift`

```swift
// Add to VisibleSoulFile struct
var personalitySpectrum: PersonalitySpectrum?
var topValues: [TopValue]?
var relationalStyle: String?

struct PersonalitySpectrum: Codable, Equatable {
    var openness: SpectrumEntry?
    var conscientiousness: SpectrumEntry?
    var extraversion: SpectrumEntry?
    var agreeableness: SpectrumEntry?
    var emotionalSensitivity: SpectrumEntry?
}

struct SpectrumEntry: Codable, Equatable {
    let position: Double   // 0-100
    let label: String      // warm 1-sentence label
    let evidence: String   // grounding quote/observation
}

struct TopValue: Codable, Equatable {
    let value: String       // e.g. "Self-Direction"
    let description: String // warm 1-sentence description
}
```

### 5B. SoulFileScreen layout restructure

**File**: `Thumos/App/SoulFileScreen.swift`

New section order inside `soulFileFrame`:

```swift
VStack(spacing: 28) {
    titleSection
    if model.isSoulFileUpdating { loadingNotice }

    portraitSection                    // existing — no change

    compassSection                    // existing — make tappable (5B-i)

    personalitySpectrumSection        // NEW — spectrum bars (5B-ii)

    topValuesSection                  // NEW — value pills (5B-iii)

    relationalStyleSection            // NEW — narrative (5B-iv)

    soulSections                      // existing — make collapsible (5B-v)

    crystallizedMomentsSection        // existing — horizontal scroll (5B-vi)

    openThreadsSection                // existing — no change
}
```

### 5B-i. Tappable compass

**File**: `Thumos/App/SoulCompassView.swift`

Add `@State private var selectedAxis: String? = nil` and a tap gesture on each axis label. When tapped, show a detail card (bottom sheet or overlay) with:
- Axis name + score
- 1-sentence explanation (pulled from `compassScores` — we may need to add explanation strings to the data model, or derive them client-side from a static map)
- Evidence quote if available

For the first version, keep it simple: tap an axis label → toggle a small detail popover anchored to that label.

### 5B-ii. Personality spectrum bars

**New file**: `Thumos/App/PersonalitySpectrumView.swift`

Each Big Five trait as a horizontal bar with:
- Left pole label (warm name) — right pole label (warm name)
- A dot positioned at `position` on the 0-100 scale
- Tappable → shows `label` (the warm 1-sentence interpretation) and `evidence`

Pole labels (static, not from server):

| Trait | Left (0) | Right (100) |
|---|---|---|
| openness | Consistency | Curiosity |
| conscientiousness | Spontaneity | Structure |
| extraversion | Solitude | Engagement |
| agreeableness | Challenge | Harmony |
| emotionalSensitivity | Calm | Sensitive |

Visual style: Match the gold/amber accent color of the compass. Thin bar (2pt), dot (6pt circle), labels in `Theme.sans(11)`. Tap animation: dot pulses, explanation card slides in below the bar.

Only render traits that are non-null in `personalitySpectrum`.

### 5B-iii. Top values section

**New file**: `Thumos/App/TopValuesView.swift`

Display as horizontal pills/tags with warm descriptions:

```
┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐
│ Self-Direction   │  │  Universalism    │  │  Benevolence   │
└─────────────────┘  └──────────────────┘  └────────────────┘

"You orient toward personal freedom and concern for the
 broader world. When these compete, you lean toward..."
```

Pill style: rounded rect, `Theme.surface` background, `Theme.accent` text, small font. Description text below in `Theme.serif(16)`.

Only render when `topValues` is non-empty.

### 5B-iv. Relational style section

Simple narrative section (same style as existing soul sections):

```
RELATIONAL STYLE
"You connect through shared ideas first, then slowly open
 the door to vulnerability. When conflict arises, you tend
 to withdraw and process before re-engaging..."
```

Only render when `relationalStyle` is non-null and non-empty.

### 5B-v. Collapsible soul sections

Wrap each of the 7 soul sections in a `DisclosureGroup`:

```swift
DisclosureGroup {
    Text(content)
        .font(Theme.serif(18))
        .foregroundStyle(Theme.textSecondary)
        .multilineTextAlignment(.center)
        .lineSpacing(4)
} label: {
    Text(title)
        .font(Theme.sans(12, weight: .medium))
        .foregroundStyle(Theme.accent)
        .textCase(.uppercase)
        .tracking(1.5)
}
```

All collapsed by default. User taps to expand.

### 5B-vi. Horizontal scroll for crystallized moments

Replace the vertical stack with a horizontal `ScrollView(.horizontal)` of cards:

```swift
ScrollView(.horizontal, showsIndicators: false) {
    HStack(spacing: 12) {
        ForEach(...) { moment in
            VStack(spacing: 8) {
                Text("\"\(moment.quote)\"")
                    .font(Theme.serifItalic(15))
                Text(moment.reflection)
                    .font(Theme.serif(13))
            }
            .frame(width: 200)
            .padding(16)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
    .padding(.horizontal, 4)
}
```

---

## 6. Implementation Order

### Phase A — Schema + Migration (no UI changes yet)

1. Write DB migration `20260330_soul_dashboard_v2.sql`
2. Update `schemas.ts` — add all new fields to ReflectionNote, VisibleSoulFile, HiddenSoulFile
3. Update `soulFile.ts` — new empty constructors, parsers, merge functions for new fields
4. Update `soulApp.ts` — new row types, read/write for new columns
5. **Run tests** — all existing tests must pass (new fields default to empty/null)

### Phase B — Enriched reflection snapshots

6. Update `buildReflectionPrompt` with psychological signal fields
7. Update `parseReflectionNote` to handle new fields
8. Increase maxTokens 1400 → 2000
9. Add test: reflection with new fields parses correctly
10. **Run tests**

### Phase C — Multi-call synthesis

11. Add `buildAssessmentPrompt` + `parseAssessment`
12. Add `buildVisibleNarrativePrompt` + `parseVisibleNarrative`
13. Add `buildHiddenClinicalPrompt` + `parseHiddenClinical`
14. Update `runSoulSynthesis` to use 3-call pipeline with fallback
15. Add tests for each parser
16. **Run tests**

### Phase D — Conversation prompt updates

17. Add attachment-eliciting openers to soul.ts
18. Add moral foundation scenario prompts to steering
19. Add insight delivery mode to Inner Compass
20. **Run tests**

### Phase E — iOS UI

21. Update `Models.swift` with new Codable types
22. Build `PersonalitySpectrumView.swift`
23. Build `TopValuesView.swift`
24. Make `SoulCompassView` tappable
25. Make soul sections collapsible
26. Make crystallized moments horizontal scroll
27. Add relational style section
28. Wire new sections into `SoulFileScreen.swift`
29. **Build + test on simulator**

### Phase F — Deploy + verify

30. Deploy migration to Neon
31. Deploy workers via `wrangler deploy`
32. Trigger synthesis for a test user
33. Verify new fields populated correctly in debug dump
34. Verify iOS renders new sections

---

## 7. Test Plan

### Unit tests (Vitest)

- `parseAssessment` handles valid JSON, partial JSON, malformed JSON
- `parseVisibleNarrative` handles new fields + backward compat with old format
- `parseHiddenClinical` handles new fields + backward compat
- `parseReflectionNote` handles new signal fields + missing fields
- `mergeVisibleSoulFile` preserves existing fields when new fields are null
- `mergeHiddenSoulFile` preserves existing fields when new fields are null
- `buildAssessmentPrompt` produces valid prompt text
- `buildReflectionPrompt` includes new field instructions
- Existing tests continue to pass unchanged

### Integration tests

- `runSoulSynthesis` with 3-call pipeline produces valid output
- `runSoulSynthesis` falls back to single-call when assessment fails
- `runReflectionSnapshot` produces notes with new signal fields
- Full round-trip: reflection → synthesis → get-soul-file returns new fields

### iOS tests

- `VisibleSoulFile` decodes JSON with new fields present
- `VisibleSoulFile` decodes JSON with new fields absent (backward compat)
- `PersonalitySpectrum` decodes correctly
- `TopValue` array decodes correctly

---

## 8. Open Questions

1. **Compass scores vs personality spectrum** — there's overlap. The 8 compass axes (openness, vitality, warmth, depth, purpose, resilience, autonomy, connection) were designed before the research. The Big Five spectrum is scientifically grounded. Should we keep both? Or migrate compass scores to align with research frameworks?
   - **Recommendation**: Keep both for now. The compass is more "soul-flavored" (vitality, depth, purpose aren't Big Five). The spectrum is more "psychology-flavored." They serve different purposes. Revisit after user feedback.

2. **Should relationalStyle be in a dedicated section or merged into "How You Connect"?**
   - **Recommendation**: Dedicated section. "How You Connect" is poetic and existential. "Relational Style" is more structured and diagnostic. They complement each other.

3. **How specific should personality spectrum evidence strings be?** Full quotes vs. paraphrased observations?
   - **Recommendation**: Short paraphrased observations (max 100 chars). Full quotes are for crystallized moments. Spectrum evidence should be like: "You described 4 different creative projects in one conversation."

4. **Haiku vs Opus for hidden clinical call** — Is Haiku good enough?
   - **Recommendation**: Start with Haiku. The hard analytical work (scoring) is done in the assessment call (Opus). The hidden clinical call is mostly formatting and organizing. If quality is insufficient, promote to Sonnet.

5. **VISION.md brainstorm item #2** — sexual drives as a domain. This spec does NOT include it. It requires a separate design discussion about age gating, content moderation, and elicitation approach. The research papers don't address it directly. Flagging for future spec.
