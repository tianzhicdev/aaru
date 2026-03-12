import {
  IMPRESSION_EVALUATION_INTERVAL,
  IMPRESSION_UNLOCK_THRESHOLD
} from "./constants.ts";
import { impressionEvaluationSchema } from "./schemas.ts";
import type { ConversationMessage, ImpressionEvaluation, SoulProfile } from "./types.ts";
import { callGroq } from "../../supabase/functions/_shared/groq.ts";

function overlapRatio(a: string[], b: string[]): number {
  const aSet = new Set(a.map((value) => value.toLowerCase()));
  const bSet = new Set(b.map((value) => value.toLowerCase()));
  const overlap = [...aSet].filter((value) => bSet.has(value)).length;
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : overlap / union;
}

function sentimentBoost(transcript: ConversationMessage[]): number {
  const positives = ["curious", "love", "enjoy", "drawn", "warm", "care", "meaningful", "interesting"];
  const joined = transcript.map((message) => message.content.toLowerCase()).join(" ");
  return Math.min(positives.filter((token) => joined.includes(token)).length * 3, 12);
}

export function shouldEvaluateImpression(messageCount: number): boolean {
  return messageCount > 0 && messageCount % IMPRESSION_EVALUATION_INTERVAL === 0;
}

export function evaluateImpressionFallback(
  selfSoul: SoulProfile,
  otherSoul: SoulProfile,
  transcript: ConversationMessage[]
): ImpressionEvaluation {
  const interestScore = overlapRatio(selfSoul.interests, otherSoul.interests) * 34;
  const valueScore = overlapRatio(selfSoul.values, otherSoul.values) * 28;
  const engagementScore = Math.min(transcript.length / 10, 1) * 18;
  const contrastBonus = selfSoul.interests.some((interest) =>
    otherSoul.interests.every((entry) => entry.toLowerCase() !== interest.toLowerCase())
  ) ? 6 : 0;
  const score = Math.round(Math.min(100, interestScore + valueScore + engagementScore + contrastBonus + sentimentBoost(transcript)));

  const sharedInterests = selfSoul.interests.filter((interest) =>
    otherSoul.interests.map((entry) => entry.toLowerCase()).includes(interest.toLowerCase())
  );
  const sharedValues = selfSoul.values.filter((value) =>
    otherSoul.values.map((entry) => entry.toLowerCase()).includes(value.toLowerCase())
  );

  const summary = sharedInterests.length > 0 || sharedValues.length > 0
    ? `${sharedInterests.length > 0 ? `You keep circling back to ${sharedInterests.slice(0, 2).join(" and ")}` : "The pull is more about tone than obvious overlap"}, and ${sharedValues.length > 0 ? `their sense of ${sharedValues.slice(0, 2).join(" and ")} reads as genuine` : "you still need more signal before trusting the fit"}.`
    : "They feel intriguing, but the connection still depends more on curiosity than on proven alignment.";

  // Sub-scores: responsiveness from engagement, quality from interest+value overlap
  const responsiveness = Math.round(Math.min(100, engagementScore / 18 * 100));
  const conversation_quality = Math.round(Math.min(100, (interestScore + valueScore) / 62 * 100));

  return impressionEvaluationSchema.parse({ score, summary, responsiveness, conversation_quality });
}

export async function evaluateImpression(
  selfSoul: SoulProfile,
  otherSoul: SoulProfile,
  transcript: ConversationMessage[]
): Promise<ImpressionEvaluation> {
  try {
    const systemPrompt = `You are evaluating how compatible two people are based on their conversation and soul profiles. Return only valid JSON in this format: {"score": 0-100, "summary": "one sentence under 200 characters", "responsiveness": 0-100, "conversation_quality": 0-100}.

Score guidelines:
- score: overall compatibility (0-30 poor, 31-60 mixed, 61-85 good, 86-100 exceptional)
- responsiveness: how engaged and responsive both parties are in the conversation (0-100)
- conversation_quality: depth, substance, and chemistry of the exchange (0-100)

Consider:
- Shared interests and values
- Conversation flow and engagement
- Emotional resonance and understanding
- Personal chemistry and intrigue

IMPORTANT: Keep the summary under 200 characters. Return only JSON, no other text.`;

    const conversationText = transcript.map(msg => msg.content).join("\n");

    const prompt = `Person A Profile:
Personality: ${selfSoul.personality}
Interests: ${selfSoul.interests.join(", ")}
Values: ${selfSoul.values.join(", ")}

Person B Profile:
Personality: ${otherSoul.personality}
Interests: ${otherSoul.interests.join(", ")}
Values: ${otherSoul.values.join(", ")}

Conversation:
${conversationText}

Evaluate Person A's impression of Person B. Return JSON:`;

    const response = await callGroq(systemPrompt, [{ role: "user", content: prompt }]);

    // Try to parse the JSON response
    const parsed = JSON.parse(response.trim());
    return impressionEvaluationSchema.parse(parsed);
  } catch (error) {
    console.error("LLM impression evaluation failed, falling back:", error);
    return evaluateImpressionFallback(selfSoul, otherSoul, transcript);
  }
}

export function accumulateImpression(previousScore: number, nextScore: number): number {
  return Math.min(100, Math.round(previousScore * 0.55 + nextScore * 0.45));
}

export function isBaAvailableToViewer(theirImpressionOfViewer: number): boolean {
  return theirImpressionOfViewer >= IMPRESSION_UNLOCK_THRESHOLD;
}
