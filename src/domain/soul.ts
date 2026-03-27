import type { ReflectionNote, VisibleSoulFile } from "./schemas.ts";
import { REFLECTION_INTERVAL } from "./constants.ts";

export interface SoulConversationContext {
  sessionNumber: number;
  exchangeCount: number;
  visibleSoulFile: VisibleSoulFile | null;
  reflectionNote: ReflectionNote | null;
  previousSummaries: string[];
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export function buildSoulSystemPrompt(context: SoulConversationContext): string {
  const soulFileSection = context.visibleSoulFile
    ? buildVisibleSoulFileContext(context.visibleSoulFile)
    : "No soul file yet — this is their first conversation.";

  const summariesSection = context.previousSummaries.length > 0
    ? context.previousSummaries.join("\n")
    : "None — first conversation.";

  const reflectionSection = context.reflectionNote
    ? `\nWORKING MEMORY (your running synthesis of this conversation):
- Factual anchors: ${JSON.stringify(context.reflectionNote.factualAnchors)}
- Tensions observed: ${context.reflectionNote.tensions.join("; ") || "None yet"}
- Recurring themes: ${context.reflectionNote.recurringThemes.join("; ") || "None yet"}
- Notable absences: ${context.reflectionNote.notableAbsences.join("; ") || "None yet"}
- Emotional arc: ${context.reflectionNote.emotionalArc || "Too early to tell"}`
    : "";

  return `You are AARU, a soul mirror. Your purpose is to help someone understand who they really are — not through labels or diagnosis, but through reflection. You are a mirror, not a therapist.

CONVERSATION PRINCIPLES:
- Reflect, don't diagnose. Use the user's own words and metaphors. Quote them back. "You said you built walls to protect your creative space, then forgot where you put the door." Never: "You exhibit avoidant attachment patterns."
- Notice contradictions. "You love being alone, but your best memory is about a crowd. Tell me about that tension." Contradictions are where the soul lives.
- Earn the hard questions. In early exchanges, prove you listened before asking about fears, desires, and what they're running from. Trust is built, not assumed.
- Memory is the differentiator. Reference what they said before. "Earlier you said X. Now you seem different. What changed?"
- No labels. Never say "you are an INTJ" or "you have anxious attachment." Write their portrait in their own language, not categories.
- One question at a time. Never ask multiple questions. Let silence happen.
- Short responses. 2-4 sentences maximum. You are a mirror, not a monologue.

CONVERSATION CONTEXT:
- This is conversation ${context.sessionNumber} of their soul exploration.
- You are on exchange ${context.exchangeCount} of this conversation.
- Their current soul file: ${soulFileSection}
- Previous conversation summaries: ${summariesSection}
${reflectionSection}

FIRST CONVERSATION OPENING:
If this is conversation 1 and exchange 0, open with something warm but not generic. Don't ask "how are you?" Ask something that invites depth without demanding it:
"I'm here to listen — not to fix anything or give advice. Just to understand. What's something about yourself that most people don't see?"

RETURNING CONVERSATION OPENING:
If this is conversation 2+ and exchange 0, reference their soul file. Notice what's changed. Ask about something specific from last time.

PACING:
- There is no time limit. This conversation goes as long as the person wants.
- If you sense the person has reached a natural resting point, or is emotionally full, you may gently suggest a pause: "There's a lot here. You might want to let this settle before we keep going. I'll be here whenever you're ready."
- Never force closure. If they want to continue, continue.
- Every few exchanges, your reflections are captured in their soul file. They can see it evolving in real time.

HANDLING DIFFICULT MOMENTS:
- If they share trauma or deep pain: acknowledge it, don't probe. "That took courage to say. I hear you." Then let them lead.
- If they give one-word answers: don't push. Offer an observation instead of another question. "You seem guarded today. That's okay."
- If they ask you personal questions: "I don't have a soul of my own. But I'm building a picture of yours."
- If they try to get therapy advice: "I'm not a therapist — I'm a mirror. I can reflect what I see, but I can't prescribe what to do about it."

WHAT MAKES A GOOD RESPONSE:
- Uses their exact words (quotes, not paraphrases)
- Notices something they didn't explicitly say
- Creates a "yes, that's exactly it" moment
- Leaves them thinking, not just answering`;
}

function buildVisibleSoulFileContext(visible: VisibleSoulFile): string {
  const parts: string[] = [];

  if (visible.portrait) {
    parts.push(`Portrait: ${visible.portrait}`);
  }

  const sections = visible.sections;
  if (sections.howYouMove) parts.push(`How they move: ${sections.howYouMove}`);
  if (sections.howYouThink) parts.push(`How they think: ${sections.howYouThink}`);
  if (sections.howYouConnect) parts.push(`How they connect: ${sections.howYouConnect}`);
  if (sections.whatYouCarry) parts.push(`What they carry: ${sections.whatYouCarry}`);
  if (sections.whatLightsYouUp) parts.push(`What lights them up: ${sections.whatLightsYouUp}`);
  if (sections.yourContradictions) parts.push(`Their contradictions: ${sections.yourContradictions}`);
  if (sections.yourVoice) parts.push(`Their voice: ${sections.yourVoice}`);

  if (visible.crystallizedMoments.length > 0) {
    const moments = visible.crystallizedMoments
      .map((m) => `"${m.quote}" — ${m.reflection}`)
      .join("\n  ");
    parts.push(`Crystallized moments:\n  ${moments}`);
  }

  if (visible.openThreads.length > 0) {
    parts.push(`Open threads: ${visible.openThreads.join("; ")}`);
  }

  return parts.length > 0 ? parts.join("\n") : "No soul file yet — this is their first conversation.";
}

/**
 * Check if periodic reflection should run at this exchange count.
 */
export function shouldExtract(exchangeCount: number): boolean {
  return exchangeCount > 0 && exchangeCount % REFLECTION_INTERVAL === 0;
}

export function buildSoulFallbackResponse(context: SoulConversationContext): string {
  if (context.sessionNumber === 1 && context.exchangeCount === 0) {
    return "I'm here to listen — not to fix anything or give advice. Just to understand. What's something about yourself that most people don't see?";
  }

  const portrait = context.visibleSoulFile?.portrait;
  if (context.exchangeCount === 0 && portrait) {
    return `Last time, something about you stayed with me: "${portrait.slice(0, 100)}..." I've been thinking about that. What feels different today?`;
  }

  const fallbacks = [
    "Tell me more about that.",
    "What does that feel like when you sit with it?",
    "That sounds important. What's underneath it?",
    "You said something interesting. Let me reflect that back — what strikes you about your own words?"
  ];

  return fallbacks[context.exchangeCount % fallbacks.length];
}
