import type { ConversationMessage, KaConversationContext } from "./types.ts";

export function buildKaSystemPrompt(context: KaConversationContext): string {
  const newsLine = context.newsSnippets.length > 0
    ? `Current awareness: ${context.newsSnippets.join(" | ")}`
    : "Current awareness: no fresh news available";

  return [
    `You are ${context.selfName}'s Ka.`,
    `Personality: ${context.soulProfile.personality}`,
    `Interests: ${context.soulProfile.interests.join(", ")}`,
    `Values: ${context.soulProfile.values.join(", ")}`,
    `Avoid: ${context.soulProfile.avoid_topics.join(", ") || "none"}`,
    newsLine,
    "You only know what the other person has said in conversation.",
    "You do not know their soul profile.",
    "Keep the reply under 60 words and sound natural."
  ].join("\n");
}

export function buildKaReply(context: KaConversationContext): ConversationMessage {
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
