import { buildKaReply, generateConversationSummary } from "../../../src/domain/ka.ts";
import { evaluateImpression, accumulateImpression, isBaAvailableToViewer } from "../../../src/domain/impression.ts";
import { OFFLINE_MAX_CONVERSATIONS_PER_DAY, OFFLINE_MAX_MESSAGES_PER_CONVERSATION } from "../../../src/domain/constants.ts";
import { jsonResponse } from "../../../src/lib/http.ts";
import { installEdgeHandler } from "../_shared/edge.ts";
import {
  listOfflineUsers,
  countUserConversationsToday,
  createConversation,
  getSoulProfile,
  getUserById,
  listRecentConversationSummaries,
  insertMessage,
  insertConversationSummary,
  updateConversation,
  upsertImpressionEdge,
  getImpressionEdge,
  getDefaultInstanceId
} from "../_shared/db.ts";
import type { ConversationMessage } from "../../../src/domain/types.ts";

async function runOfflineConversation(
  userAId: string,
  userBId: string,
  instanceId: string
): Promise<{ conversationId: string; messageCount: number; impressionScoreA: number; impressionScoreB: number }> {
  // Get user profiles
  const [userA, userB, soulA, soulB] = await Promise.all([
    getUserById(userAId),
    getUserById(userBId),
    getSoulProfile(userAId),
    getSoulProfile(userBId)
  ]);

  if (!userA || !userB || !soulA || !soulB) {
    throw new Error("Missing user data for offline conversation");
  }

  // Create conversation
  const conversation = await createConversation(instanceId, userAId, userBId);

  // Fetch previous conversation context for both users
  let previousConversationSummaryA: string | undefined;
  let previousConversationSummaryB: string | undefined;

  try {
    const [summariesA, summariesB] = await Promise.all([
      listRecentConversationSummaries(userAId, userBId, 1),
      listRecentConversationSummaries(userBId, userAId, 1)
    ]);
    if (summariesA.length > 0) previousConversationSummaryA = summariesA[0].summary;
    if (summariesB.length > 0) previousConversationSummaryB = summariesB[0].summary;
  } catch (error) {
    console.error("Failed to fetch conversation history for offline conversation:", error);
  }

  // Build conversation topics
  const overlappingInterests = soulA.interests.filter(interest =>
    soulB.interests.some(other => other.toLowerCase() === interest.toLowerCase())
  );
  const suggestedTopics = [
    ...overlappingInterests,
    ...soulA.interests.slice(0, 2),
    ...soulB.interests.slice(0, 2)
  ].filter((value, index, array) => value && array.indexOf(value) === index).slice(0, 3);

  // Start with first message from user A
  let transcript: ConversationMessage[] = [];
  let currentSpeaker = userA;
  let currentSoul = soulA;
  let otherUser = userB;
  let otherSoul = soulB;
  let currentPrevSummary = previousConversationSummaryA;

  // Generate opening message
  const firstTopic = suggestedTopics[0] || "the things that draw us in";
  const openingMessage = `I keep thinking about how ${firstTopic} shapes who we are. What draws you to it?`;

  await insertMessage(conversation.id, currentSpeaker.id, "ka_generated", openingMessage);
  transcript.push({
    user_id: currentSpeaker.id,
    type: "ka_generated",
    content: openingMessage
  });

  // Continue conversation up to max messages
  for (let turn = 1; turn < OFFLINE_MAX_MESSAGES_PER_CONVERSATION; turn++) {
    // Swap speakers
    [currentSpeaker, otherUser] = [otherUser, currentSpeaker];
    [currentSoul, otherSoul] = [otherSoul, currentSoul];
    currentPrevSummary = currentSpeaker.id === userA.id ? previousConversationSummaryA : previousConversationSummaryB;

    try {
      const reply = await buildKaReply({
        selfUserId: currentSpeaker.id,
        selfName: currentSpeaker.display_name,
        soulProfile: currentSoul,
        newsSnippets: [], // No news for offline conversations
        suggestedTopics,
        history: transcript,
        previousConversationSummary: currentPrevSummary
      });

      await insertMessage(conversation.id, currentSpeaker.id, "ka_generated", reply.content);
      transcript.push(reply);
    } catch (error) {
      console.error(`Failed to generate message for offline conversation turn ${turn}:`, error);
      break;
    }
  }

  // Evaluate impressions
  const [evaluationA, evaluationB] = await Promise.all([
    evaluateImpression(soulA, soulB, transcript),
    evaluateImpression(soulB, soulA, transcript)
  ]);

  // Get existing impression scores
  const [reciprocalA, reciprocalB] = await Promise.all([
    getImpressionEdge(userAId, userBId),
    getImpressionEdge(userBId, userAId)
  ]);

  const scoreA = accumulateImpression(reciprocalA?.score ?? 0, evaluationA.score);
  const scoreB = accumulateImpression(reciprocalB?.score ?? 0, evaluationB.score);

  const baUnlockedForA = isBaAvailableToViewer(scoreB);
  const baUnlockedForB = isBaAvailableToViewer(scoreA);

  // Store impression results
  await Promise.all([
    upsertImpressionEdge(userAId, userBId, { ...evaluationA, score: scoreA }, baUnlockedForA),
    upsertImpressionEdge(userBId, userAId, { ...evaluationB, score: scoreB }, baUnlockedForB)
  ]);

  // Generate and store conversation summary
  try {
    const summary = await generateConversationSummary(transcript);
    await insertConversationSummary(conversation.id, userAId, userBId, summary);
  } catch (error) {
    console.error("Failed to generate summary for offline conversation:", error);
  }

  // End the conversation
  await updateConversation(conversation.id, {
    status: "ended",
    ended_at: new Date().toISOString(),
    impression_score: scoreA,
    impression_summary: evaluationA.summary,
    turn_count: transcript.length
  });

  return {
    conversationId: conversation.id,
    messageCount: transcript.length,
    impressionScoreA: scoreA,
    impressionScoreB: scoreB
  };
}

export async function handleAdvanceOfflineKas() {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // Get offline users
    const offlineUsers = await listOfflineUsers(thirtyMinutesAgo);
    console.log(`Found ${offlineUsers.length} offline users`);

    if (offlineUsers.length < 2) {
      return jsonResponse(200, {
        ok: true,
        message: "Not enough offline users for conversations",
        processed: 0,
        conversations: []
      });
    }

    const instanceId = await getDefaultInstanceId();
    const results = [];
    const processedUsers = new Set<string>();

    for (const userA of offlineUsers) {
      if (processedUsers.has(userA.id)) continue;

      // Check conversation limit for user A
      const conversationsToday = await countUserConversationsToday(userA.id);
      if (conversationsToday >= OFFLINE_MAX_CONVERSATIONS_PER_DAY) {
        console.log(`User ${userA.id} has reached daily conversation limit`);
        continue;
      }

      // Find eligible partner (offline, not processed, different user)
      const availablePartners = offlineUsers.filter(userB =>
        userB.id !== userA.id &&
        !processedUsers.has(userB.id)
      );

      if (availablePartners.length === 0) {
        console.log(`No available partners for user ${userA.id}`);
        continue;
      }

      // Pick random partner
      const userB = availablePartners[Math.floor(Math.random() * availablePartners.length)];

      try {
        console.log(`Starting offline conversation between ${userA.id} and ${userB.id}`);
        const result = await runOfflineConversation(userA.id, userB.id, instanceId);

        results.push({
          userA: userA.id,
          userB: userB.id,
          conversationId: result.conversationId,
          messageCount: result.messageCount,
          impressionScoreA: result.impressionScoreA,
          impressionScoreB: result.impressionScoreB
        });

        // Mark both users as processed
        processedUsers.add(userA.id);
        processedUsers.add(userB.id);

        console.log(`Completed offline conversation ${result.conversationId} with ${result.messageCount} messages`);

        // Respect rate limits - small delay between conversations
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to create offline conversation between ${userA.id} and ${userB.id}:`, error);
      }
    }

    return jsonResponse(200, {
      ok: true,
      processed: results.length,
      conversations: results
    });
  } catch (error) {
    console.error("Error in advance offline kas:", error);
    return jsonResponse(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

installEdgeHandler(handleAdvanceOfflineKas);