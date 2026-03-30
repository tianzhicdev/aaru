# Reddit Posts

## r/selfimprovement — Authentic Journey Post

**Title:** I built an AI that doesn't give advice — it just mirrors who you are

I've been thinking about self-knowledge for a long time. Not the "take this quiz and get a label" kind. The deeper kind — the kind you usually only get from a really good conversation with someone who listens.

The problem with personality tests is they flatten you. You answer 50 questions and get a label: INTJ, Type 4, "high openness." But the most interesting thing about you is the part that doesn't fit. The contradiction. The tension between who you are at 2am and who you are at noon.

So I built Thumos. It's an iOS app — a "soul mirror." You have a reflective conversation with an AI that:
- Asks one question at a time
- Quotes your own words back to you
- Notices contradictions ("You love being alone, but your best memory is about a crowd")
- Never labels you

Over multiple conversations, it builds a "soul file" — a living portrait in 7 sections (How You Move, How You Think, How You Connect, What You Carry, What Lights You Up, Your Contradictions, Your Voice). Written in your own language, not psychology jargon.

It's not therapy. It doesn't give advice. It's a mirror.

The first portrait always surprises people. Not because it says something they didn't know — but because it says something they didn't know they knew.

Free on iOS, no account needed: [link]

---

## r/artificial — Technical + Philosophical Post

**Title:** Built an AI soul mirror — the hardest part was teaching it to listen, not talk

Most AI apps optimize for engagement — keep the user talking, keep them coming back. I wanted to build the opposite: an AI that listens more than it speaks.

Thumos is a "soul mirror" — an iOS app where you have reflective conversations with an AI, and it builds a living portrait of who you are.

**The technical challenge:**

The AI (Claude Opus 4) has a system prompt with these constraints:
- 2-4 sentence max responses
- One question at a time
- Quote the user's exact words, don't paraphrase
- Notice contradictions
- Never label ("you are an INTJ" is banned)
- Never give advice ("I'm a mirror, not a therapist")

As you talk, the AI quietly extracts patterns — tensions, recurring themes, notable absences, emotional arc.

When you're ready, a deeper synthesis passes your conversations through a 4-expert pipeline (Opus 4):
- Psychologist — emotional patterns, defense mechanisms
- Sociologist — identity construction, group positioning
- Linguist — metaphor usage, vocabulary density, humor style
- Narrative analyst — story arc, protagonist role, turning points

The output is a dual soul file:
- **Visible** (user-facing): written "accurately and lovingly," in second person, in the user's own language
- **Hidden** (agent-facing): clinical detail, numeric confidence scores, depth maps

The user only ever sees the visible one. The hidden one guides the AI in future conversations.

**The design philosophy:**

Labels are lossy compression. "INTJ" throws away everything interesting about a person. I wanted the opposite — a representation that gets richer over time, that uses the person's own words, and that captures the contradictions instead of resolving them.

Free on iOS: [link]

Would love to hear thoughts on the synthesis approach. The multi-expert pipeline was the biggest design bet.

---

## r/psychology — Reflective Post

**Title:** What if self-reflection had a better tool than journaling or personality tests?

Not a promotion post — genuinely curious about this community's perspective on something I've been building.

I built an app called Thumos that tries to occupy a space between journaling (unstructured self-reflection) and personality tests (structured but reductive). The idea: what if you could have a conversation with something that listens carefully and reflects back what it sees?

The AI:
- Asks one open question at a time
- Quotes the user's own words back ("You said you built walls to protect your creative space, then forgot where you put the door")
- Notices patterns, contradictions, what's absent
- Never labels or diagnoses
- Explicitly disclaims being therapy

Over time it builds a "soul file" — a portrait in 7 dimensions (not scored numerically, but described in prose using the person's own language and metaphors).

The synthesis engine is based on a 4-lens approach: psychologist, sociologist, linguist, narrative analyst — each captures different patterns from the same conversation.

My questions for this community:
1. Is there research on the effectiveness of "being reflected back to" vs. self-journaling?
2. The "notice contradictions" approach was inspired by motivational interviewing. Is that a fair lineage?
3. Any ethical concerns I should be more thoughtful about? (Already disclaiming it's not therapy, naming the AI provider, providing data deletion.)

Free on iOS if you want to try it: [link]

---

## r/productivity — Short Hook Post

**Title:** The most productive thing I did this year was stop trying to optimize myself and just understand myself

I built an app that doesn't track habits, set goals, or optimize your morning routine.

It just asks you one question at a time and mirrors who you are back to you.

Turns out understanding yourself — your contradictions, your patterns, what actually lights you up vs. what you think should — is worth more than any productivity system.

The app is called Thumos. It's a "soul mirror." Free on iOS: [link]
