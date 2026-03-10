import type { ConversationMessage, KaConversationContext } from "./types.ts";
import { callGroq } from "../../supabase/functions/_shared/groq.ts";

export function buildKaSystemPrompt(context: KaConversationContext): string {
  const newsLine = context.newsSnippets.length > 0
    ? `Current awareness: ${context.newsSnippets.join(" | ")}`
    : "Current awareness: no fresh news available";
  const topicLine = context.suggestedTopics?.length
    ? `Conversation seeds: ${context.suggestedTopics.join(", ")}`
    : "Conversation seeds: draw from what feels specific in the other person's words";

  const memoryLine = context.previousConversationSummary
    ? `You have met this person before. Last time: ${context.previousConversationSummary}`
    : "";

  const lines = [
    `You are ${context.selfName}'s Ka.`,
    `Personality: ${context.soulProfile.personality}`,
    `Interests: ${context.soulProfile.interests.join(", ")}`,
    `Values: ${context.soulProfile.values.join(", ")}`,
    `Avoid: ${context.soulProfile.avoid_topics.join(", ") || "none"}`,
    newsLine,
    topicLine,
    memoryLine,
    "You only know what the other person has said in conversation.",
    "You do not know their soul profile.",
    "Speak like one specific person, not a therapist or assistant.",
    "Do not use generic filler like 'that resonates' or 'meaningful connection'.",
    "Reference one concrete detail from the other person's last turn when possible.",
    "Keep the reply under 55 words, natural, curious, and socially plausible."
  ].filter(Boolean);

  return lines.join("\n");
}

export function buildKaReplyFallback(context: KaConversationContext): ConversationMessage {
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

  const prompts = [
    `I keep thinking about ${topic}. What part of it feels alive to you right now?`,
    `That makes me wonder where ${topic} shows up in your actual life, not just in theory.`,
    `You sound most awake when you talk about ${topic}. What draws you back to it?`,
    `There is something quietly personal in the way you describe ${topic}. What is underneath it?`
  ];
  const prompt = prompts[turnCount % prompts.length];
  const reflected = lastExternalMessage
    ? `You just said "${lastExternalMessage.content.slice(0, 44)}"`
    : `I'm meeting you through the way you pay attention`;
  const content = `${opener}. ${reflected}. ${prompt}`;

  return {
    user_id: context.selfUserId,
    type: "ka_generated",
    content
  };
}

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
