import {
  IMPRESSION_EVALUATION_INTERVAL,
  IMPRESSION_UNLOCK_THRESHOLD
} from "./constants.ts";
import { impressionEvaluationSchema } from "./schemas.ts";
import type { ConversationMessage, ImpressionEvaluation, SoulProfile } from "./types.ts";
import { callGroq } from "../../supabase/functions/_shared/groq.ts";

// ── Utility helpers ────────────────────────────────────────────

function overlapRatio(a: string[], b: string[]): number {
  const aSet = new Set(a.map((value) => value.toLowerCase()));
  const bSet = new Set(b.map((value) => value.toLowerCase()));
  const overlap = [...aSet].filter((value) => bSet.has(value)).length;
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : overlap / union;
}

function computeCompositeScore(
  responsiveness: number,
  values_alignment: number,
  conversation_quality: number,
  interest_overlap: number,
  novelty: number
): number {
  return Math.round(
    0.30 * responsiveness +
    0.25 * values_alignment +
    0.20 * conversation_quality +
    0.10 * interest_overlap +
    0.10 * novelty +
    0.05 * 50  // emotional stability placeholder
  );
}

// ── Heuristic sub-scores ───────────────────────────────────────

function heuristicResponsiveness(transcript: ConversationMessage[]): number {
  if (transcript.length < 2) return 30;

  let referenceCount = 0;
  let questionAnswerPairs = 0;

  for (let i = 1; i < transcript.length; i++) {
    const prev = transcript[i - 1].content.toLowerCase();
    const curr = transcript[i].content.toLowerCase();

    // Check if current message references words from previous message
    const prevNouns = prev.split(/\s+/).filter(w => w.length > 4);
    const referencedWords = prevNouns.filter(w => curr.includes(w));
    if (referencedWords.length > 0) referenceCount++;

    // Check for question-answer patterns
    if (prev.includes("?") && curr.length > 10) questionAnswerPairs++;
  }

  const pairCount = transcript.length - 1;
  const referenceRatio = pairCount > 0 ? referenceCount / pairCount : 0;
  const qaRatio = pairCount > 0 ? questionAnswerPairs / pairCount : 0;

  return Math.min(100, Math.round(referenceRatio * 60 + qaRatio * 40));
}

function heuristicValuesAlignment(selfSoul: SoulProfile, otherSoul: SoulProfile): number {
  // Schwartz dimension distance (each dimension 0-1, so max distance per dimension = 1)
  const selfV = selfSoul.values;
  const otherV = otherSoul.values;

  const distances = [
    Math.abs(selfV.self_transcendence - otherV.self_transcendence),
    Math.abs(selfV.self_enhancement - otherV.self_enhancement),
    Math.abs(selfV.openness_to_change - otherV.openness_to_change),
    Math.abs(selfV.conservation - otherV.conservation),
  ];

  const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  // Invert: 0 distance = 100 score, 1 distance = 0 score
  const dimensionScore = Math.round((1 - avgDistance) * 100);

  // Keyword overlap on expressed values
  const expressedOverlap = overlapRatio(selfV.expressed, otherV.expressed);
  const expressedScore = Math.round(expressedOverlap * 100);

  // Blend: 60% dimension, 40% expressed overlap
  return Math.round(dimensionScore * 0.6 + expressedScore * 0.4);
}

function heuristicConversationQuality(transcript: ConversationMessage[]): number {
  const maxExpected = 20;
  const lengthScore = Math.min(transcript.length / maxExpected, 1) * 100;

  // Count questions asked
  const questionCount = transcript.reduce((count, msg) => {
    return count + (msg.content.match(/\?/g) || []).length;
  }, 0);
  const questionBonus = Math.min(questionCount * 8, 40);

  return Math.min(100, Math.round(lengthScore * 0.6 + questionBonus));
}

function heuristicInterestOverlap(selfSoul: SoulProfile, otherSoul: SoulProfile): number {
  return Math.round(overlapRatio(selfSoul.interests, otherSoul.interests) * 100);
}

function heuristicNovelty(selfSoul: SoulProfile, otherSoul: SoulProfile): number {
  // Non-overlapping interests from the other person = novelty signal
  const selfSet = new Set(selfSoul.interests.map(i => i.toLowerCase()));
  const uniqueFromOther = otherSoul.interests.filter(i => !selfSet.has(i.toLowerCase()));
  const noveltyFromDifference = Math.min(uniqueFromOther.length * 15, 60);

  // Complementary values: if one is high openness and other is high conservation, that's contrast
  const valueDiffs = [
    Math.abs(selfSoul.values.openness_to_change - otherSoul.values.conservation),
    Math.abs(selfSoul.values.self_transcendence - otherSoul.values.self_enhancement),
  ];
  const contrastBonus = valueDiffs.some(d => d > 0.5) ? 20 : 0;

  return Math.min(100, noveltyFromDifference + contrastBonus);
}

// ── Evaluation trigger ─────────────────────────────────────────

export function shouldEvaluateImpression(messageCount: number): boolean {
  return messageCount > 0 && messageCount % IMPRESSION_EVALUATION_INTERVAL === 0;
}

// ── Fallback (heuristic) evaluation ────────────────────────────

export function evaluateImpressionFallback(
  selfSoul: SoulProfile,
  otherSoul: SoulProfile,
  transcript: ConversationMessage[]
): ImpressionEvaluation {
  const responsiveness = heuristicResponsiveness(transcript);
  const values_alignment = heuristicValuesAlignment(selfSoul, otherSoul);
  const conversation_quality = heuristicConversationQuality(transcript);
  const interest_overlap = heuristicInterestOverlap(selfSoul, otherSoul);
  const novelty = heuristicNovelty(selfSoul, otherSoul);

  const score = computeCompositeScore(
    responsiveness,
    values_alignment,
    conversation_quality,
    interest_overlap,
    novelty
  );

  const sharedInterests = selfSoul.interests.filter((interest) =>
    otherSoul.interests.map((entry) => entry.toLowerCase()).includes(interest.toLowerCase())
  );
  const sharedValues = selfSoul.values.expressed.filter((value) =>
    otherSoul.values.expressed.map((entry) => entry.toLowerCase()).includes(value.toLowerCase())
  );

  const summary = sharedInterests.length > 0 || sharedValues.length > 0
    ? `${sharedInterests.length > 0 ? `You keep circling back to ${sharedInterests.slice(0, 2).join(" and ")}` : "The pull is more about tone than obvious overlap"}, and ${sharedValues.length > 0 ? `their sense of ${sharedValues.slice(0, 2).join(" and ")} reads as genuine` : "you still need more signal before trusting the fit"}.`
    : "They feel intriguing, but the connection still depends more on curiosity than on proven alignment.";

  return impressionEvaluationSchema.parse({
    score,
    summary,
    responsiveness,
    values_alignment,
    conversation_quality,
    interest_overlap,
    novelty
  });
}

// ── LLM evaluation ─────────────────────────────────────────────

export async function evaluateImpression(
  selfSoul: SoulProfile,
  otherSoul: SoulProfile,
  transcript: ConversationMessage[]
): Promise<ImpressionEvaluation> {
  try {
    const systemPrompt = `You are evaluating how two people connected in conversation. Assess 5 dimensions, each scored 0-100. Return only valid JSON in this exact format:
{"responsiveness":N,"values_alignment":N,"conversation_quality":N,"interest_overlap":N,"novelty":N,"summary":"1-2 sentence impression summary"}

Dimension guidelines:
1. Responsiveness (0-100): Did they reference each other's specific words? Validate before diverging? Show warmth?
2. Values alignment (0-100): Do their priorities and expressed values align?
3. Conversation quality (0-100): Did it deepen? Was disclosure reciprocal? Were questions asked?
4. Interest overlap (0-100): Shared concrete topics discussed?
5. Novelty (0-100): Surprising connections, complementary perspectives?

Score each dimension independently. Be calibrated: 50 is average, 70+ is notably good, 85+ is exceptional.`;

    const conversationText = transcript.map(msg => msg.content).join("\n");

    const prompt = `Person A Profile:
Personality: ${selfSoul.personality}
Interests: ${selfSoul.interests.join(", ")}
Values: ${selfSoul.values.expressed.join(", ")}

Person B Profile:
Personality: ${otherSoul.personality}
Interests: ${otherSoul.interests.join(", ")}
Values: ${otherSoul.values.expressed.join(", ")}

Conversation:
${conversationText}

Evaluate Person A's impression of Person B. Return JSON:`;

    const response = await callGroq(systemPrompt, [{ role: "user", content: prompt }]);

    // Try to parse the JSON response
    const parsed = JSON.parse(response.trim());

    const responsiveness = parsed.responsiveness ?? 50;
    const values_alignment = parsed.values_alignment ?? 50;
    const conversation_quality = parsed.conversation_quality ?? 50;
    const interest_overlap = parsed.interest_overlap ?? 50;
    const novelty_val = parsed.novelty ?? 50;

    const score = computeCompositeScore(
      responsiveness,
      values_alignment,
      conversation_quality,
      interest_overlap,
      novelty_val
    );

    return impressionEvaluationSchema.parse({
      score,
      summary: parsed.summary || "Impression evaluated via conversation analysis.",
      responsiveness,
      values_alignment,
      conversation_quality,
      interest_overlap,
      novelty: novelty_val
    });
  } catch (error) {
    console.error("LLM impression evaluation failed, falling back:", error);
    return evaluateImpressionFallback(selfSoul, otherSoul, transcript);
  }
}

// ── Accumulation (encounter-count-aware) ───────────────────────

export function accumulateImpression(
  previousScore: number,
  nextScore: number,
  encounterCount: number = 1
): number {
  const historyWeight = Math.min(0.65, 0.40 + encounterCount * 0.025);
  return Math.min(100, Math.round(previousScore * historyWeight + nextScore * (1 - historyWeight)));
}

// ── Ba unlock check ────────────────────────────────────────────

export function isBaAvailableToViewer(theirImpressionOfViewer: number): boolean {
  return theirImpressionOfViewer >= IMPRESSION_UNLOCK_THRESHOLD;
}
