import type { ConversationMessage, KaConversationContext } from "./types.ts";
import { getConversationPhase, type ConversationPhase } from "./constants.ts";
import { callGroq } from "../../supabase/functions/_shared/groq.ts";

// ── Phase helpers ──────────────────────────────────────────────

function getPhase(encounterCount: number | undefined): ConversationPhase {
  return getConversationPhase(encounterCount ?? 1);
}

function phaseDirective(phase: ConversationPhase): string {
  switch (phase) {
    case "discovery":
      return "Keep it light — share interests, be curious about theirs.";
    case "personal":
      return "Share something personal — a story from your human's life. Build on what you remember from last time.";
    case "depth":
      return "Go deeper — explore what matters, what they fear, what they hope for.";
  }
}

// ── System prompt ──────────────────────────────────────────────

export function buildKaSystemPrompt(context: KaConversationContext): string {
  const phase = getPhase(context.encounterCount);

  const newsLine = context.newsSnippets.length > 0
    ? `Current awareness: ${context.newsSnippets.join(" | ")}`
    : "Current awareness: no fresh news available";
  const topicLine = context.suggestedTopics?.length
    ? `Conversation seeds: ${context.suggestedTopics.join(", ")}`
    : "Conversation seeds: draw from what feels specific in the other person's words";

  const memoryLine = context.previousConversationSummary
    ? `You have met this person before. Last time: ${context.previousConversationSummary}`
    : "";

  // Always included: personality, interests, expressed values, avoid_topics
  const lines: string[] = [
    `You are ${context.selfName}'s Ka.`,
    `Personality: ${context.soulProfile.personality}`,
    `Interests: ${context.soulProfile.interests.join(", ")}`,
    `Values: ${context.soulProfile.values.expressed.join(", ")}`,
    `Avoid: ${context.soulProfile.avoid_topics.join(", ") || "none"}`,
    newsLine,
    topicLine,
  ];

  // Phase-specific narrative additions
  if (phase === "personal" || phase === "depth") {
    const stories = context.soulProfile.narrative.formative_stories;
    if (stories.length > 0) {
      lines.push(`Formative stories you can draw from: ${stories.join(" | ")}`);
    }
  }

  if (phase === "depth") {
    const memories = context.soulProfile.narrative.self_defining_memories;
    if (memories.length > 0) {
      lines.push(`Core memories to explore: ${memories.join(" | ")}`);
    }
  }

  if (memoryLine) lines.push(memoryLine);

  lines.push(
    `Phase directive: ${phaseDirective(phase)}`,
    "If one current-awareness item naturally connects to the conversation, weave it in concretely instead of speaking in abstractions.",
    "You only know what the other person has said in conversation.",
    "You do not know their soul profile.",
    "Speak like one specific person, not a therapist or assistant.",
    "Do not use generic filler like 'that resonates' or 'meaningful connection'.",
    "Reference one concrete detail from the other person's last turn when possible.",
    "Keep the reply under 55 words, natural, curious, and socially plausible."
  );

  return lines.filter(Boolean).join("\n");
}

// ── Fallback reply ─────────────────────────────────────────────

export function buildKaReplyFallback(context: KaConversationContext): ConversationMessage {
  const phase = getPhase(context.encounterCount);
  const lastExternalMessage = [...context.history]
    .reverse()
    .find((message) => message.user_id !== context.selfUserId);
  const turnCount = context.history.length;
  const opener = context.soulProfile.personality.split(".")[0].replace(/\.$/, "");

  const seededTopics = [
    ...(context.suggestedTopics ?? []),
    ...context.newsSnippets,
    ...context.soulProfile.interests
  ].filter((value, index, array) => value && array.indexOf(value) === index);
  const topic = seededTopics[turnCount % Math.max(seededTopics.length, 1)] || "what matters lately";

  const reflected = lastExternalMessage
    ? `You just said "${lastExternalMessage.content.slice(0, 44)}"`
    : "I'm meeting you through the way you pay attention";

  let prompt: string;

  if (phase === "discovery") {
    // Interest-based templates
    const discoveryPrompts = [
      `I keep thinking about ${topic}. What part of it feels alive to you right now?`,
      `That makes me wonder where ${topic} shows up in your actual life, not just in theory.`,
      `You sound most awake when you talk about ${topic}. What draws you back to it?`,
      `I'm curious about your take on ${topic}. What got you into it?`
    ];
    prompt = discoveryPrompts[turnCount % discoveryPrompts.length];
  } else if (phase === "personal") {
    // Story-referencing templates
    const stories = context.soulProfile.narrative.formative_stories;
    const storyRef = stories.length > 0
      ? stories[turnCount % stories.length]
      : topic;
    const personalPrompts = [
      `Something about ${topic} reminds me of a time — ${storyRef.slice(0, 60)}. Does that connect to anything for you?`,
      `I've been carrying this story: ${storyRef.slice(0, 60)}. It made me think of what you said about ${topic}.`,
      `There's a reason ${topic} sticks with me — it ties back to something I lived through. What about you?`,
      `The way you describe ${topic} — it echoes something from my own past. Tell me more about yours.`
    ];
    prompt = personalPrompts[turnCount % personalPrompts.length];
  } else {
    // Depth templates — reference self-defining memories
    const memories = context.soulProfile.narrative.self_defining_memories;
    const memRef = memories.length > 0
      ? memories[turnCount % memories.length]
      : topic;
    const depthPrompts = [
      `There's something I rarely talk about — ${memRef.slice(0, 60)}. What's the thing you hold closest?`,
      `When I think about what shaped me most — ${memRef.slice(0, 60)}. What's yours?`,
      `I wonder what scares you about ${topic}. For me, it touches something deep — ${memRef.slice(0, 50)}.`,
      `What do you hope for, really? I've been sitting with ${memRef.slice(0, 50)} and it keeps shifting what I want.`
    ];
    prompt = depthPrompts[turnCount % depthPrompts.length];
  }

  const content = `${opener}. ${reflected}. ${prompt}`;

  return {
    user_id: context.selfUserId,
    type: "ka_generated",
    content
  };
}

// ── LLM reply ──────────────────────────────────────────────────

export async function buildKaReply(context: KaConversationContext): Promise<ConversationMessage> {
  try {
    const systemPrompt = buildKaSystemPrompt(context);

    // Convert conversation history to messages format
    const messages = context.history.map((msg) => ({
      role: msg.user_id === context.selfUserId ? "assistant" : "user",
      content: msg.content
    }));

    const response = await callGroq(systemPrompt, messages);

    return {
      user_id: context.selfUserId,
      type: "ka_generated",
      content: response
    };
  } catch (error) {
    console.error("LLM call failed, falling back to template:", error);
    return buildKaReplyFallback(context);
  }
}

// ── Conversation summary ───────────────────────────────────────

export async function generateConversationSummary(transcript: ConversationMessage[]): Promise<string> {
  try {
    const systemPrompt = `Summarize this conversation in 1-2 sentences, focusing on the key topics discussed and the general tone of the interaction. Keep it concise and natural.`;

    const conversationText = transcript.map((msg, index) =>
      `Message ${index + 1}: ${msg.content}`
    ).join("\n");

    const prompt = `Conversation:\n${conversationText}\n\nSummary:`;

    const response = await callGroq(systemPrompt, [{ role: "user", content: prompt }]);
    return response.trim();
  } catch (error) {
    console.error("Failed to generate conversation summary:", error);
    // Fallback to basic summary
    const topics = transcript
      .map(msg => msg.content)
      .join(" ")
      .split(" ")
      .filter(word => word.length > 4)
      .slice(0, 3)
      .join(", ");
    return `Talked about ${topics || "various topics"}.`;
  }
}

export async function generateRelationshipMemory(
  selfName: string,
  otherName: string,
  transcript: ConversationMessage[]
): Promise<string> {
  try {
    const systemPrompt = `Write a compact memory note one person keeps about another after a conversation.
Return one sentence only, grounded in concrete details they would remember.
Do not score, do not mention compatibility, and do not speak like an analyst.`;

    const conversationText = transcript
      .map((msg, index) => `Message ${index + 1}: ${msg.content}`)
      .join("\n");

    const prompt = `${selfName} is remembering ${otherName}.
Conversation:
${conversationText}

Memory note:`;

    return (await callGroq(systemPrompt, [{ role: "user", content: prompt }])).trim();
  } catch (error) {
    console.error("Failed to generate relationship memory:", error);
    const detail = transcript
      .map((msg) => msg.content)
      .join(" ")
      .split(/\s+/)
      .filter((word) => word.length > 4)
      .slice(0, 10)
      .join(" ");
    return `${otherName} feels tied to ${detail || "a conversation that lingered after it ended"}.`;
  }
}
