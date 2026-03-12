import type { SoulProfile, SoulValues, SoulNarrative } from "./types.ts";

// ── NPC seed format ──

export interface NpcSeed {
  name: string;
  personality: string;
  interests: string[];
  values: string[];
}

// ── Value-to-Schwartz dimension mapping ──
// [self_transcendence, self_enhancement, openness_to_change, conservation]
const VALUE_SCHWARTZ: Record<string, [number, number, number, number]> = {
  honesty:    [0.7, 0.2, 0.3, 0.8],
  patience:   [0.6, 0.1, 0.2, 0.9],
  warmth:     [0.9, 0.2, 0.4, 0.4],
  kindness:   [0.9, 0.1, 0.3, 0.5],
  empathy:    [0.9, 0.2, 0.4, 0.3],
  care:       [0.8, 0.2, 0.3, 0.5],
  sincerity:  [0.7, 0.3, 0.4, 0.6],
  courage:    [0.4, 0.8, 0.7, 0.2],
  growth:     [0.5, 0.7, 0.8, 0.2],
  resilience: [0.4, 0.7, 0.5, 0.6],
  curiosity:  [0.5, 0.5, 0.9, 0.2],
  freedom:    [0.4, 0.5, 0.9, 0.1],
  taste:      [0.3, 0.6, 0.8, 0.4],
  wonder:     [0.6, 0.3, 0.9, 0.2],
  humor:      [0.5, 0.4, 0.8, 0.3],
  integrity:  [0.5, 0.4, 0.3, 0.9],
  balance:    [0.6, 0.3, 0.3, 0.8],
  attention:  [0.5, 0.3, 0.4, 0.8],
  clarity:    [0.4, 0.5, 0.5, 0.7],
  depth:      [0.7, 0.3, 0.6, 0.5],
};

// Personality keywords that nudge Schwartz dimensions
// [st_boost, se_boost, oc_boost, co_boost]
const PERSONALITY_NUDGE: Record<string, [number, number, number, number]> = {
  playful:        [0, 0, 0.15, -0.1],
  observant:      [0.1, 0, 0, 0.1],
  creative:       [0, 0, 0.2, -0.15],
  imaginative:    [0, 0, 0.2, -0.1],
  dreamy:         [0, 0, 0.15, -0.1],
  restless:       [0, 0.1, 0.15, -0.15],
  bright:         [0, 0.1, 0.1, 0],
  adventurous:    [-0.1, 0.15, 0.2, -0.2],
  fearless:       [-0.1, 0.2, 0.15, -0.15],
  bold:           [-0.1, 0.2, 0.15, -0.1],
  fierce:         [0, 0.15, 0.1, -0.1],
  driven:         [-0.1, 0.2, 0.1, 0],
  ambitious:      [-0.1, 0.25, 0.1, -0.1],
  competitive:    [-0.1, 0.2, 0, 0],
  charismatic:    [0, 0.15, 0.1, 0],
  warm:           [0.15, 0, 0, 0],
  nurturing:      [0.2, 0, 0, 0.1],
  gentle:         [0.15, -0.1, 0, 0.1],
  tender:         [0.2, -0.1, 0, 0],
  empathetic:     [0.2, 0, 0, 0],
  generous:       [0.15, 0, 0.1, 0],
  calm:           [0.1, 0, -0.1, 0.15],
  grounded:       [0.1, 0, -0.1, 0.2],
  serene:         [0.15, -0.1, 0, 0.15],
  contemplative:  [0.1, 0, 0, 0.15],
  earthy:         [0.1, 0, -0.1, 0.2],
  patient:        [0.1, -0.1, -0.1, 0.2],
  steady:         [0.05, 0, -0.1, 0.2],
  stoic:          [0, 0.1, -0.1, 0.2],
  reliable:       [0, 0, -0.1, 0.2],
  methodical:     [0, 0.1, -0.1, 0.2],
  precise:        [0, 0.1, 0, 0.15],
  strategic:      [0, 0.15, 0, 0.1],
  analytical:     [0, 0.1, 0.1, 0.1],
  philosophical:  [0.1, 0, 0.1, 0.1],
  wise:           [0.1, 0, 0, 0.15],
  thoughtful:     [0.1, 0, 0, 0.1],
  witty:          [0, 0.1, 0.15, 0],
  quirky:         [0, 0, 0.2, -0.1],
  inventive:      [0, 0.1, 0.2, -0.1],
  passionate:     [0.1, 0.1, 0.1, 0],
  expressive:     [0.1, 0, 0.15, 0],
  intense:        [0.1, 0.1, 0.1, 0],
  devoted:        [0.15, 0, 0, 0.1],
  magnetic:       [0, 0.1, 0.1, 0],
  unpredictable:  [0, 0, 0.2, -0.15],
  sparkling:      [0.1, 0, 0.15, 0],
  joyful:         [0.15, 0, 0.1, 0],
  elegant:        [0, 0.1, 0, 0.1],
  graceful:       [0.1, 0, 0, 0.1],
  vivid:          [0, 0, 0.15, 0],
  luminous:       [0.1, 0, 0.15, 0],
  regal:          [0, 0.15, 0, 0.1],
  decisive:       [0, 0.15, 0, 0.1],
  loyal:          [0.1, 0, 0, 0.15],
  principled:     [0.1, 0, 0, 0.2],
  spiritual:      [0.15, 0, 0.1, 0.1],
  poetic:         [0.1, 0, 0.15, 0],
  literary:       [0.1, 0, 0.1, 0.1],
};

// ── Interest-specific formative stories ──

const INTEREST_STORIES: Record<string, string> = {
  "film photography": "I found my mother's old film camera when I was twelve. I spent that summer photographing everything — cats, strangers, puddles. Most came out blurry, but one made her cry. I didn't understand why until much later.",
  "indie cinema": "There was a week when I watched the same film every night, noticing different things each time — how the director held on faces a beat too long, the silence between words. It changed how I listen to people.",
  "night walks": "I started taking night walks after a difficult year. The city at 2am has a different personality — quieter, more honest. I realized I think more clearly when the world around me has slowed down.",
  "architecture": "My father used to take me to buildings on weekends and ask me what I felt, not what I saw. Standing in front of a concrete chapel with a single cross of light, I understood that a room can hold emotion the way a person does.",
  "coffee culture": "I moved to a new city knowing nobody. For three months my only real conversations were with the barista at a tiny place that roasted their own beans. She taught me that small talk can be an art form if you actually pay attention.",
  "urban design": "I spent a summer mapping how people actually walked through a park versus how the paths were designed. The desire paths — the ones worn into the grass — told a story about what humans need that architects don't always see.",
  "startups": "I built my first thing at fourteen — a terrible app that crashed constantly. But seeing something I made actually work on a phone, even badly, rewired my brain. I realized you could just make things exist.",
  "science books": "My grandfather was an engineer. He explained bridges to me by drawing on napkins at dinner. He said the best structures look effortless but carry everything. That metaphor stuck with me for every project since.",
  "documentaries": "I watched a documentary about deep-sea creatures and couldn't sleep for a week — not from fear, but wonder. There were whole worlds below the surface functioning on completely different rules. It made me question every assumption I had.",
  "poetry": "My aunt would read to me in two languages, switching mid-sentence. I think that's why I notice the gaps between what people say and what they mean — I grew up living in those gaps.",
  "translation": "I spent months trying to translate one phrase that described hearing your grandmother's voice in a crowded market. There's no English word for it. I ended up writing a footnote longer than the passage itself.",
  "museum exhibits": "I sat alone with a Rothko painting for an hour. I went in skeptical — it's just colored rectangles. But something shifted. I felt understood by a painting. That changed what I think art is for.",
  "fashion history": "I tried on my grandmother's vintage jacket and felt her whole era click into focus. The cut, the weight of the fabric, the way it hung — it was like wearing someone else's confidence.",
  "music scenes": "I went to a show at sixteen in a basement that smelled like wet concrete. The music was terrible. But everyone there had made something — their clothes, their zines, the flyers. That night I learned taste is about caring enough to have an opinion.",
  "travel": "I traveled alone for two months with one backpack. Somewhere along the way I stopped looking for the 'authentic' experience and started talking to people at bus stops. The best conversations of my life happened while waiting.",
  "cooking": "My grandmother never measured anything. She'd say 'enough salt is when the pot smells right.' I spent years trying to replicate her dishes before I understood she wasn't following recipes — she was listening to the food.",
  "gardening": "I planted a garden during the loneliest year of my life. Watching things grow on their own schedule taught me that not everything responds to effort — some things just need time and the right conditions.",
  "meditation": "I tried meditation for six months and hated every minute. Then one morning, during the twenty minutes of supposed silence, I heard my own breathing as if for the first time. I'd been living inside a body I'd never actually listened to.",
  "rock climbing": "The first time I climbed outdoors, I froze ten meters up. My hands were shaking. My partner called up: 'Don't look at the top, just find the next hold.' It became my approach to everything difficult.",
  "stand-up comedy": "I bombed my first open mic so badly that someone looked away out of pity. Walking home, I realized the only people who truly understand failure are the ones who've stood alone under a spotlight.",
  "cycling": "I rode across the country one summer. Day after day of empty road taught me something I couldn't have learned any other way: the difference between loneliness and solitude is entirely about choice.",
  "watercolor painting": "I spilled water across my painting and almost threw it away. But as the colors bled together, something better emerged — something I couldn't have planned. I stopped trying to control outcomes after that.",
  "mythology": "I read a myth about a god who could only speak in riddles. I was eight and it terrified me. Later I understood the myth wasn't about gods — it was about how the most important truths resist being said plainly.",
  "astronomy": "I saw the Milky Way for the first time on a camping trip. I lay on my back for hours. The sky was so full of stars that the spaces between them seemed like the exception, not the rule. I've never felt smaller or more connected.",
  "robotics": "I built my first robot from salvaged parts. It could only move in circles, but watching it navigate obstacles — badly, stubbornly — felt like watching something almost alive. The gap between 'almost' and 'actually' alive became the most interesting question I know.",
  "philosophy": "I read a line in a philosophy book that stopped me cold: 'We do not see things as they are. We see things as we are.' I spent the rest of that year testing it against every argument I'd ever had. It held up.",
  "podcasts": "I started listening to long-form interviews during walks. Hearing strangers be genuinely honest for two hours changed my tolerance for small talk. I started asking much better questions in my own conversations.",
  "jazz": "I heard Coltrane's 'A Love Supreme' at fifteen and something broke open. The music wasn't trying to be beautiful — it was trying to be true. That distinction has guided everything I've cared about since.",
  "ceramics": "I threw my first pot and it collapsed immediately. The instructor said 'clay remembers everything — every hesitation, every moment of force.' I've been learning to be gentle with materials, and people, ever since.",
  "hiking": "I got lost on a trail and spent two hours walking the wrong direction. When I finally found my way, the summit felt earned in a way it wouldn't have otherwise. Now I trust the long way around.",
  "board games": "I played chess with my grandfather every Sunday. He never let me win. The day I finally beat him, he smiled and said 'Now we can talk as equals.' I learned that respect is earned through honest challenge.",
  "electronic music": "I made my first track at 3am using free software and a laptop with a cracked screen. It sounded like a washing machine having a dream. But for the first time, the sound in my head existed outside of it.",
  "street art": "I found a mural in an alley — a pair of hands releasing a bird. Someone had painted their whole heart on a wall knowing it would be painted over within weeks. That kind of courage has stayed with me.",
  "vintage books": "I found a book in a secondhand shop with someone else's margin notes. Their handwriting was beautiful, their thoughts were strange and brilliant. I was having a conversation across time with a stranger I'd never meet.",
  "calligraphy": "My teacher said the brush should feel like an extension of your breath. I didn't understand until months later, when a single stroke came out exactly right without thinking. The hand knew before the mind did.",
  "marine biology": "I went snorkeling and saw a coral reef for the first time. The colors were impossible — no screen could reproduce them. I realized nature's palette makes human art look cautious.",
  "surfing": "I spent three weeks failing to stand up on a board. When I finally caught a wave, it lasted maybe four seconds. But in those four seconds, the ocean and I were the same thing. Every surfer is chasing that feeling.",
  "creative writing": "I wrote a story about my childhood and showed it to a friend. She said 'I didn't know you felt that way.' Neither did I, until I wrote it down. Writing became how I discover what I actually think.",
  "theater": "I watched a one-person show in a tiny theater. The actor cried real tears. When it ended, the twenty people in the audience sat in silence for ten seconds. That silence was the most honest thing I've ever heard in a room.",
  "yoga": "I resisted yoga for years because I thought it was about flexibility. My first class, the instructor said 'The pose isn't the point. The pose is where you discover what you're avoiding.' That reframed everything.",
};

// ── Personality keyword → narrative theme mapping ──

const KEYWORD_THEMES: Record<string, string[]> = {
  playful: ["lightness", "communion"],
  observant: ["quiet attention", "seeing what others miss"],
  steady: ["persistence", "quiet dedication"],
  thoughtful: ["careful deliberation", "reflection"],
  enthusiastic: ["optimistic energy", "building"],
  reflective: ["introspection", "measured growth"],
  gentle: ["tenderness", "communion"],
  literary: ["language as home", "meaning-making"],
  bright: ["illumination", "restless seeking"],
  restless: ["motion as meaning", "restless seeking"],
  warm: ["nurturing presence", "communion"],
  nurturing: ["care as craft", "growth through others"],
  bold: ["directness", "agency"],
  direct: ["honesty as practice", "clarity"],
  dreamy: ["inner worlds", "imagination"],
  imaginative: ["creative vision", "wonder"],
  analytical: ["pattern-seeking", "systematic curiosity"],
  curious: ["exploration", "questioning everything"],
  calm: ["steady presence", "groundedness"],
  grounded: ["rootedness", "earthly wisdom"],
  witty: ["sharp observation", "connection through humor"],
  philosophical: ["existential questioning", "depth"],
  energetic: ["embodied joy", "spontaneity"],
  spontaneous: ["living in the moment", "freedom"],
  empathetic: ["emotional attunement", "communion"],
  intuitive: ["inner knowing", "reading between lines"],
  creative: ["unconventional thinking", "making"],
  unconventional: ["reframing", "challenge"],
  patient: ["trust in process", "stillness"],
  wise: ["earned understanding", "patience as strength"],
  passionate: ["intensity", "emotional honesty"],
  expressive: ["vulnerability", "wearing heart openly"],
  methodical: ["beauty in structure", "precision"],
  precise: ["elegant systems", "attention to detail"],
  adventurous: ["horizon-seeking", "courage"],
  fearless: ["pushing boundaries", "agency"],
  contemplative: ["deep listening", "stillness"],
  serene: ["natural harmony", "inner peace"],
  loyal: ["fierce devotion", "protective love"],
  easygoing: ["social warmth", "generosity"],
  generous: ["abundance", "sharing"],
  elegant: ["quiet power", "refinement"],
  competitive: ["excellence", "drive"],
  stoic: ["economy of words", "quiet strength"],
  reliable: ["consistency", "trust"],
  magnetic: ["drawing others in", "presence"],
  unpredictable: ["contrast", "surprise"],
  strategic: ["foresight", "calculated moves"],
  quirky: ["unexpected connections", "delightful oddness"],
  inventive: ["novel combinations", "making"],
  tender: ["emotional depth", "softness"],
  poetic: ["lyric perception", "beauty in language"],
  principled: ["walking the talk", "moral clarity"],
  sparkling: ["everyday wonder", "joy"],
  intense: ["transformative connection", "depth"],
  devoted: ["wholehearted commitment", "devotion"],
  cool: ["slow revelation", "restraint"],
  graceful: ["natural poise", "elegance"],
  charismatic: ["natural magnetism", "leadership"],
  ambitious: ["bold vision", "building"],
  fierce: ["quiet resolve", "protection"],
  humorous: ["disarming warmth", "ease"],
  earthy: ["deep connection to place", "rootedness"],
  joyful: ["celebration", "beauty in all forms"],
  sensual: ["aesthetic depth", "embodied experience"],
  brilliant: ["clarity of vision", "intellectual rigor"],
  grateful: ["meaningful connection", "appreciation"],
  perceptive: ["deep reading", "seeing what others miss"],
  vivid: ["expressive communication", "color"],
  driven: ["thriving under pressure", "competition"],
  independent: ["self-reliance", "uncomfortable truths"],
  luminous: ["cosmic perspective", "expansive thinking"],
  expansive: ["connecting scales", "broad vision"],
  discerning: ["knowing what matters", "refined taste"],
  spiritual: ["invisible meaning", "seeking beyond"],
  regal: ["decisive leadership", "authority"],
  decisive: ["leading by example", "clarity of action"],
};

// ── Derivation functions ──

function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)) * 10) / 10;
}

function deriveSoulValues(personality: string, expressed: string[]): SoulValues {
  // Start from expressed values
  let st = 0, se = 0, oc = 0, co = 0, count = 0;
  for (const v of expressed) {
    const w = VALUE_SCHWARTZ[v.toLowerCase()];
    if (w) {
      st += w[0]; se += w[1]; oc += w[2]; co += w[3];
      count++;
    }
  }
  const n = Math.max(1, count);
  st /= n; se /= n; oc /= n; co /= n;

  // Nudge based on personality keywords
  const words = personality.toLowerCase().split(/[\s,]+/);
  for (const word of words) {
    const nudge = PERSONALITY_NUDGE[word];
    if (nudge) {
      st += nudge[0]; se += nudge[1]; oc += nudge[2]; co += nudge[3];
    }
  }

  return {
    self_transcendence: clamp(st, 0.1, 0.95),
    self_enhancement: clamp(se, 0.1, 0.95),
    openness_to_change: clamp(oc, 0.1, 0.95),
    conservation: clamp(co, 0.1, 0.95),
    expressed,
  };
}

function deriveNarrativeThemes(personality: string): string[] {
  const words = personality.toLowerCase().split(/[\s,]+/);
  const themes = new Set<string>();
  for (const word of words) {
    const kwThemes = KEYWORD_THEMES[word];
    if (kwThemes) {
      for (const t of kwThemes) themes.add(t);
    }
  }
  const result = [...themes];
  if (result.length === 0) result.push("self-discovery", "connection");
  return result.slice(0, 3);
}

function deriveMemory(interests: string[]): string {
  // Use the last interest's story, extract its final sentence as a memory
  const interest = interests[interests.length - 1];
  const story = INTEREST_STORIES[interest];
  if (!story) return "A quiet afternoon when everything I thought I knew shifted";
  const parts = story.split(/\.\s+/);
  return parts[parts.length - 1].replace(/\.$/, "");
}

function deriveSoulNarrative(personality: string, interests: string[]): SoulNarrative {
  const stories: string[] = [];
  for (const interest of interests.slice(0, 2)) {
    const story = INTEREST_STORIES[interest];
    if (story) stories.push(story);
  }
  if (stories.length === 0) {
    stories.push("I had a moment once where everything I thought I knew shifted. It wasn't dramatic — it was quiet. But I was different after.");
  }

  return {
    formative_stories: stories,
    self_defining_memories: [deriveMemory(interests)],
    narrative_themes: deriveNarrativeThemes(personality),
  };
}

export function deriveSoulProfile(seed: NpcSeed): SoulProfile {
  return {
    personality: seed.personality,
    interests: seed.interests,
    values: deriveSoulValues(seed.personality, seed.values),
    narrative: deriveSoulNarrative(seed.personality, seed.interests),
    avoid_topics: ["cruelty"],
    raw_input: `${seed.name} likes good stories and patient conversations.`,
    guessed_fields: [],
  };
}

// ── The full 50-NPC pool ──

export const NPC_POOL: NpcSeed[] = [
  { name: "Nahla", personality: "Nahla is quietly playful, observant, and drawn to emotional subtext.", interests: ["film photography", "indie cinema", "night walks"], values: ["honesty", "patience", "warmth"] },
  { name: "Iset", personality: "Iset is steady, thoughtful, and likes asking the second question instead of the first.", interests: ["architecture", "coffee culture", "urban design"], values: ["clarity", "growth", "care"] },
  { name: "Khepri", personality: "Khepri is enthusiastic, reflective, and energized by ambitious ideas.", interests: ["startups", "science books", "documentaries"], values: ["curiosity", "courage", "humor"] },
  { name: "Setka", personality: "Setka is gentle, literary, and notices how people choose words.", interests: ["poetry", "translation", "museum exhibits"], values: ["depth", "kindness", "attention"] },
  { name: "Meri", personality: "Meri is bright, restless, and likes conversations that move between craft and feeling.", interests: ["fashion history", "music scenes", "travel"], values: ["taste", "freedom", "sincerity"] },
  { name: "Amunet", personality: "Amunet is warm, nurturing, and fascinated by growth and change.", interests: ["cooking", "gardening", "meditation"], values: ["resilience", "empathy", "balance"] },
  { name: "Bastet", personality: "Bastet is bold, direct, and appreciates honesty over politeness.", interests: ["rock climbing", "stand-up comedy", "cycling"], values: ["courage", "integrity", "freedom"] },
  { name: "Djedi", personality: "Djedi is dreamy, imaginative, and finds meaning in small details.", interests: ["watercolor painting", "mythology", "astronomy"], values: ["wonder", "patience", "depth"] },
  { name: "Eshe", personality: "Eshe is analytical, curious, and connects disparate ideas easily.", interests: ["robotics", "philosophy", "podcasts"], values: ["curiosity", "clarity", "growth"] },
  { name: "Femi", personality: "Femi is calm, grounded, and provides stability in conversation.", interests: ["jazz", "ceramics", "hiking"], values: ["kindness", "balance", "warmth"] },
  { name: "Gaspar", personality: "Gaspar is witty, quick, and uses humor to build connection.", interests: ["board games", "electronic music", "street art"], values: ["humor", "sincerity", "taste"] },
  { name: "Heka", personality: "Heka is philosophical, deep, and drawn to existential questions.", interests: ["vintage books", "calligraphy", "marine biology"], values: ["depth", "wonder", "integrity"] },
  { name: "Ineni", personality: "Ineni is energetic, spontaneous, and loves trying new things.", interests: ["surfing", "travel", "cooking"], values: ["freedom", "courage", "humor"] },
  { name: "Jabari", personality: "Jabari is empathetic, intuitive, and reads between the lines.", interests: ["creative writing", "theater", "yoga"], values: ["empathy", "attention", "care"] },
  { name: "Kamilah", personality: "Kamilah is creative, unconventional, and challenges assumptions.", interests: ["street art", "fashion history", "indie cinema"], values: ["taste", "curiosity", "resilience"] },
  { name: "Lotfi", personality: "Lotfi is patient, wise, and values silence as much as words.", interests: ["meditation", "calligraphy", "astronomy"], values: ["patience", "balance", "depth"] },
  { name: "Menat", personality: "Menat is passionate, expressive, and wears her heart on her sleeve.", interests: ["theater", "music scenes", "poetry"], values: ["sincerity", "warmth", "courage"] },
  { name: "Neferu", personality: "Neferu is methodical, precise, and finds beauty in structure.", interests: ["architecture", "robotics", "urban design"], values: ["clarity", "integrity", "attention"] },
  { name: "Osei", personality: "Osei is adventurous, fearless, and always seeking the next horizon.", interests: ["rock climbing", "surfing", "travel"], values: ["courage", "freedom", "growth"] },
  { name: "Ptah", personality: "Ptah is contemplative, serene, and drawn to nature and stillness.", interests: ["gardening", "hiking", "marine biology"], values: ["balance", "wonder", "patience"] },
  { name: "Qadesh", personality: "Qadesh is sharp-tongued, loyal, and fiercely protective of those she loves.", interests: ["documentaries", "podcasts", "philosophy"], values: ["honesty", "resilience", "empathy"] },
  { name: "Rensi", personality: "Rensi is easygoing, generous, and lights up any gathering.", interests: ["cooking", "jazz", "board games"], values: ["warmth", "humor", "kindness"] },
  { name: "Safiya", personality: "Safiya is precise, elegant, and quietly competitive.", interests: ["calligraphy", "cycling", "fashion history"], values: ["attention", "taste", "integrity"] },
  { name: "Tau", personality: "Tau is restless, curious, and can't resist pulling threads.", interests: ["science books", "startups", "electronic music"], values: ["curiosity", "growth", "courage"] },
  { name: "Usir", personality: "Usir is stoic, reliable, and speaks only when it matters.", interests: ["vintage books", "hiking", "mythology"], values: ["integrity", "patience", "depth"] },
  { name: "Vashti", personality: "Vashti is magnetic, unpredictable, and drawn to contrast.", interests: ["indie cinema", "street art", "night walks"], values: ["freedom", "sincerity", "wonder"] },
  { name: "Wadjet", personality: "Wadjet is observant, strategic, and always three steps ahead.", interests: ["board games", "urban design", "documentaries"], values: ["clarity", "courage", "attention"] },
  { name: "Xenon", personality: "Xenon is quirky, inventive, and delighted by odd connections.", interests: ["robotics", "stand-up comedy", "mythology"], values: ["humor", "curiosity", "wonder"] },
  { name: "Yara", personality: "Yara is tender, poetic, and carries a quiet intensity.", interests: ["poetry", "watercolor painting", "night walks"], values: ["depth", "empathy", "warmth"] },
  { name: "Zuberi", personality: "Zuberi is grounded, principled, and speaks from experience.", interests: ["gardening", "ceramics", "philosophy"], values: ["honesty", "resilience", "balance"] },
  { name: "Amara", personality: "Amara is sparkling, curious, and finds wonder in everyday moments.", interests: ["film photography", "coffee culture", "yoga"], values: ["wonder", "care", "growth"] },
  { name: "Bennu", personality: "Bennu is intense, devoted, and transformed by every deep conversation.", interests: ["theater", "creative writing", "meditation"], values: ["sincerity", "depth", "courage"] },
  { name: "Chione", personality: "Chione is cool, graceful, and reveals warmth slowly.", interests: ["astronomy", "jazz", "translation"], values: ["patience", "taste", "kindness"] },
  { name: "Darius", personality: "Darius is charismatic, ambitious, and energized by bold plans.", interests: ["startups", "cycling", "travel"], values: ["courage", "growth", "freedom"] },
  { name: "Edjo", personality: "Edjo is fierce, loyal, and protects what matters with quiet resolve.", interests: ["rock climbing", "marine biology", "podcasts"], values: ["integrity", "resilience", "honesty"] },
  { name: "Farouk", personality: "Farouk is gentle, humorous, and puts people at ease instantly.", interests: ["cooking", "stand-up comedy", "hiking"], values: ["humor", "warmth", "care"] },
  { name: "Geb", personality: "Geb is earthy, patient, and deeply connected to place.", interests: ["gardening", "ceramics", "architecture"], values: ["balance", "attention", "patience"] },
  { name: "Hathor", personality: "Hathor is joyful, sensual, and celebrates beauty in all forms.", interests: ["music scenes", "watercolor painting", "fashion history"], values: ["taste", "warmth", "wonder"] },
  { name: "Imhotep", personality: "Imhotep is brilliant, methodical, and builds things that last.", interests: ["robotics", "science books", "urban design"], values: ["clarity", "integrity", "curiosity"] },
  { name: "Jendayi", personality: "Jendayi is grateful, reflective, and treasures meaningful connection.", interests: ["yoga", "poetry", "film photography"], values: ["empathy", "sincerity", "kindness"] },
  { name: "Kemet", personality: "Kemet is ancient-souled, perceptive, and drawn to cycles and patterns.", interests: ["mythology", "astronomy", "vintage books"], values: ["depth", "wonder", "patience"] },
  { name: "Lapis", personality: "Lapis is vivid, expressive, and communicates through color and metaphor.", interests: ["watercolor painting", "street art", "indie cinema"], values: ["taste", "freedom", "curiosity"] },
  { name: "Masika", personality: "Masika is spontaneous, warm, and turns strangers into friends.", interests: ["travel", "cooking", "board games"], values: ["warmth", "humor", "care"] },
  { name: "Nebtu", personality: "Nebtu is nurturing, wise, and draws out the best in others.", interests: ["gardening", "meditation", "creative writing"], values: ["kindness", "growth", "empathy"] },
  { name: "Onuris", personality: "Onuris is driven, competitive, and thrives under pressure.", interests: ["cycling", "rock climbing", "electronic music"], values: ["courage", "resilience", "freedom"] },
  { name: "Pakhet", personality: "Pakhet is fierce, independent, and speaks uncomfortable truths.", interests: ["philosophy", "documentaries", "surfing"], values: ["honesty", "integrity", "courage"] },
  { name: "Quasar", personality: "Quasar is luminous, expansive, and thinks at cosmic scale.", interests: ["astronomy", "science books", "podcasts"], values: ["wonder", "curiosity", "growth"] },
  { name: "Rashida", personality: "Rashida is graceful, discerning, and knows exactly what she wants.", interests: ["fashion history", "calligraphy", "jazz"], values: ["taste", "clarity", "attention"] },
  { name: "Sahu", personality: "Sahu is contemplative, spiritual, and seeks meaning beyond the visible.", interests: ["mythology", "meditation", "marine biology"], values: ["depth", "balance", "wonder"] },
  { name: "Tiye", personality: "Tiye is regal, decisive, and leads with quiet authority.", interests: ["architecture", "theater", "translation"], values: ["integrity", "clarity", "resilience"] },
];

export const NPC_DEVICE_IDS = new Set(NPC_POOL.map((s) => `npc-${s.name.toLowerCase()}`));

/**
 * Select which NPCs should be active for a given real user count.
 * First N seeds from the pool are preferred (stable ordering).
 */
export function getActiveNpcSeeds(
  realUserCount: number,
  targetTotal: number
): NpcSeed[] {
  const npcCount = Math.max(0, targetTotal - realUserCount);
  return NPC_POOL.slice(0, npcCount);
}
