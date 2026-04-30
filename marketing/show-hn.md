# Show HN Post

## Title
Show HN: Thumos – AI conversations replace swiping to match on who you actually are

## URL
https://trythumos.com

## Post

I built an iOS app that replaces swiping with AI conversations. Instead of photos, Thumos builds a living psychological portrait of who you are in relationships, then matches you with compatible people based on that portrait. Your portrait is never shared — matches only see your display name and a compatibility story.

**The problem I'm solving:**

Dating apps match on photos. Questionnaire-based apps (eHarmony, OkCupid) match on self-reported answers. Both miss the same thing: how you actually show up in relationships. A conversation reveals attachment patterns, conflict styles, and values that people can't accurately self-report on a form.

**How it works:**

1. You talk to the Soul Mirror — a reflective AI that asks one question at a time, uses your own words and metaphors, and notices contradictions. It's not a chatbot that gives advice. It's a mirror.

2. As you talk, it builds a living portrait covering: How You Light Up, How You Show Up, How You Love, How You Weather Storms, What You're Looking For, and Your Growing Edges. Plus a Soul Compass (8-axis radar: openness, vitality, warmth, connection, resilience, purpose, depth, autonomy) and Personality Spectrum (5 continuums like consistency↔curiosity, calm↔sensitive).

3. Once the portrait reaches sufficient depth, Thumos evaluates compatibility with other users across romance dimensions — attachment fit, conflict compatibility, love language resonance, values alignment, partnership vision. Each match comes with a personalized compatibility story, not a percentage.

**Architecture:**

There's a dual portrait system: a visible portrait (user-facing, written "accurately and lovingly") and a hidden portrait (agent-facing, clinical detail with confidence scores). The user only sees the visible one. The matching engine reads both.

**Technical stack:**
- Claude by Anthropic for conversation + synthesis + match evaluation
- SwiftUI native iOS (no React Native, no web views)
- Cloudflare Workers + Neon Postgres
- Structured output (Zod schemas → JSON schema for LLM responses)
- Device-keyed identity (Keychain, no accounts)
- Fire-and-poll architecture: POST returns immediately, LLM processes async, client polls for new messages

From the system prompt:
> "Reflect, don't diagnose. Use the user's own words and metaphors. Quote them back."
> "One question at a time. Never ask multiple questions. Let silence happen."

**Privacy model:**

Your portrait is never shared with other users. Matches see only your display name + a compatibility story. No photos, no profiles, no public presence. Conversations processed by Anthropic's Claude API — no human reads them, no training on your data.

Free, no account needed, iPhone only. Early stage — small user base, still growing.

Would love technical feedback, especially on the matching approach. Using LLMs for compatibility evaluation (reading two full portraits and evaluating across dimensions) is a different bet than collaborative filtering or embedding similarity.

App Store: https://apps.apple.com/us/app/thumos-the-soul-mirror/id6761300301
Website: https://trythumos.com
