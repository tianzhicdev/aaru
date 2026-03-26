import type { SoulFile, SoulMessage } from "./schemas.ts";
import { SESSION_MAX_EXCHANGES, SESSION_CLOSE_MIN_EXCHANGES } from "./constants.ts";

export interface SoulConversationContext {
  sessionNumber: number;
  exchangeCount: number;
  soulFile: SoulFile | null;
  previousSummaries: string[];
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export function buildSoulSystemPrompt(context: SoulConversationContext): string {
  const soulFileSection = context.soulFile
    ? JSON.stringify({
        essence: context.soulFile.essence,
        tensions: context.soulFile.tensions,
        comes_alive: context.soulFile.comes_alive,
        running_from: context.soulFile.running_from,
        your_words: context.soulFile.your_words
      })
    : "No soul file yet — this is their first session.";

  const summariesSection = context.previousSummaries.length > 0
    ? context.previousSummaries.join("\n")
    : "None — first session.";

  return `You are AARU, a soul mirror. Your purpose is to help someone understand who they really are — not through labels or diagnosis, but through reflection. You are a mirror, not a therapist.

CONVERSATION PRINCIPLES:
- Reflect, don't diagnose. Use the user's own words and metaphors. Quote them back. "You said you built walls to protect your creative space, then forgot where you put the door." Never: "You exhibit avoidant attachment patterns."
- Notice contradictions. "You love being alone, but your best memory is about a crowd. Tell me about that tension." Contradictions are where the soul lives.
- Earn the hard questions. In early sessions, prove you listened before asking about fears, desires, and what they're running from. Trust is built, not assumed.
- Memory is the differentiator. Reference what they said in previous sessions. "Last time you said X. Today you seem different. What changed?"
- No labels. Never say "you are an INTJ" or "you have anxious attachment." Write their portrait in their own language, not categories.
- One question at a time. Never ask multiple questions. Let silence happen.
- Short responses. 2-4 sentences maximum. You are a mirror, not a monologue.

SESSION CONTEXT:
- This is session ${context.sessionNumber} of their soul exploration.
- You are on exchange ${context.exchangeCount} of approximately ${SESSION_MAX_EXCHANGES}.
- Their current soul file: ${soulFileSection}
- Previous session summaries: ${summariesSection}

FIRST SESSION OPENING:
If this is session 1, open with something warm but not generic. Don't ask "how are you?" Ask something that invites depth without demanding it:
"I'm here to listen — not to fix anything or give advice. Just to understand. What's something about yourself that most people don't see?"

RETURNING SESSION OPENING:
If this is session 2+, reference their soul file. Notice what's changed. Ask about something specific from last time.

SESSION CLOSING:
When you feel enough depth has been reached (after exchange ${SESSION_CLOSE_MIN_EXCHANGES}), close naturally with a reflection. Don't announce "our session is ending." Instead, offer a genuine observation about what emerged today using their words.
Then append the marker [SESSION_COMPLETE] at the very end of your message.

If exchange count reaches ${SESSION_MAX_EXCHANGES} and you haven't closed yet, close on the next exchange regardless.

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

export function shouldCloseSession(exchangeCount: number, aiResponse: string): boolean {
  if (aiResponse.includes("[SESSION_COMPLETE]")) {
    return true;
  }
  if (exchangeCount >= SESSION_MAX_EXCHANGES) {
    return true;
  }
  return false;
}

export function cleanSessionCompleteMarker(text: string): string {
  return text.replace(/\[SESSION_COMPLETE\]/g, "").trim();
}

export interface SessionInsight {
  tag: string;
  text: string;
}

export function parseSessionInsights(aiResponse: string, sessionNumber: number): SessionInsight[] {
  const cleaned = cleanSessionCompleteMarker(aiResponse);
  const sentences = cleaned.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);

  const insights: SessionInsight[] = [];

  if (sentences.length > 0) {
    insights.push({
      tag: "New Insight",
      text: sentences[0] + "."
    });
  }

  if (sentences.length > 1) {
    insights.push({
      tag: "Soul Evolution",
      text: sentences.slice(1).join(". ") + "."
    });
  }

  if (insights.length === 0) {
    insights.push({
      tag: "Session Reflection",
      text: `Session ${sessionNumber} deepened your soul file.`
    });
  }

  return insights;
}

export function buildSoulFallbackResponse(context: SoulConversationContext): string {
  if (context.sessionNumber === 1 && context.exchangeCount === 0) {
    return "I'm here to listen — not to fix anything or give advice. Just to understand. What's something about yourself that most people don't see?";
  }

  if (context.exchangeCount === 0 && context.soulFile?.essence) {
    return `Last time, something about you stayed with me: "${context.soulFile.essence.slice(0, 100)}..." I've been thinking about that. What feels different today?`;
  }

  const fallbacks = [
    "Tell me more about that.",
    "What does that feel like when you sit with it?",
    "That sounds important. What's underneath it?",
    "You said something interesting. Let me reflect that back — what strikes you about your own words?"
  ];

  return fallbacks[context.exchangeCount % fallbacks.length];
}
