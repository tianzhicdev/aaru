# Brainstorm

Observations from first real user (ce9765f4, Apr 5 2026). Two 3-minute sessions, 31 messages, went from "I like the outdoors" to childhood abuse disclosure. Never saw their soul file.

---

## 1. Setting the stage — quiet space, no interruptions

The best conversations happen when people are uninterrupted and present. This user's second session was 9:30pm — probably alone, probably quiet. That's when it got deep.

We need to somehow convey: "Find a quiet place. Put your phone on Do Not Disturb. Give yourself at least 10 minutes."

Possible channels:
- **Onboarding screen** — a single card before the first conversation: "This works best in a quiet moment. No rush."
- **Opening message tone** — the AI's first message already sets a reflective mood, but we could be more explicit about inviting slowness
- **Push notification copy** — when we add push, the nudge text matters. "Got 10 quiet minutes?" vs "Come reflect"
- **App Store description / landing page** — set expectations before download
- **Loading/transition screen** — a brief moment of stillness before the conversation appears (breath, not spinner)

The tension: we don't want to gatekeep or make it feel like homework. It should feel like an invitation, not a prerequisite. The user who came back at 9:30pm found their own quiet moment — we just need to make it easier for others to find theirs.

## 2. Soul file discoverability

This user had 31 messages and 3 reflection snapshots but never tapped the Soul File tab. Zero visible soul file rows — synthesis never triggered because it's on-demand via `GET /get-soul-file`.

Current behavior: soul file synthesis only runs when the user visits the Soul File tab. If they never look, it never generates.

Questions:
- Should we generate the soul file proactively after N messages regardless of whether they visit the tab? (We already trigger reflection snapshots at 10 messages — could piggyback soul file synthesis onto that.)
- Is the tab obvious enough? The user might not know what "Soul File" means or why they'd tap it.
- Should the conversation itself reference the soul file? e.g. after a deep exchange, the AI could say "I've been building a picture of who you are — you can see it in your Soul File whenever you're ready."
- A subtle badge/indicator on the tab when new content is available?
- First-time prompt: after the first reflection snapshot generates, show a one-time nudge: "Your soul file is taking shape. Take a look."

The risk of proactive generation: wasted compute if they never look. But if the soul file IS the product — the living mirror — then maybe we should always generate it and find ways to draw people toward it.
