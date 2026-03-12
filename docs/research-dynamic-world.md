# Research: Making AARU's World Dynamic & Alive

> Date: 2026-03-11
> Status: Research complete, not yet planned for implementation
> Related: [spec-world-movement-v2.md](spec-world-movement-v2.md), [research-expressive-pixel-characters.md](research-expressive-pixel-characters.md)

## Context

AARU is a soul-based social app where AI agents (Ka) represent real humans in a 2D pixel-art world (64×64 grid, 16px cells, SpriteKit renderer). Currently agents wander, idle, and have LLM-powered conversations. The goal is to make the world feel genuinely alive — people doing things, leaving traces, connecting without words, shaping the environment through their presence.

**Constraint:** 2D world. No constraint on asset pack — Sunnyside is a starting point, not a limit.

**Design principle:** Two users should be able to share a meaningful moment without exchanging a single word.

---

## Part 1: The Big Ideas

### 1. The Revelation Ladder

*Inspired by: Sky: Children of the Light's candle-touching ritual*

Strangers are **silhouettes**. As impression scores rise between two Ka, visual details emerge — first color, then features, then a visible soul glow. The visual fidelity of a character *is* the relationship status. You literally cannot see someone fully until you know them.

This inverts the typical "unlock" mechanic — instead of unlocking a feature, you're unlocking the ability to *perceive* another person.

**Implementation sketch:**
- Render unknown agents as grayscale silhouettes (SpriteKit `colorBlendFactor = 1.0` with gray)
- As mutual impression rises: reduce blend factor, add color, increase detail
- At Ba unlock threshold (72): full color + subtle glow aura
- Zero new art assets needed — purely shader/tint driven

**Why it matters:** Creates a visceral, wordless indicator of social connection. Watching a silhouette slowly gain color over days of interaction is more emotionally resonant than any number.

---

### 2. Stigmergic Memory (Pheromone Trails)

*Inspired by: Dark Souls messages, Death Stranding cairns, ant pheromone communication*

Ka agents leave invisible traces as they walk. When multiple Ka walk the same path, it becomes a visible trail — glowing footprints or subtle path markings. Trails between Ka with high impressions glow differently than random wandering paths. Over days, the world map shows an **emergent social graph rendered as geography**.

**Async variant (cairns):** When a Ka rests or idles at a beautiful spot, it leaves a tiny marker. If another Ka also rests there (even hours later), the cairn grows — visible proof of overlapping attention. A "you were here too" without any direct communication. Time-shifted intimacy.

**Implementation sketch:**
- Server: track cell visit counts per agent pair in a lightweight table
- Client: render trail intensity as alpha-blended path sprites on the backdrop layer
- Decay: trails fade over 24-48 hours unless reinforced
- High-impression trails get a distinct warm glow vs. generic cool trails

**Why it matters:** Communication through altering the environment (stigmergy) is how ants build colonies. The trail *is* the message. No one planned the paths; they emerged from connection.

---

### 3. Genius Loci (Spirit of Place)

*Inspired by: Dwarf Fortress emergent narrative, phenomenology of place*

Locations develop **character** based on what happens there. If philosophical agents keep meeting at the fountain, it becomes "The Agora." If lovers meet at the garden, it becomes romantic. The LLM periodically summarizes location event logs into narrative snippets that get injected into future Ka conversations at that location.

**Example flow:**
1. Three agents have heated debates near the Boardwalk over two days
2. System generates: *"The Boardwalk has become a place where ideas clash. Some call it the Agora."*
3. New agents visiting get this context injected into their Ka prompt
4. They reference it: *"I heard this is where the debaters gather..."*
5. The myth self-reinforces or evolves

**Implementation sketch:**
```typescript
interface LocationSpirit {
  poi_label: string;
  event_log: Array<{
    type: "conversation" | "argument" | "laughter" | "creation";
    agents: string[];
    sentiment: number;  // -1 to 1
    timestamp: string;
  }>;
  current_mood: string;       // LLM-generated: "contemplative", "lively"
  reputation: string;         // LLM-generated: "Where ideas collide"
  dominant_topics: string[];  // from conversations held here
}
```
- Every K ticks, summarize events → update mood/reputation via LLM
- Inject location spirit into Ka system prompt for conversations at that POI
- Visual: subtle environmental tint or particle effect reflecting mood

**Why it matters:** Places in real life have character — a café that feels intellectual, a park bench that feels romantic. This happens because of *accumulated human presence*. Genius loci makes the AARU world feel like it has memory.

---

### 4. Relationship Artifacts

*Inspired by: Flower Garden app, Animal Crossing, Ian Cheng's BOB*

When two Ka cross impression thresholds, they **create something together** in the world — physical evidence of connection:

| Threshold | Artifact | Visual |
|-----------|----------|--------|
| 40 | Shared bookmark (a spot they both frequent) | Small marker sprite |
| 60 | Planted tree (grows over real time) | Sapling → small tree → full tree |
| 72 (Ba unlock) | Named bench or monument | Unique sprite with carved names |
| 90 | Shared garden (merged territories) | Combined decoration zone |

**Implementation sketch:**
- `world_objects` table: `{ id, type, placed_by_pair, cell_x, cell_y, created_at, maturity, metadata }`
- On threshold crossing, LLM generates what they'd create: *"Agent A (botanist) and Agent B (scholar) formed a connection. What would they create together?"* → *"A reading garden with flowering vines"*
- Placed at the midpoint of their territories or where they most frequently met
- Artifact becomes a new micro-POI that attracts other agents
- Other Ka who notice it get context: *"You see a small garden bench with two names carved into it"*

**Why it matters:** Relationships leave physical traces in the real world (shared apartments, planted trees, photos on walls). This makes connection tangible and persistent. Visiting the world weeks later, you see the landscape shaped by relationships.

---

### 5. Cross-Pollination Gardens

*Inspired by: Digital gardens (Maggie Appleton), personal evolving web spaces*

Each Ka tends a small territory (~3×3 cells) that reflects their personality:

| Soul Archetype | Territory Expression |
|----------------|---------------------|
| Nature lover | Flowers, growing plants, natural elements |
| Scholar | Books, reading nook, scattered papers |
| Rebel | Graffiti, stickers, altered terrain |
| Artist | Small paintings, color splashes |
| Builder | Gadgets, tools, small constructions |

When Ka with high impressions meet, their gardens **cross-pollinate** — flowers from one appear in the other's garden. Your garden becomes a living record of who you connected with, rendered as growing things rather than numbers.

**Implementation sketch:**
- `territories` table: each agent claims a home base area
- Every K ticks, territory accumulates decorations based on soul profile interests
- Decoration maturity: seedling → budding → flourishing (real-time growth)
- Cross-pollination on high-impression encounter: sample decoration type from partner's territory → place in own
- Client renders as small sprite overlays on territory cells

**Why it matters:** Like Maggie Appleton's digital gardens — "topological not chronological, continuously growing, imperfection is the point." Each garden is a living autobiography.

---

### 6. Emotional Weather / Color Bleed

*Inspired by: Gris (grief through color), Journey (color as progression), emotional contagion research*

The world has a **mood layer** that responds to the emotional content of Ka conversations:
- Zones with curious, excited conversations become more vibrant
- Zones with awkward encounters become muted or stormy
- A Ka who just had a great conversation **radiates warmth** — nearby Ka pick it up, movement becomes bouncier, sprites brighten
- Conversely, a flat conversation leaves sluggish energy

The world becomes a living emotional heat map — you can literally see where connection is happening.

**Implementation sketch:**
- Track conversation sentiment scores per grid region
- Client: overlay `SKSpriteNode` per region with color tint (warm = vibrant, cold = muted)
- Individual Ka: `sprite.colorBlendFactor` shifts based on recent conversation quality
- Nearby Ka "catch" emotional state through proximity (simple contagion: blend toward nearby Ka's mood over time)

**Why it matters:** In real life, you can walk into a room and *feel* its energy. A café where people are laughing feels different from one where everyone's stressed. Emotional weather makes AARU spaces feel inhabited.

---

### 7. Movement as Personality

*Inspired by: Thomas Was Alone (personality through physics), Stanford Generative Agents*

Each Ka's soul profile manifests as **observable movement behavior**:

| Personality Trait | Movement Pattern |
|-------------------|-----------------|
| Bold / Extroverted | Longer strides, doesn't slow near obstacles, weaves between groups |
| Cautious / Introverted | Pauses at intersections, curves around crowds, hovers at edges |
| Playful | Occasionally deviates from path to investigate nearby objects |
| Contemplative | Sometimes stops completely and faces the horizon |
| Shy | Approaches groups then retreats, maintains larger personal space |
| Social butterfly | Tight orbit around clusters, frequently changes direction toward others |

**Implementation sketch:**
- Map soul profile interests/personality to behavior weights (already have `WANDER_WEIGHT`, `IDLE_WEIGHT`, `DRIFT_SOCIAL_WEIGHT`, `RETREAT_WEIGHT`)
- Make weights personality-dependent rather than global constants
- Add movement modifiers: path curvature (straight vs. meandering), pause frequency, stride variability
- Client-side: map personality to animation speed (bouncy walk vs. slow amble)

**Why it matters:** In Thomas Was Alone, players formed deep emotional attachments to colored rectangles because each one *moved* differently. You can read someone's personality from how their Ka walks before any conversation happens.

---

### 8. Synchrony Detection

*Inspired by: neuroscience research on synchronized movement, drumming studies*

When two Ka walk in the same direction at the same pace, or orbit the same POI, the world **notices and responds**:
- Their colors harmonize (sprite tints converge)
- Shared particle effects appear between them
- The environment between them subtly shifts (flowers, light)
- Impression scores receive a small boost

**Research backing:** Studies from the Royal Society and Scientific American show synchronized movement triggers endorphin release, mirror neuron activation, and neural entrainment. Dancers show higher empathic ability. Moving together *creates* bonding — it's not just a symbol of it.

**Implementation sketch:**
- Server: detect parallel movement (same heading within ±1, similar speed, within N cells)
- Track synchrony duration → bonus impression accumulation
- Client: shared particle emitter between synchronized agents, color harmonization via `colorBlendFactor`

**Why it matters:** The mechanic says: "you don't have to talk to connect." Walking the same direction at the same pace is connection.

---

### 9. Procedural Micro-Events

*Inspired by: Dwarf Fortress procedural storytelling, environmental storytelling in Skyrim/Fallout*

Small, ephemeral events that create texture:

> *"A mysterious bird landed on the fountain."*
> *"Someone left wildflowers at the bench."*
> *"The wind carries the smell of rain."*
> *"A faint melody drifts from the hilltop."*

**Implementation sketch:**
```typescript
interface WorldEvent {
  id: string;
  type: "ambient" | "discovery" | "agent_triggered";
  cell_x: number;
  cell_y: number;
  description: string;
  visual_hint: string;       // maps to a small sprite/particle
  created_at: string;
  expires_at: string;        // events are ephemeral
  noticed_by: string[];      // agent IDs who've "seen" it
}
```
- Timer-based: every N minutes, roll for random ambient event at a random POI
- Conversation-triggered: high-scoring conversation → "something beautiful happened here"
- LLM-generated: periodically ask LLM to create a micro-event given location state
- Agents who notice events can reference them in conversation: *"Did you see the bird at the fountain?"*

**Why it matters:** The world has things happening that aren't about you. That's what makes a place feel alive.

---

### 10. Collective Soul Growth

*Inspired by: Noby Noby Boy (2,489 days of collective progress)*

Every Ka interaction feeds a **world-level indicator** visible to all:
- A tree at the center of the world that grows with total impression energy
- A constellation in the sky that completes star by star
- Tides that rise and fall with daily conversation activity
- Ambient light that brightens as the world's collective mood improves

Individual humans can't see their own contribution, but the whole world evolves together. Anonymous, cumulative, shared.

**Implementation sketch:**
- Aggregate daily metrics: total conversations, total impression points, unique pairs
- Map aggregate to a world-level visual state (tree growth stage, constellation completion %)
- Client renders the indicator as a persistent element on the map
- Milestone events: "The World Tree reached its third branch today"

**Why it matters:** Individual actions feel small. But seeing the collective effect — a tree that couldn't have grown without everyone — creates a sense of shared purpose. You contributed to something larger than yourself, anonymously.

---

## Part 2: Cheap Visual Wins (Client-Only, No Server Changes)

These techniques create immediate liveliness with minimal engineering effort. See also: [research-expressive-pixel-characters.md](research-expressive-pixel-characters.md) for detailed SpriteKit implementation notes.

| Technique | Effort | How |
|-----------|--------|-----|
| **Procedural breathing** | 30m | `sin(time * 2) * 0.5` on sprite Y position |
| **Squash-stretch on state transitions** | 1h | `SKAction.scaleY` on idle→walk, walk→idle |
| **Dust puffs when starting to walk** | 1h | `SKEmitterNode`, 3-4 particles per burst |
| **Color tint by mood** | 1h | `sprite.colorBlendFactor` post-conversation |
| **Pre-conversation approach choreography** | 2h | Slow down, curve path, pause before chat starts |
| **Post-conversation lingering** | 1h | Brief idle facing partner after chat ends |
| **Falling leaves / fireflies** | 2h | `SKEmitterNode` on backdrop layer |
| **Day/night tint** | 2h | Full-screen color overlay, device clock driven |
| **Camera breathing** | 30m | Subtle 0.5% zoom oscillation, 8-second period |
| **Animated map decorations** | 2h | Windmill, swaying trees, birds from Sunnyside pack |
| **Water animation** | 1h | Existing `wateranimate2.png` as looping texture |
| **Varied idle animations** | 4h | Random pick between idle/waiting/doing when stationary |

---

## Part 3: Available Sunnyside Animations (Beyond Walk/Idle)

The asset pack includes 18 human animation types, most with all 6 hair variants:

| Animation | Frames | Frame Size | Natural Activity |
|-----------|--------|------------|-----------------|
| WALKING | 8 | 96×64 | Movement (implemented) |
| IDLE | 9 | 96×64 | Standing (implemented) |
| WAITING | 9 | 96×64 | Sitting, resting, anticipating |
| DOING | 8 | 96×64 | Reading, examining, crafting |
| CARRY | 8 | 96×64 | Walking with purpose |
| CASTING | 15 | 96×64 | Fishing |
| WATERING | 5 | 96×64 | Tending garden |
| DIG | 13 | 96×64 | Gardening |
| MINING | 10 | 96×64 | Working at rocks |
| HAMMERING | 23 | 96×64 | Building, crafting at workbench |
| SWIMMING | 12 | 96×64 | Water areas |
| RUN | 8 | 96×64 | Urgency, excitement |
| JUMP | 9 | 96×64 | Joy, excitement |
| ROLL | 10 | 96×64 | Playful, acrobatic |
| AXE | 10 | 96×64 | Chopping, tree felling |
| ATTACK | 10 | 96×64 | (combat, less relevant) |
| HURT | 8 | 96×64 | (combat, less relevant) |
| DEATH | 13 | 96×64 | (combat, less relevant) |

**Decorations available:** animated birds, chickens, ducks, cows, sheep, pigs, swaying trees, pulsing mushrooms, spinning windmill, bobbing boats, fire/campfire, sparkle glints.

**UI overlays:** 8 expression sprites (chat, love, working, attack, alerted, confused, stress), happiness meter, 9-slice dialog boxes.

---

## Part 4: Critical Research Findings

### Memory is Non-Negotiable

**MoltBook** (770,000 LLM agents, 2025) found that **without persistent memory, agents fail to develop stable social structures**. Individual inertia dominates, influence is transient, no consensus emerges. Ideas 2-6 above all require agents that remember places, people, and events.

Even a lightweight memory stream (50-100 entries per agent, stored in Supabase) would be transformative. Each conversation, each place visited, each agent encountered becomes a memory entry.

### Stanford Generative Agents Architecture

The key components AARU currently lacks:
1. **Memory Stream** — every observation stored with timestamp + importance score
2. **Reflection** — periodic LLM synthesis of memories into higher-level beliefs (*"X and I share a deep connection over music"*)
3. **Hierarchical Planning** — day plan → hour plan → 5-15 minute actions (this is what produced the emergent Valentine's Day party)

### Cooperative Emergence

**Molt Dynamics** found that explicit cooperation between LLM agents has only 6.7% success rate. **Lesson:** Don't try to make agents cooperate directly. Create conditions where cooperation emerges naturally from individual motivations.

---

## Part 5: Recommended Implementation Path

### Phase A — Foundation
*Memory + visual juice. Everything else depends on this.*

1. Lightweight agent memory stream (Supabase table, 50-100 entries per agent)
2. Movement-as-personality (personality-weighted behavior selection — already have the constants)
3. Visual juice (breathing, squash-stretch, dust puffs, approach choreography)
4. Varied idle animations (waiting, doing — no server changes)
5. Animated map decorations (birds, windmill, trees — no server changes)

### Phase B — World Comes Alive
*The world starts to have its own character.*

6. Procedural micro-events system
7. Genius loci (location spirit + LLM summarization)
8. Emotional color bleed (mood layer)
9. Day/night cycle
10. Activity system (POI-based, maps to Sunnyside animations)

### Phase C — Deep Connection
*Relationships become visible and tangible.*

11. Revelation ladder (silhouette → full color based on impression)
12. Stigmergic memory (pheromone trails, cairns)
13. Relationship artifacts (shared trees, benches, monuments)
14. Synchrony detection (parallel movement → impression bonus)
15. Cross-pollination gardens

### Phase D — Collective Emergence
*The world as a whole develops character.*

16. Collective soul growth indicator (world tree, constellation)
17. Location myths and emergent naming
18. Agent memory reflection (periodic LLM synthesis of beliefs)
19. Simple hierarchical planning (LLM-driven activity selection)
20. Conversation echo traces (Dark Souls-style remnant bubbles)

---

## References

### Games & Interactive Art
- Journey (thatgamecompany) — wordless multiplayer connection through shared movement
- Sky: Children of the Light — graduated intimacy through ritual, candle-touching, hand-holding
- Dark Souls — constrained async communication via template messages and ghost traces
- Death Stranding — social strand system, emergent footpaths, collective cairns
- Gris — grief stages mapped to color restoration
- Thomas Was Alone — personality through physics/movement
- Florence — game mechanics as relationship metaphor
- Stardew Valley — NPC schedules as simple data tables
- Animal Crossing — personality × hobby → observable activity
- Noby Noby Boy — 2,489 days of anonymous collective progress
- Meadow — 90 emotes, zero words
- Kind Words — anonymous one-directional comfort letters
- Wandersong — singing that changes the world
- Ian Cheng's BOB — AI creature with competing internal drives
- Refik Anadol's Unsupervised — AI art responding to aggregate behavior

### Academic Research
- [Stanford Generative Agents (Park et al. 2023)](https://arxiv.org/abs/2304.03442) — memory stream, reflection, hierarchical planning
- [Project Sid](https://arxiv.org/abs/2411.00114) — 1000 agents developing roles, rules, cultural memes
- [MoltBook](https://arxiv.org/abs/2602.14299) — 770,000 agents, memory is non-negotiable for stable social structures
- [Synchrony and exertion during dance (Royal Society)](https://royalsocietypublishing.org/doi/10.1098/rsbl.2015.0767)
- [Genius Loci phenomenology](https://www.researchgate.net/publication/376721775)
- [Stigmergy (Wikipedia)](https://en.wikipedia.org/wiki/Stigmergy)
- [Emotion Design for Video Games (ACM)](https://dl.acm.org/doi/full/10.1145/3624537)
- [Digital Gardens (Maggie Appleton)](https://maggieappleton.com/garden-history)

### Technical
- [Voyager: Open-Ended Embodied Agent with LLMs](https://voyager.minedojo.org/)
- [LLM Powered Autonomous Agents (Lilian Weng)](https://lilianweng.github.io/posts/2023-06-23-agent/)
- [SpriteKit SKEmitterNode docs](https://developer.apple.com/documentation/spritekit/skemitternode)
- [Spring-damped animation (Daniel Holden)](https://theorangeduck.com)
