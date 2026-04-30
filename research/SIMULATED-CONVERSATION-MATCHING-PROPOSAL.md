# Simulated Conversation Matching: Research Synthesis & Implementation Proposal

## 1. Research Synthesis

### 1.1 Papers Read

**RELATE-Sim** (ASU, 2024) — Two persona-aligned LLM agents interact under a centralized "Scene Master" that generates turning-point scenarios (exclusivity talks, relocations, betrayal events). Tracks 8 interpretable relational states (conflict, repair_outcome, clarity, constraints, alternatives, transition, network, breakup_marker). Uses Qwen3-32B backbone with ~34 LLM calls per scene. Evaluated on N=71 real couples with 2-year follow-ups: 64.4% accuracy on relationship outcomes vs 48.5% baseline. Key insight: **simulation-aware predictions significantly outperform persona-only baselines** — the dynamics of how two people interact reveal more than static trait comparison.

**Love First, Know Later** (BreathingCORE, 2024) — Introduces the "LLM text world engine" paradigm where the LLM serves as both persona-driven agents AND environment. Two simulation modes: Speed Dating (brief, getting-to-know-you) and Critical Events (pivotal scenarios). Each agent produces INNER_THOUGHT before RESPONSE, creating a richer signal. A separate "Love Observer" LLM evaluates the conversation transcript, producing three independent ratings: two participant self-ratings (r1, r2) and one observer rating (r3). Formalizes compatibility as a reward modeling problem and proves a convergence guarantee theorem — as LLM policies better approximate human behavior, compatibility predictions converge to optimal matching. Validated on Columbia Speed Dating dataset and Divorce Prediction dataset. Uses Gemini 2.5 Flash Lite for persona generation, Mistral-Nemo for simulation (temp 0.6).

**Generative Agent Simulations of 1,000 People** (Park et al., Stanford, 2024) — Created LLM agents from 2-hour interview transcripts that replicate General Social Survey responses 85% as accurately as humans replicate themselves. Big Five normalized correlation of 0.80. Interview-based agents outperform demographic-based and persona-based agents. Critical finding: **the richer the source material about a person, the more faithful the simulation**. Reduces accuracy biases across racial/ideological groups.

**LLM Personality Inference from Free-Form Chat** (Peters & Matz, Columbia, 2024) — LLMs can infer Big Five traits from 15-turn chat interactions with mean r=0.438-0.448 in assessment condition. No significant user experience degradation when chatbot probes personality. Validates that conversational data (which Thumos has in abundance) is sufficient for personality modeling.

**LLM Psychological Dispositions** (Pellert et al., PNAS Nexus, 2024) — LLMs infer Big Five from social media posts at r=0.29, comparable to supervised ML. Establishes that LLMs have baseline personality inference capability, though free-form conversation (Peters) performs substantially better.

**Proactive Agents with Inner Thoughts** (Liu et al., CHI 2025) — Framework for parallel "inner thought" streams in conversational agents. Uses intrinsic motivation scoring across 8 dimensions (relevance, information gap, expected impact, urgency, coherence, originality, balance, dynamics) to decide when and how to contribute. Relevant for designing the internal reasoning architecture of simulated agents.

### 1.2 Additional Research (Web Search)

**CogniPair** (2025) — GNWT-based multi-agent digital twins for social pairing. Creates cognitive sub-agents for emotion, memory, social norms, planning, and goal-tracking. Validated on 551 participants from Columbia Speed Dating dataset (5,500+ four-minute speed dates, 8,300+ observations): 72% correlation with real match patterns. Key insight: **cognitive architecture matters** — agents with structured emotion/memory/planning subsystems outperform flat prompt-based agents.

**LoveSims** (CHI EA '25, Yokohama) — Generative agent simulation framework for "what-if" romantic scenarios. 20 synthetic agents with iterative self-reflection and memory of prior dates. Evaluated using speed-dating behavioral science metrics. Found that simulated agents' attribute prioritization (attractiveness, shared interests, fun) aligns with real-person experiments.

**Big Five in LLM-Simulated Negotiation** (KDD 2025) — Using the Sotopia testbed, found that Agreeableness and Extraversion significantly affect simulated dialogue outcomes including believability and goal achievement. Validates that **personality traits meaningfully shape simulated conversations** in ways that align with real-world research.

### 1.3 Key Takeaways for Thumos

1. **Simulation beats static comparison.** RELATE-Sim shows 64.4% vs 48.5% accuracy gain. Love First proves convergence guarantees. The signal is in the interaction dynamics, not just the profiles.

2. **Thumos has a unique data advantage.** Park et al. shows interview-based agents are dramatically better. Thumos has 60+ message soul conversations — far richer than any 2-hour interview. The soul file (both visible and hidden) plus raw transcript provide exceptional persona material.

3. **Inner thoughts are valuable signal.** Both Love First (INNER_THOUGHT/RESPONSE) and Liu et al. (parallel thought stream) show that agent reasoning during conversation reveals compatibility dimensions invisible in surface dialogue.

4. **Multiple evaluation perspectives improve accuracy.** Love First's three-rating system (two participants + observer) provides richer signal than single-evaluator approaches. CogniPair's 72% correlation comes from multi-dimensional cognitive assessment.

5. **3-5 scenario types are sufficient.** RELATE-Sim uses turning-point theory (exclusivity, conflict, relocation, betrayal). Love First uses speed dating + critical events. Neither needs exhaustive scenario coverage — a focused set of well-chosen scenarios captures the essential dynamics.

6. **Cost is manageable.** RELATE-Sim uses ~34 calls per scene with a 32B model. Love First uses Flash Lite + Nemo (both cheap). For Thumos, running 3 focused scenarios at ~10 turns each = ~60 LLM calls, achievable with GLM-5 on Fireworks or Haiku.

---

## 2. Design Decisions

These decisions were confirmed with the product owner and drive the implementation below.

### 2.1 Eligibility Gate

A user is **eligible for the matching scan** when:
- **30+ messages** in their soul conversation (user messages only, not assistant)
- **80% soul file completeness** (`visibleSoulFile.completeness >= 0.80`)

Until both thresholds are met, the Connect tab shows a locked state explaining what's needed. This ensures the simulation has rich persona material to work with.

### 2.2 Selfie + Bio (Optional, Revealed on Match)

Users can optionally add:
- **Selfie** — camera-only capture (no image upload from library). This prevents catfishing while keeping friction low. Stored as a URL (e.g., R2 bucket).
- **Bio** — free-text field, short (280 chars max).

**Privacy**: Selfie and bio are **only revealed to matched users** — never shown during the scan phase, never visible to non-matches. The soulmate profile setup screen should clearly communicate: *"Your photo and bio are private. They're only shown to people you're matched with."*

These fields live on `soulmate_profiles` and are NOT required for matching eligibility. A user without a selfie/bio can still be matched; their match card simply shows display name + reasoning.

### 2.3 Reasoning: "Virtual World" Framing

The user-facing reasoning should:
- **Explicitly reference that we ran a simulation** — "We put versions of you into a virtual world to see what would happen." This is the product's differentiator and should be front-and-center, not hidden.
- **Stay vague but intriguing** — Reference observed dynamics ("something about the way they handled a quiet disagreement"), never specific soul file content ("your anxious attachment style paired well with their secure style").
- **Never disclose soul file details** — No traits, values, scores, dimensions, labels, or direct quotes from either user's soul file.
- **Feel like a story, not a report** — Warm prose grounded in simulated interaction moments.

### 2.4 Scan Pipeline: Score → Queue Per-User Reasoning

The daily cron scan does:
1. **Simulation** — Run 3 scenes, score with Love Observer → produces `match_score` (0-100) + `connection_zones` + `key_moments` (internal, not user-facing)
2. **Write match** — INSERT into `matches` with score, connection_zones, and raw evaluation blob. `reasoning_a` and `reasoning_b` are NULL at this point.
3. **Queue 2 reasoning jobs** — Enqueue `match_reasoning` jobs for user A and user B separately. Each job generates warm prose in that user's language, referencing the key moments from the simulation. Jobs write to `matches.reasoning_a` / `matches.reasoning_b`.

This decouples the expensive simulation from the per-user reasoning generation, and naturally handles i18n — each job writes directly in the user's `users.language`.

The `get-matches` endpoint returns `reasoning_a` or `reasoning_b` depending on which user is requesting.

### 2.5 No Currency / No Pre-filter (For Now)

No scan currency, credits, or rate limits at this stage. Every eligible pair gets the full simulation. Pre-filter optimization (cheap screen → expensive simulation for top candidates) can be added later when scale demands it.

---

## 3. Proposed Implementation

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     DAILY MATCHING CRON                          │
│  (runMatchingPipeline — eligibility: 30 msgs + 80% complete)    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  For each (userA, userB) candidate pair:                        │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  STEP 1: Build Personas                                   │  │
│  │  hiddenSoulFile + visibleSoulFile + voice →               │  │
│  │  PersonaSynopsis for each user                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  STEP 2: Run Simulated Scenes (3 scenarios in parallel)   │  │
│  │  Agent A (THINK + SPEAK) ↔ Agent B (THINK + SPEAK)        │  │
│  │  5-8 turns per scene                                      │  │
│  │  Produces: 3 conversation transcripts + inner thoughts    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  STEP 3: Score (Love Observer)                            │  │
│  │  Observer LLM reads all 3 transcripts + inner thoughts →  │  │
│  │  match_score + connection_zones + key_moments             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  STEP 4: Write match row                                  │  │
│  │  INSERT matches (score, connection_zones, raw_evaluation)  │  │
│  │  reasoning_a = NULL, reasoning_b = NULL                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  STEP 5: Queue 2 reasoning jobs                           │  │
│  │  Job A: generate reasoning for userA in userA's language  │  │
│  │  Job B: generate reasoning for userB in userB's language  │  │
│  │  Each writes to matches.reasoning_a / reasoning_b         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Eligibility Query

```sql
-- Find users eligible for matching scan
SELECT u.id, u.language, sp.display_name
FROM users u
JOIN soulmate_profiles sp ON sp.user_id = u.id
JOIN visible_soul_files vsf ON vsf.user_id = u.id AND vsf.status = 'ready'
WHERE vsf.completeness >= 0.80
  AND (SELECT COUNT(*) FROM soul_messages sm
       WHERE sm.user_id = u.id AND sm.role = 'user') >= 30
```

This replaces the current completeness-only check in `matchingPipeline.ts`.

### 3.3 Simulated Conversation Flow

#### Persona Construction

Each user's persona is built from their **hidden soul file** (clinical assessment, voice profile, attachment/conflict profiles, core drivers, expert reflections) plus **visible soul file** (narrative sections, values, personality spectrum, compass scores). The hidden file provides the richest behavioral model — particularly the `voice` object (register, density, humor style, conflict style, disclosure rate, signature patterns, voice examples) which gives the LLM concrete stylistic anchors.

```typescript
interface PersonaSynopsis {
  name: string;                    // display_name from soulmate_profiles
  coreIdentity: string;            // from visible portrait + hidden analyst notes
  attachmentStyle: string;         // from hidden attachmentAssessment
  conflictProfile: string;         // from hidden conflictProfile
  voiceProfile: VoiceProfile;      // from hidden voice (register, humor, density, etc.)
  coreDrivers: CoreDriver[];       // from hidden coreDrivers
  coreValues: string[];            // from hidden coreValues
  loveSignature: string;           // from visible loveSignature
  relationalStyle: string;         // from visible relationalStyle
  personalityHighlights: string[]; // from visible personalitySpectrum
  compassSnapshot: Record<string, number>; // from visible compassScores
}
```

The persona prompt:

```
You are {name}, a real person having a genuine conversation. Here is who you are:

## Your Inner World
{coreIdentity}
Your deepest drivers: {coreDrivers formatted}
Your core values: {coreValues}

## How You Connect
Attachment: {attachmentStyle}
In conflict: {conflictProfile}
Your love signature: {loveSignature}
Your relational style: {relationalStyle}

## Your Voice
Register: {register} | Density: {density}
Humor: {humorStyle}
When things get hard: {conflictStyle}
How quickly you open up: {disclosureRate}
Patterns: {signaturePatterns}
Examples of your voice:
{voiceExamples formatted as trigger → response pairs}

## Personality
{personalityHighlights}

RULES:
- Speak naturally in your voice. Use the examples as style anchors.
- Your thoughts (THINK) should reflect your real internal experience.
- Your speech (SPEAK) is what you'd actually say aloud.
- Do NOT be artificially agreeable. If something doesn't sit right, show it.
- Do NOT reveal you are a simulation.
```

#### Scenario Selection

Drawing from RELATE-Sim's turning-point theory and Love First's dual-mode approach, three scenario types capture the essential compatibility dynamics:

| Scenario | What It Tests | Mapped Domains |
|----------|--------------|----------------|
| **First Date** | Chemistry, playfulness, curiosity, conversational flow | daily_rhythm, play_and_joy |
| **Vulnerability Moment** | Emotional depth, holding space, disclosure reciprocity | vulnerability_and_trust, love_language |
| **Friction Point** | Conflict style, repair ability, values under pressure | conflict_and_repair, values_and_worldview, partnership_vision |

Scene setups:

**First Date**: "You're at a quiet wine bar on a Tuesday evening. You've been texting for a week and this is your first time meeting in person. {Name A} arrives first. The conversation begins."

**Vulnerability Moment**: "You've been dating for three months. {Name A} just got difficult news about a family member and is telling {Name B} about it over the phone late at night."

**Friction Point**: "You've been together for six months. {Name B} just found out {Name A} made a significant decision (changing jobs / canceling a trip you'd planned together) without discussing it first. You're in the car together driving home."

#### Turn Structure

Each turn follows the INNER_THOUGHT + RESPONSE pattern from Love First:

```
SCENE: {scenario description}
TURN {n} — {Name}'s turn

[Previous dialogue so far]

As {Name}, produce:
THINK: [1-3 sentences of internal experience — what you're feeling, noticing, wanting]
SPEAK: [What you actually say — in your natural voice, 1-4 sentences]
```

Each scene runs for **5-8 turns** (alternating, so each agent speaks 3-4 times). Scenes run in **parallel** — they are independent scenarios, not a sequential story.

#### Total LLM Call Budget

Per candidate pair:
- Persona construction: 0 LLM calls (derived from existing soul files)
- Agent turns (3 scenarios x 8 turns): 24 calls (parallelized across scenes)
- Love Observer scoring: 1 call
- **Per-user reasoning: queued separately (2 calls, async)**

**Synchronous total: ~25 LLM calls per pair**
**Async queue: 2 additional calls per match (only for pairs that pass)**

At GLM-5 on Fireworks pricing (~$0.20/M input, ~$0.80/M output) with ~500 tokens per agent call and ~2000 tokens for observer, estimated cost is **~$0.02-0.04 per pair evaluation** + ~$0.002 per reasoning job.

### 3.4 Scoring from Conversation

The Love Observer receives all three conversation transcripts (including THINK blocks from both agents) and produces a structured evaluation:

```typescript
export const simulatedMatchScoreSchema = z.object({
  // Per-scenario assessments
  scenes: z.array(z.object({
    scenario: z.enum(["first_date", "vulnerability_moment", "friction_point"]),

    // Interaction dynamics (only visible through simulation)
    conversationalFlow: z.number().min(0).max(100),
    emotionalResonance: z.number().min(0).max(100),
    repairCapacity: z.number().min(0).max(100),

    // Emergent signals
    signals: z.array(z.object({
      type: z.enum([
        "spark",           // genuine excitement/curiosity
        "attunement",      // reading and responding to the other's state
        "mismatch",        // talking past each other
        "repair",          // recovering from a rupture
        "deepening",       // voluntary move toward vulnerability
        "withdrawal",      // pulling back under pressure
        "playfulness",     // shared humor / lightness
        "co_regulation"    // calming each other down
      ]),
      turn: z.number(),
      evidence: z.string()
    }))
  })),

  // Aggregate dimension scores
  dimensions: z.object({
    attachmentFit: z.number().min(0).max(100),
    conflictCompatibility: z.number().min(0).max(100),
    loveLanguageResonance: z.number().min(0).max(100),
    lifestyleAlignment: z.number().min(0).max(100),
    emotionalDepthMatch: z.number().min(0).max(100),
    valuesAlignment: z.number().min(0).max(100),
    playCompatibility: z.number().min(0).max(100),
    conversationalChemistry: z.number().min(0).max(100),
    coRegulationCapacity: z.number().min(0).max(100)
  }),

  // Connection zones (2-4 selected from vocabulary)
  connectionZones: z.array(z.object({
    zone: z.string(),
    strength: z.number().min(0).max(100),
    evidence: z.string()    // internal — not shown to users
  })),

  // Overall
  overallScore: z.number().min(0).max(100),
  decision: z.enum(["match", "no_match"]),

  // Raw material for per-user reasoning generation (internal only)
  keyMoments: z.array(z.object({
    scenario: z.string(),
    turn: z.number(),
    description: z.string(),
    significance: z.string()
  }))
});
```

The Love Observer prompt:

```
You are the Love Observer — a perceptive relationship scientist watching three
simulated encounters between {nameA} and {nameB}. You have access to both
their spoken words and their private thoughts.

Your job is to assess romantic compatibility based on what you WITNESSED in
the interaction — not just what their profiles say, but how they actually
showed up with each other.

Pay special attention to:
- Do their inner thoughts (THINK) align or diverge from their words (SPEAK)?
- When one person is vulnerable, does the other move toward or away?
- When tension arises, do they repair or withdraw?
- Is there genuine playfulness and curiosity, or performative niceness?
- Do they match each other's emotional depth, or does one consistently
  under/over-shoot?

Agreeableness bias warning: Two people can be very polite and pleasant
together but deeply incompatible. Niceness is not chemistry. Look for
TENSION and how they handle it — that's where compatibility lives.

{transcripts of all 3 scenes with THINK/SPEAK blocks}

Score their compatibility using the provided JSON schema.
```

### 3.5 Per-User Reasoning Generation (Queued)

After the scan writes a match row, **two separate jobs** are queued — one per user. Each job generates warm prose in that user's language.

New job type: `match_reasoning`

```typescript
// Job payload
interface MatchReasoningJob {
  type: "match_reasoning";
  matchId: string;
  targetUserId: string;      // which user this reasoning is for
  targetField: "reasoning_a" | "reasoning_b";
  targetLanguage: string;    // from users.language
}
```

The reasoning prompt — note the "virtual world" framing:

```
You are writing a warm, evocative explanation of why two people were matched.
The match was discovered by simulating conversations between AI versions of
these two people in a virtual world — observing how they naturally interact
across different scenarios.

Write for {targetName}, in {targetLanguage}.

VOICE & FRAMING:
- Open with something like: "We created versions of you both in a virtual
  world — and something interesting happened." (Vary the phrasing.)
- Reference what the simulation REVEALED about their dynamic, not what
  their profiles say.
- Stay vague but intriguing — "something about the way they navigated a
  quiet disagreement" rather than "their secure attachment style complemented
  your anxious style."
- The reader should feel curiosity and warmth, like hearing about a dream
  they half-remember.

ABSOLUTE RULES:
- NEVER mention scores, percentages, dimensions, axes, or technical terms
- NEVER quote or reference soul file content, traits, values, or labels
- NEVER name specific personality frameworks (Big Five, attachment theory, etc.)
- NEVER use the word "simulation" after the opening — say "virtual world"
- Write 3-5 sentences total
- Write entirely in {targetLanguage}

CONNECTION ZONES: {connectionZones — zone names + evidence}
KEY MOMENTS: {keyMoments from observer evaluation}
DIMENSION SUMMARY:
  Strongest: {top 2-3 dimensions by score}
  Weakest: {bottom 2-3 dimensions}
```

### 3.6 Connection Zones

Connection zones are named patterns of relational strength that emerge from the simulated conversations. The observer selects 2-4 from this vocabulary:

| Zone | Description | What triggers it |
|------|-------------|-----------------|
| **Playful Explorers** | You both light up when discovering new things together | High play compatibility + chemistry in first date |
| **Storm Weatherers** | When things get hard, you actually get closer | Strong repair + co-regulation in friction point |
| **Deep Divers** | You match each other's emotional depth without drowning | High emotional resonance in vulnerability moment |
| **Gentle Challengers** | You push each other to grow, but always with warmth | Tension + repair + deepening signals across scenes |
| **Safe Harbor** | Something about being together feels immediately calming | Co-regulation + attunement signals across scenes |
| **Spark Igniters** | The chemistry between you is unmistakable | High spark + playfulness signals in first date |
| **Value Anchors** | What matters most to you aligns at the deepest level | Strong values alignment + vulnerability deepening |
| **Rhythm Keepers** | Your daily energies and lifestyles naturally fit | High lifestyle alignment + conversational flow |

Stored as JSONB on the `matches` table. Displayed as the connection lines in `MatchVisualizationView` — each zone becomes a line, zone strength maps to line count.

### 3.7 Selfie + Bio

#### iOS Flow

In `SoulmateProfileSetupView`, after display name / age / gender / preferences:
- **"Add a photo"** button → opens camera only (`UIImagePickerController` with `sourceType: .camera`). No photo library access.
- **"Write a short bio"** → `TextField` with 280 char limit.
- Clear privacy message: *"Your photo and bio are private — only people you're matched with can see them."*

Both fields are optional. The profile can be submitted without them.

#### Display

In `SoulmateMatchesView` match rows and `MatchReasoningSheet`:
- If the matched user has a selfie, show it as a small circular avatar.
- If the matched user has a bio, show it below the display name in the match detail.
- If neither exists, show display name + reasoning only (current behavior).

#### Storage

Selfie is uploaded to R2 (Cloudflare's S3-compatible storage) and the URL is stored on `soulmate_profiles.selfie_url`. The `soulmate-profile` handler gains a multipart upload path for the selfie.

### 3.8 Architecture & Integration

#### New Files

```
src/domain/
  simulatedMatch.ts          — Persona builder, scenario definitions, observer prompt,
                               scoring schema, reasoning prompt, connection zone vocabulary

workers/src/
  simulatedMatchPipeline.ts  — Orchestrates: buildPersonas → runScenes → scoreWithObserver
                               Returns score + zones + key_moments (no reasoning yet)

db/migrations/
  20260413_simulated_matching.sql — See migration below
```

#### Modified Files

```
workers/src/matchingPipeline.ts    — Eligibility gate (30 msgs + 80%), call simulatedMatchPipeline
workers/src/modelProfiles.ts       — New task types: match_simulation, match_observer, match_reasoning
workers/src/backgroundJobsQueue.ts — New job type: match_reasoning
workers/src/matchApp.ts            — Return correct reasoning_{a|b} per requesting user,
                                     return selfie_url + bio for matched users
workers/src/handlers/soulmate-profile.ts — Selfie upload (multipart) + bio field
workers/src/handlers/get-matches.ts      — Return selfie_url + bio of matched user
```

#### New Model Tasks

```typescript
// Added to ModelTask type
| "match_simulation"    // Agent turns in simulated conversation
| "match_observer"      // Love Observer scoring
| "match_reasoning"     // Per-user reasoning prose generation

// Suggested configs:
match_simulation: {
  provider: "fireworks_openai",
  model: "accounts/fireworks/models/glm-5",
  maxTokens: 512,
  temperature: 0.7       // natural conversation variance
},
match_observer: {
  provider: "fireworks_openai",
  model: "accounts/fireworks/models/glm-5",
  maxTokens: 4096,       // structured evaluation is verbose
  temperature: 0.2       // analytical, low variance
},
match_reasoning: {
  provider: "fireworks_openai",
  model: "accounts/fireworks/models/glm-5",
  maxTokens: 512,
  temperature: 0.6       // warm prose, some creativity
}
```

#### Pipeline Flow (Pseudocode)

```typescript
async function runMatchingPipeline(sql: NeonSQL, env: Env, ctx: ExecutionContext) {
  // 1. Find eligible users (30+ user messages AND 80% completeness)
  const eligible = await getEligibleUsers(sql); // see section 3.2

  // 2. For each user, find candidate matches (existing geo + preference filters)
  for (const user of eligible) {
    const candidates = await getCandidates(sql, user);
    let matchesThisRun = 0;

    for (const candidate of candidates) {
      if (matchesThisRun >= 2) break; // cap per user per run

      // 3. Run simulation (synchronous — ~5-8s per pair with parallel scenes)
      const result = await evaluateMatchSimulated(sql, env, user, candidate);

      if (result.decision === "match") {
        // 4. Write match row (reasoning fields NULL)
        const matchId = await insertMatch(sql, {
          userAId: user.id,
          userBId: candidate.id,
          score: result.overallScore,
          connectionZones: result.connectionZones,
          rawEvaluation: result.rawEvaluation, // internal blob for debugging
          reasoningA: null,
          reasoningB: null,
        });

        // 5. Queue per-user reasoning jobs
        await enqueueJob(sql, {
          type: "match_reasoning",
          matchId,
          targetUserId: user.id,
          targetField: "reasoning_a",
          targetLanguage: user.language,
        });
        await enqueueJob(sql, {
          type: "match_reasoning",
          matchId,
          targetUserId: candidate.id,
          targetField: "reasoning_b",
          targetLanguage: candidate.language,
        });

        matchesThisRun++;
      }
    }
  }
}

async function evaluateMatchSimulated(
  sql: NeonSQL,
  env: Env,
  userA: EligibleUser,
  userB: EligibleUser
): Promise<SimulationResult> {
  // 1. Load both soul files (visible + hidden)
  const [visA, hidA, visB, hidB] = await Promise.all([
    getVisibleSoulFile(sql, userA.id),
    getHiddenSoulFile(sql, userA.id),
    getVisibleSoulFile(sql, userB.id),
    getHiddenSoulFile(sql, userB.id)
  ]);

  // 2. Build personas
  const personaA = buildPersonaSynopsis(userA.displayName, visA, hidA);
  const personaB = buildPersonaSynopsis(userB.displayName, visB, hidB);

  // 3. Run 3 simulated scenes IN PARALLEL
  const [firstDate, vulnerability, friction] = await Promise.all([
    runScene(env, personaA, personaB, "first_date"),
    runScene(env, personaA, personaB, "vulnerability_moment"),
    runScene(env, personaA, personaB, "friction_point"),
  ]);
  const transcripts = [firstDate, vulnerability, friction];

  // 4. Score with Love Observer
  const evaluation = await scoreWithObserver(env, userA.displayName, userB.displayName, transcripts);

  // 5. Optionally store simulation trace for debugging
  if (env.ENABLE_DEBUG_TRACES === "true") {
    await storeSimulationTrace(sql, userA.id, userB.id, transcripts, evaluation);
  }

  return {
    decision: evaluation.decision,
    overallScore: evaluation.overallScore,
    connectionZones: evaluation.connectionZones,
    rawEvaluation: evaluation, // stored as JSONB for future reference
  };
}

// Queue consumer for match_reasoning jobs
async function processMatchReasoningJob(
  sql: NeonSQL,
  env: Env,
  job: MatchReasoningJob
) {
  const match = await getMatchById(sql, job.matchId);
  const reasoning = await generateUserReasoning(
    env,
    match.rawEvaluation.keyMoments,
    match.rawEvaluation.connectionZones,
    match.rawEvaluation.dimensions,
    job.targetLanguage
  );

  await sql`
    UPDATE matches
    SET ${sql(job.targetField)} = ${reasoning}
    WHERE id = ${job.matchId}
  `;
}
```

#### Database Migration

```sql
-- 20260413_simulated_matching.sql

-- Evolve matches table for simulation-based matching
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS score integer,
  ADD COLUMN IF NOT EXISTS connection_zones JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_evaluation JSONB,
  ADD COLUMN IF NOT EXISTS reasoning_a text,     -- reasoning for user_a in their language
  ADD COLUMN IF NOT EXISTS reasoning_b text;      -- reasoning for user_b in their language
-- Note: existing `reasoning` column kept for backward compat with old clients.
-- New clients read reasoning_a / reasoning_b. Old clients read reasoning (NULL for new matches).

-- Selfie + bio on soulmate profiles
ALTER TABLE soulmate_profiles
  ADD COLUMN IF NOT EXISTS selfie_url text,
  ADD COLUMN IF NOT EXISTS bio text;

-- Optional: simulation trace storage for debugging
CREATE TABLE IF NOT EXISTS simulation_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES users(id),
  user_b_id UUID NOT NULL REFERENCES users(id),
  transcripts JSONB NOT NULL,
  evaluation JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_simulation_traces_users
  ON simulation_traces (user_a_id, user_b_id);
```

#### iOS Model Changes

```swift
// Updated SoulmateMatch — additive, backward compatible
struct SoulmateMatch: Codable, Identifiable, Equatable, Hashable {
    let matchId: String
    let matchedUserId: String
    let displayName: String
    let matchedAt: String
    let reasoning: String?          // per-user reasoning in their language
    let score: Int?                 // 0-100
    let connectionZones: [MatchConnectionZone]?
    let selfieUrl: String?          // matched user's selfie (only if they have one)
    let bio: String?                // matched user's bio

    var id: String { matchId }

    enum CodingKeys: String, CodingKey {
        case matchId = "match_id"
        case matchedUserId = "matched_user_id"
        case displayName = "display_name"
        case matchedAt = "matched_at"
        case reasoning
        case score
        case connectionZones = "connection_zones"
        case selfieUrl = "selfie_url"
        case bio
    }
}

struct MatchConnectionZone: Codable, Equatable, Hashable {
    let zone: String
    let strength: Int
}
```

#### API Response (get-matches)

The `get-matches` handler determines which user is requesting and returns the appropriate reasoning:

```typescript
// In get-matches handler
const matches = await getMatches(sql, userId);
return matches.map(m => ({
  match_id: m.id,
  matched_user_id: m.userAId === userId ? m.userBId : m.userAId,
  display_name: matchedProfile.display_name,
  matched_at: m.createdAt,
  // Return the correct per-user reasoning
  reasoning: m.userAId === userId ? m.reasoningA : m.reasoningB,
  score: m.score,
  connection_zones: m.connectionZones,
  // Only include selfie/bio of the OTHER user
  selfie_url: matchedProfile.selfie_url,
  bio: matchedProfile.bio,
}));
```

### 3.9 Translation / i18n

1. **Simulation language**: When both users share a language, run in that language. When they differ, run in English as lingua franca, preserving voice profile characteristics (humor style, density, register).

2. **Observer evaluation**: Always runs in English. Structured scoring schema is language-independent.

3. **Per-user reasoning**: Each reasoning job writes directly in the target user's language via the `match_reasoning` queue job. One LLM call per user. No separate translation step needed.

4. **Cross-language simulation**: The observer evaluates interaction dynamics (turn-taking, repair, depth) which are largely language-independent. Cultural nuance is partially captured in the values alignment dimension.

---

## 4. Phased Rollout

### Phase 1: Foundation
- Eligibility gate (30 msgs + 80% completeness) in `matchingPipeline.ts`
- `PersonaSynopsis` builder from existing soul files
- 3 scenario templates with scene setup prompts
- `runScene()` with THINK/SPEAK turn generation
- Unit tests with mocked LLM calls

### Phase 2: Scoring + Storage
- Love Observer prompt and `simulatedMatchScoreSchema`
- `scoreWithObserver()` with structured output
- Migration: `score`, `connection_zones`, `raw_evaluation`, `reasoning_a`, `reasoning_b` on matches
- `match_reasoning` job type in background queue

### Phase 3: Per-User Reasoning + Integration
- Reasoning queue consumer with "virtual world" framing prompt
- Wire full pipeline into `matchingPipeline.ts`
- `get-matches` returns per-user reasoning + connection zones
- Integration tests

### Phase 4: Selfie + Bio
- Migration: `selfie_url`, `bio` on soulmate_profiles
- R2 upload for selfie (camera-only)
- `SoulmateProfileSetupView` — camera capture + bio field + privacy message
- `get-matches` returns selfie_url + bio of matched user
- `SoulmateMatchesView` — avatar + bio display

### Phase 5: iOS Visualization
- `MatchVisualizationView` reads real connection zones from match data
- Connection zone names as labels, strength as line count
- Remove mock data, wire to `match.connectionZones`

---

## 5. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Latency** — 25 LLM calls per pair | Run 3 scenes in parallel: ~5-8s per pair. MAX_MATCHES_PER_RUN=2, worst case ~40 pairs = ~5 min. Acceptable for daily cron. |
| **Agreeableness bias** — Agents too nice, everyone matches | Explicit anti-agreeableness in persona prompt. Observer warns about this. Friction scenario specifically tests conflict handling. |
| **Voice fidelity** — Agents don't sound like the real person | Voice profile provides concrete anchors (register, examples). Test with dry-run characters (Fred Rogers vs Anthony Bourdain should produce dramatically different conversations). |
| **Cost** — ~$0.03/pair with no pre-filter | At 100 evaluations/day = $3/day. Acceptable at current scale. Add pre-filter later if needed. |
| **Soul file quality** — Thin soul files → bland simulations | Eligibility gate at 80% completeness + 30 messages ensures rich persona material. |
| **Reasoning leaks soul file content** | Reasoning prompt has absolute rules against mentioning traits/values/labels. Key moments are abstracted from the simulation, not the soul files. |
| **Cross-language quality** | Accept as known limitation. Most compatibility signals are universal. |
| **Reasoning not ready when user opens match** | `reasoning_a`/`reasoning_b` may be NULL briefly after match creation. iOS shows "We're still writing your story..." placeholder. Reasoning jobs typically complete in <5s. |

---

## Sources

- [RELATE-Sim: Turning Point Theory and LLM Agents](https://arxiv.org/pdf/2510.00414)
- [Love First, Know Later: Persona-Based Romantic Compatibility](https://arxiv.org/pdf/2512.11844)
- [Generative Agent Simulations of 1,000 People (Stanford HAI)](https://hai.stanford.edu/news/ai-agents-simulate-1052-individuals-personalities-with-impressive-accuracy)
- [CogniPair: Dynamic LLM Matching Algorithm](https://openreview.net/forum?id=Xz5J6Hj9cH)
- [CogniPair: From LLM Chatbots to Conscious AI Agents](https://arxiv.org/abs/2506.03543)
- [LoveSims: What-If Scenarios for Relationship Insights (CHI '25)](https://dl.acm.org/doi/10.1145/3706599.3720011)
- [Big Five Personality Effects in LLM-Simulated Negotiation](https://arxiv.org/abs/2506.15928)
- [LLM Psychological Dispositions (Pellert et al., PNAS Nexus)](https://arxiv.org/pdf/2407.10989)
- [Proactive Agents with Inner Thoughts (Liu et al., CHI 2025)](https://dl.acm.org/doi/pdf/10.1145/3706599.3720011)
- [Manifold: Will a major dating app use LLMs to simulate conversations?](https://manifold.markets/CDBiddulph/will-a-major-dating-app-use-llms-to)
- [Beyond Discrete Personas: Personality Modeling (COLING 2025)](https://aclanthology.org/2025.coling-main.470.pdf)
- [Interaction Dynamics as Reward Signal for LLMs](https://www.arxiv.org/pdf/2511.08394)
