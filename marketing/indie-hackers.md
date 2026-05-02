# IndieHackers Post

## Title
I built an AI soul mirror — here's the journey from idea to App Store

## Post

Hey IH! Shipping my first iOS app: **Magpie** — a soul mirror.

### What it is

An AI that helps you understand who you really are through reflective conversation. Not a chatbot companion, not a personality quiz, not therapy. A mirror.

You talk. It listens, quotes your own words back, notices contradictions. Over multiple conversations, it builds a "soul file" — a living portrait in 7 sections, written in your own language.

### Why I built it

Personality tests always felt reductive. "You're an INTJ." Cool — but that throws away everything interesting about me. The contradiction between loving solitude and thriving in crowds. The fact that I reach for water metaphors. The thing I always avoid talking about.

I wanted a tool that captures the full picture — not a label, but a portrait. Something that gets richer over time instead of flattening you into a type.

### The stack

- **iOS**: SwiftUI, native (no React Native)
- **Backend**: Cloudflare Workers + Neon Postgres
- **AI**: Claude Opus 4 (conversation + synthesis), Haiku 4.5 (light extraction)
- **Hosting**: Cloudflare Pages (website)
- **Cost to run**: ~$110/year minimum (Apple Developer + domain). API costs are usage-based.

### Numbers (honest)

- Development time: [X weeks]
- Lines of TypeScript: ~2,500 (domain logic)
- Lines of Swift: ~2,000 (display layer)
- Test coverage: 79 tests, all passing
- Total cost to build: $99 (Apple Developer) + API costs during development

### What I learned

1. **Teaching AI to shut up is harder than teaching it to talk.** The system prompt enforces 2-4 sentence max, one question at a time. Getting an LLM to be laconic is a real design challenge.

2. **The 4-expert synthesis pipeline was the best decision.** Running conversations through psychologist, sociologist, linguist, and narrative analyst lenses produces dramatically richer portraits than a single prompt.

3. **Dual soul file architecture matters.** Users see a "lovingly accurate" portrait. The AI sees clinical detail with confidence scores. Same data, two views.

4. **No accounts = no friction.** Device-keyed identity via Keychain. Users start talking in under 5 seconds.

5. **SSE streaming changes the conversation feel.** Responses appear word by word. Makes the AI feel like it's thinking, not just outputting.

### Revenue model

Free for now. Exploring:
- Premium tier for deeper features
- One-time purchase for advanced capabilities

Not optimizing for revenue yet. Optimizing for the core experience.

### Ask

Try it. Have one conversation. Check your soul file. I'd love honest feedback — especially on whether the portrait feels accurate.

iOS: [App Store link]
Web: trymagpie.xyz
