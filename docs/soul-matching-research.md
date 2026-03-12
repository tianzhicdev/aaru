# Soul Matching: Psychology Research & Design Spec

Research-backed design for AARU's soul profile, Ka conversation, and impression scoring systems.

---

## 1. Soul Profile Structure

The current profile (`personality` + `interests[]` + `values[]`) is too thin. Psychology identifies **3 layers** of identity (McAdams), and compatibility research shows we're overweighting the weakest predictor (shared interests) while ignoring the strongest ones (responsiveness, shared values, narrative depth).

### What Actually Predicts Compatibility

| Signal | Predictive Power | Source |
|--------|-----------------|--------|
| Perceived responsiveness | **Highest** | Reis (2004) |
| Shared values | **Very high** (beta=0.38) | Schwartz value theory |
| Conversation quality | **High** | Social Penetration Theory |
| Emotional stability | **Moderate** (r=-0.26) | Big Five meta-analysis |
| Shared interests | **Moderate** | Byrne similarity-attraction |
| Stated preferences | **Weak** | Eastwick (2024, n=10,358) |

### Key Research Insights

**Narrative Identity (McAdams)**: People define themselves through stories, not trait lists. Formative anecdotes ("the summer I spent alone in Tokyo") create meaning and intimacy in conversation. The Ka saying *"my human keeps thinking about that tiny kitchen in Tokyo"* beats *"I'm interested in cooking"* every time.

**Schwartz Values Theory**: 10 universal values arranged in a circle. Adjacent values are compatible (benevolence + universalism); opposing values conflict (power vs universalism). Four higher-order dimensions enable mathematical compatibility scoring.

**Stated vs Revealed Preferences (Eastwick 2024)**: Massive gaps between what people say they want and what actually predicts attraction. AARU should track *implicit behavioral signals* (what topics make the Ka more engaged, which conversations go longer) and weight these increasingly over time.

**Attachment Theory**: ~50% secure, rest anxious/avoidant. Anxious-avoidant pairings create destructive push-pull. Track attachment signals implicitly from Ka behavior (disclosure pace, reassurance seeking, vulnerability comfort) — never self-reported.

**Love Languages (Chapman)**: Lack empirical support — couples with matching languages are no more satisfied. Don't use for matching, but useful as conversation scaffolding.

### Proposed Soul Profile

```typescript
interface SoulProfile {
  // Layer 1: Personality voice (how Ka speaks)
  personality: string;

  // Layer 2: Values (Schwartz-aligned + free text)
  values: {
    self_transcendence: number;   // 0-1 (universalism, benevolence)
    self_enhancement: number;     // 0-1 (achievement, power)
    openness_to_change: number;   // 0-1 (self-direction, stimulation)
    conservation: number;         // 0-1 (security, tradition)
    expressed: string[];          // free text for Ka conversation color
  };

  // Layer 3: Narrative identity (KEY ADDITION)
  narrative: {
    formative_stories: string[];      // 2-3 user-provided anecdotes
    self_defining_memories: string[]; // core emotional moments
    narrative_themes: string[];       // agency, communion, redemption
  };

  // Layer 4: Interests & boundaries
  interests: string[];
  avoid_topics: string[];
  dealbreakers: string[];   // 1-3 hard nos (prevents Ka encounters)

  // Layer 5: Attachment signals (INFERRED over time, not self-reported)
  attachment_signals: {
    disclosure_pace: "slow" | "moderate" | "fast";
    bid_responsiveness: number;     // 0-1, Gottman's key metric
    vulnerability_comfort: number;  // 0-1
  };

  // Meta
  raw_input: string;
  guessed_fields: string[];
  profile_confidence: number;  // 0-1, grows with more data
}
```

---

## 2. Conversation Design

### Key Research

**Jeffrey Hall (2018)**: ~50 hours to become casual friends, ~200 for close friends. Only social/emotional time counts, not task-based interaction.

**Mere Exposure Effect (Zajonc)**: Peaks at 10-20 exposures. Short, frequent encounters build familiarity faster than rare long ones. Directly supports AARU's wandering-agents mechanic.

**Social Penetration Theory (Altman & Taylor)**: Relationships progress through 4 depth stages. Reciprocity drives progression — each person matches the other's disclosure depth before advancing.

**Aron's 36 Questions**: Structured, escalating self-disclosure over 45 minutes dramatically increases closeness. The mechanism is *reciprocal vulnerability*, not the specific questions. The Ka should naturally gravitate toward these themes at the right depth level.

**Online Dating Research**: ~27 messages before phone exchange is optimal. Too few = no connection. Too many = idealized fantasy that disappoints on meeting.

**Gottman's Bid Mechanics**: Couples who stayed together turned toward emotional bids 86% of the time; divorced couples only 33%. The 5:1 positive-to-negative ratio during conflict predicts success.

### Proposed Conversation Phases

```
Phase 1 — DISCOVERY (encounters 1-5)
  Messages per conversation: 6
  Topics: interests, favorites, light opinions
  Ka style: "What draws you to X?"
  Goal: mere exposure, basic familiarity

Phase 2 — DEEPENING (encounters 6-12)
  Messages per conversation: 10
  Topics: personal experiences, formative stories
  Ka shares anecdotes from narrative layer
  Ka references previous conversations
  Goal: reciprocal self-disclosure

Phase 3 — INTIMATE (encounters 13+)
  Messages per conversation: 14-16
  Topics: values, beliefs, fears, aspirations
  Ka draws on self-defining memories
  Goal: emotional depth, Ba unlock territory
```

**Reciprocity gate**: Both Kas must have disclosed at the current depth before advancing. If one shares a story and the other deflects, stay at current depth.

**Depth topic tiers** (inspired by Aron's 36 Questions):
- Tier 1: "If you could have dinner with anyone..." / "What would a perfect day look like?"
- Tier 2: "What's your most treasured memory?" / "How do love and affection show up in your life?"
- Tier 3: "When did you last cry?" / "What's too serious to joke about?"

The Ka doesn't ask these directly (that's an interview). These themes inform the Ka's conversational instincts at the appropriate depth level.

### Constants

```typescript
const EARLY_PHASE_MESSAGES = 6;       // conversations 1-5
const MIDDLE_PHASE_MESSAGES = 10;     // conversations 6-12
const DEEP_PHASE_MESSAGES = 16;       // conversations 13+
const ENCOUNTER_SWEETSPOT = 15;       // peak mere exposure benefit
const OPTIMAL_BA_UNLOCK_MESSAGES = 30; // ~27 from dating research
```

---

## 3. Impression Scoring

### Current Problem

The existing scorer overweights interest keyword overlap (weakest predictor) and the Zod schema was truncating Groq's evaluation summaries, causing silent fallback to heuristics in production.

### Research-Backed Weighting

| Signal | Weight | How to Measure |
|--------|--------|----------------|
| **Responsiveness** | 30% | Does Ka reference other's details? Validate before diverging? Show warmth? (Reis) |
| **Values alignment** | 25% | Schwartz dimension distance + expressed overlap |
| **Conversation quality** | 20% | Depth progression, balanced disclosure, questions asked |
| **Interest overlap** | 10% | Shared topic keywords |
| **Novelty / complementarity** | 10% | Unexpected connections, complementary traits |
| **Emotional stability** | 5% | Conflict handling, consistency |

### Responsiveness Scoring (the #1 signal)

Reis (2004) defines responsiveness as the central mechanism of intimacy. Three components:

- **Understanding**: accurate perception of the other (Ka references specific details from other Ka's turns)
- **Validation**: affirming the other's perspective (Ka acknowledges before diverging)
- **Caring**: showing warmth toward disclosures (positive sentiment toward what the other shares)

```typescript
interface ResponsivenessScore {
  understanding: number;  // 0-100
  validation: number;     // 0-100
  caring: number;         // 0-100
}
```

### Accumulation Formula

Current 55/45 (history/new) is flat. Research says early impressions should have more impact (speed dating findings), later scores should stabilize (Gottman):

```typescript
function accumulateImpression(prev: number, next: number, conversationCount: number) {
  // Early: new evidence matters more (40/60)
  // Later: history matters more (65/35)
  const historyWeight = Math.min(0.65, 0.40 + conversationCount * 0.025);
  return Math.min(100, Math.round(prev * historyWeight + next * (1 - historyWeight)));
}
```

### Dealbreakers & Preferences

- **Yes**: 1-3 hard dealbreakers (prevents Ka encounters entirely)
- **No**: positive preference filters ("must like hiking") — this is where stated preferences fail hardest
- Everything else: **emergent from conversation**

---

## 4. Parasocial Risk Safeguards

AI chatbot relationships lack genuine reciprocity (PMC research). AARU's design correctly positions Ka as a gateway, not a relationship substitute. Safeguards:

1. Ka conversations have clear endpoints (message limits)
2. The system always pushes toward Ba (human-to-human) interaction
3. Ka should occasionally reinforce its role: "I can only show you so much — you'd have to meet them to really know"
4. Ba unlock is the goal state, not Ka conversation continuation

---

## 5. Implementation Priority

1. **Add narrative identity layer** — formative stories + self-defining memories. Highest impact on conversation quality.
2. **Track responsiveness in impression scoring** — the #1 predictor we're currently ignoring.
3. **Phase conversation length by relationship stage** — short/frequent early, deeper/longer later.
4. **Schwartz-aligned values structure** — enables mathematical compatibility beyond keyword matching.
5. **Implicit behavioral signal tracking** — close the stated/revealed preference gap over time.

---

## Sources

- Reis, Clark & Holmes (2004) — Perceived partner responsiveness
- Gottman — 5:1 ratio, bid mechanics, Four Horsemen
- McAdams (2001) — Narrative identity, life story model
- Schwartz — Theory of Basic Human Values
- Hall (2018) — Hours to friendship formation
- Altman & Taylor — Social Penetration Theory
- Aron et al. — 36 Questions / reciprocal self-disclosure
- Zajonc — Mere exposure effect
- Byrne — Similarity-attraction paradigm
- Eastwick (2024, n=10,358) — Stated vs revealed mate preferences
- Heller, Watson & Iles (2004) — Big Five and relationship satisfaction
- Chapman — Five Love Languages (empirically unsupported)
