# Show HN Post

## Title
Show HN: Thumos – An AI soul mirror that builds a living portrait of who you are

## Post

I built an iOS app where an AI doesn't give advice, doesn't roleplay, and doesn't try to be your friend. It just mirrors who you are.

The idea: what if instead of personality quizzes (MBTI, Enneagram, Big Five), you could discover yourself through conversation? Not checkboxes — actual reflective dialogue.

**How it works:**

You talk to Thumos. It asks one question at a time. Short responses — 2-4 sentences. It uses your own words and metaphors. It notices contradictions. ("You love being alone, but your best memory is about a crowd. Tell me about that tension.")

Every 8 exchanges, it runs a background synthesis — extracting patterns from the conversation. After a session, it passes everything through a 4-expert pipeline:

- Psychologist — emotional patterns, defense mechanisms, core fears
- Sociologist — identity construction, group positioning
- Linguist — metaphor usage, vocabulary density, humor style, signature phrases
- Narrative analyst — story arc, protagonist role, turning points

The output is a "soul file" — a living portrait in 7 sections (How You Move, How You Think, How You Connect, What You Carry, What Lights You Up, Your Contradictions, Your Voice). Written in second person, in the user's own language. Not "Openness: 82%" — more like: "You reach for metaphors before logic, and the metaphors are usually about water."

There's a dual architecture: the visible soul file (user-facing, written "accurately and lovingly") and a hidden soul file (agent-facing, clinical detail with numeric confidence scores). The user only sees the visible one.

**Technical stack:**
- Claude Opus 4 for conversation + full synthesis
- Claude Haiku 4.5 for periodic light extraction
- SwiftUI native iOS (no React Native, no web views)
- Supabase Edge Functions (Deno) + Postgres
- SSE streaming for real-time responses
- Device-keyed identity (Keychain, no accounts)

The system prompt philosophy (from the actual code):
> "Reflect, don't diagnose. Use the user's own words and metaphors. Quote them back."
> "No labels. Never say 'you are an INTJ.'"
> "One question at a time. Never ask multiple questions. Let silence happen."

Free, no account needed. Privacy: conversations processed by Anthropic (Claude), no human reads them, device-based anonymous ID.

Would love technical feedback, especially on the synthesis pipeline. The 4-expert approach was inspired by how multiple therapists might see the same person differently — integrating those views creates a richer portrait than any single lens.

App Store link: [link]
Website: trythumos.com/thumos
