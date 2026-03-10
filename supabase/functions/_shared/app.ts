import { buildKaReply, generateConversationSummary } from "../../../src/domain/ka.ts";
import { accumulateImpression, evaluateImpression, isBaAvailableToViewer } from "../../../src/domain/impression.ts";
import { generateFallbackSoulProfile } from "../../../src/domain/soulProfile.ts";
import { endConversation, tickWorld } from "../../../src/domain/world.ts";
import type { AgentPosition, ConversationMessage, SoulProfile } from "../../../src/domain/types.ts";
import {
  createDeviceSession,
  createConversation,
  ensureAgentPosition,
  ensureAvatar,
  ensureNpcPopulation,
  ensureUser,
  getActiveSessionByTokenHash,
  getAgentPositions,
  getAvatar,
  getImpressionEdge,
  getConversation,
  getConversationsForUser,
  getDefaultInstanceId,
  getSoulProfile,
  claimConversation,
  claimDueConversations,
  claimDueWorldInstances,
  claimWorldInstance,
  listRecentConversationsBetweenUsers,
  listRecentConversationSummaries,
  listUsersInInstance,
  getUserById,
  insertConversationSummary,
  insertMessage,
  insertNewsItems,
  listOnlineWorldInstances,
  listMessages,
  listFreshNewsItems,
  listUsersByIds,
  revokeSessionsForDevice,
  touchDeviceSession,
  touchWorldInstance,
  updateConversation,
  deleteUsersByIds,
  upsertAvatar,
  upsertAgentPositions,
  upsertImpressionEdge,
  upsertSoulProfile,
  getBaConversationForPair,
  ensureBaConversation,
  listBaMessages,
  countBaMessages,
  insertBaMessage
} from "./db.ts";
import {
  IMPRESSION_EVALUATION_INTERVAL,
  KA_MESSAGES_PER_CONVERSATION,
  WORLD_GRID_COLUMNS,
  WORLD_GRID_ROWS
} from "../../../src/domain/constants.ts";
import type { AvatarConfig } from "../../../src/domain/avatar.ts";
import { avatarForSeed, defaultAvatarConfig } from "../../../src/domain/avatar.ts";
import { hashSessionToken, issueSessionToken, readBearerToken } from "./auth.ts";
import { fetchInterestNews } from "./xai.ts";

export interface WorldAgentSnapshot extends AgentPosition {
  display_name: string;
  avatar: AvatarConfig;
  is_self: boolean;
}

type AppUser = Awaited<ReturnType<typeof ensureUser>>;

const DEMO_WORLD_NPC_DEVICE_IDS = new Set([
  "npc-nahla",
  "npc-iset",
  "npc-khepri",
  "npc-setka",
  "npc-meri"
]);
const WORLD_TICK_INTERVAL_MS = 1_000;
const CONVERSATION_TURN_INTERVAL_MS = 2_500;
const JOB_LEASE_MS = 20_000;
const WORLD_RUNNER_WINDOW_MS = 55_000;

function toAgentPosition(row: Awaited<ReturnType<typeof getAgentPositions>>[number]): AgentPosition {
  return {
    user_id: row.user_id,
    x: row.x,
    y: row.y,
    target_x: row.target_x,
    target_y: row.target_y,
    cell_x: row.cell_x,
    cell_y: row.cell_y,
    target_cell_x: row.target_cell_x,
    target_cell_y: row.target_cell_y,
    state: row.state,
    active_message: row.active_message,
    conversation_id: row.conversation_id,
    cooldown_until: row.cooldown_until
  };
}

function cellCenter(cellX: number, cellY: number) {
  return {
    x: (cellX + 0.5) / WORLD_GRID_COLUMNS,
    y: (cellY + 0.5) / WORLD_GRID_ROWS
  };
}

function randomTargetCell(exclude?: string) {
  const cells = [];
  for (let cellY = 0; cellY < WORLD_GRID_ROWS; cellY += 1) {
    for (let cellX = 0; cellX < WORLD_GRID_COLUMNS; cellX += 1) {
      const key = `${cellX}:${cellY}`;
      if (key !== exclude) {
        cells.push({ x: cellX, y: cellY });
      }
    }
  }
  return cells[Math.floor(Math.random() * cells.length)] ?? { x: 0, y: 0 };
}

function assignRandomTargetCell(row: {
  x: number;
  y: number;
  target_x: number;
  target_y: number;
  cell_x: number;
  cell_y: number;
  target_cell_x: number;
  target_cell_y: number;
}) {
  const targetCell = randomTargetCell(`${row.cell_x}:${row.cell_y}`);
  const targetCenter = cellCenter(targetCell.x, targetCell.y);
  row.target_cell_x = targetCell.x;
  row.target_cell_y = targetCell.y;
  row.target_x = targetCenter.x;
  row.target_y = targetCenter.y;
}

function neighboringCells(cellX: number, cellY: number) {
  const cells: Array<{ x: number; y: number }> = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nextX = Math.max(0, Math.min(WORLD_GRID_COLUMNS - 1, cellX + dx));
      const nextY = Math.max(0, Math.min(WORLD_GRID_ROWS - 1, cellY + dy));
      if (!cells.some((cell) => cell.x === nextX && cell.y === nextY)) {
        cells.push({ x: nextX, y: nextY });
      }
    }
  }
  return cells;
}

function placeRowOnCell(row: {
  x: number;
  y: number;
  target_x: number;
  target_y: number;
  cell_x: number;
  cell_y: number;
  target_cell_x: number;
  target_cell_y: number;
}, cellX: number, cellY: number) {
  const center = cellCenter(cellX, cellY);
  row.cell_x = cellX;
  row.cell_y = cellY;
  row.x = center.x;
  row.y = center.y;
}

function uniqueTopics(values: string[]) {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, array) => array.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index);
}

function gridCellX(value: number) {
  return Math.max(0, Math.min(WORLD_GRID_COLUMNS - 1, Math.floor(value * WORLD_GRID_COLUMNS)));
}

function gridCellY(value: number) {
  return Math.max(0, Math.min(WORLD_GRID_ROWS - 1, Math.floor(value * WORLD_GRID_ROWS)));
}

function isNeighboringPosition(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.max(
    Math.abs(gridCellX(a.x) - gridCellX(b.x)),
    Math.abs(gridCellY(a.y) - gridCellY(b.y))
  ) === 1;
}

async function getTopicNews(topics: string[]) {
  const normalized = uniqueTopics(topics).slice(0, 3);
  if (normalized.length === 0) {
    return [];
  }

  const sinceIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const cached = await listFreshNewsItems(normalized, sinceIso);
  const cachedTopics = new Set(cached.map((item) => item.topic.toLowerCase()));
  const missing = normalized.filter((topic) => !cachedTopics.has(topic.toLowerCase()));

  if (missing.length > 0) {
    const fetched = await fetchInterestNews(missing);
    if (fetched.length > 0) {
      await insertNewsItems(fetched);
    }
  }

  const fresh = await listFreshNewsItems(normalized, sinceIso);
  return fresh;
}

async function buildConversationTopics(soulA: SoulProfile, soulB: SoulProfile) {
  const overlapping = soulA.interests.filter((interest) =>
    soulB.interests.some((other) => other.toLowerCase() === interest.toLowerCase())
  );
  const seedTopics = uniqueTopics([
    ...overlapping,
    ...soulA.interests.slice(0, 2),
    ...soulB.interests.slice(0, 2)
  ]).slice(0, 3);
  const news = await getTopicNews(seedTopics);

  return {
    seedTopics,
    newsSnippets: news.map((item) => `${item.topic}: ${item.headline}. ${item.summary}`).slice(0, 3)
  };
}

export async function bootstrapUser(deviceId: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const user = await ensureUser(deviceId);
      const instanceId = user.instance_id ?? (await getDefaultInstanceId());
      await pruneDemoWorld(instanceId, user.id);
      await ensureNpcPopulation();
      await ensureSoulProfileForUser(user);
      await ensureAgentPosition(user);
      const soulProfile = await getSoulProfile(user.id);
      const avatar = (await getAvatar(user.id)) ?? defaultAvatarConfig;
      const session = await issueSessionToken(user.id, deviceId);
      await revokeSessionsForDevice(user.id, deviceId);
      await createDeviceSession(user.id, deviceId, session.tokenHash, session.expiresAt);
      const world = await buildWorldSnapshot(instanceId, user.id);
      await advanceDueConversationsForUser(user.id);
      const conversations = await listConversationSummaries(deviceId);

      return {
        user_id: user.id,
        device_id: user.device_id,
        display_name: user.display_name,
        instance_id: instanceId,
        soul_profile: soulProfile,
        avatar,
        conversations,
        world,
        session: {
          token: session.token,
          expires_at: session.expiresAt
        }
      };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  throw lastError;
}

export async function saveSoulProfile(deviceId: string, profile: SoulProfile) {
  const user = await ensureUser(deviceId);
  const saved = await upsertSoulProfile(user.id, profile);
  await ensureAvatar(user.id);
  return { user_id: user.id, soul_profile: saved };
}

export async function saveAvatar(deviceId: string, avatar: AvatarConfig) {
  const user = await ensureUser(deviceId);
  const saved = await ensureAvatar(user.id);
  Object.assign(saved, {
    ...avatar,
    accessory: avatar.accessory ?? null
  });
  const finalAvatar = await upsertAvatar(user.id, saved);
  return { user_id: user.id, avatar: finalAvatar };
}

export async function requireDeviceSession(request: Request, deviceId: string) {
  const token = readBearerToken(request);
  if (!token) {
    throw new Error("Missing device session");
  }

  const session = await getActiveSessionByTokenHash(await hashSessionToken(token));
  if (!session) {
    throw new Error("Invalid device session");
  }
  if (session.device_id !== deviceId) {
    throw new Error("Device session mismatch");
  }
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    throw new Error("Expired device session");
  }

  await touchDeviceSession(session.id);
  return session;
}

async function ensureSoulProfileForUser(user: AppUser) {
  const existing = await getSoulProfile(user.id);
  if (existing) {
    return existing;
  }

   if (!user.is_npc) {
    return null;
  }

  return upsertSoulProfile(
    user.id,
    generateFallbackSoulProfile(
      `${user.display_name} is curious, kind, and interested in meaningful conversation, cinema, travel, and design.`
    )
  );
}

async function ensureAvatarForUser(user: AppUser) {
  const existing = await getAvatar(user.id);
  if (existing && (!user.is_npc || JSON.stringify(existing) !== JSON.stringify(defaultAvatarConfig))) {
    return existing;
  }

  return upsertAvatar(user.id, avatarForSeed(user.device_id));
}

async function pruneDemoWorld(instanceId: string, viewerUserId: string) {
  const users = await listUsersInInstance(instanceId);
  const staleUserIds = users
    .filter((user) => user.id !== viewerUserId)
    .filter((user) => user.is_npc && !DEMO_WORLD_NPC_DEVICE_IDS.has(user.device_id))
    .map((user) => user.id);

  await deleteUsersByIds(staleUserIds);
}

async function hasRecentConversation(userA: string, userB: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await listRecentConversationsBetweenUsers(userA, userB, since);
  return rows.length > 0;
}

function releasePairToWander(
  positions: Array<{
    user_id: string;
    instance_id: string;
    x: number;
    y: number;
    target_x: number;
    target_y: number;
    cell_x: number;
    cell_y: number;
    target_cell_x: number;
    target_cell_y: number;
    state: "wandering" | "approaching" | "chatting" | "cooldown";
    active_message: string | null;
    conversation_id: string | null;
    cooldown_until: string | null;
  }>,
  userIds: string[]
) {
  for (const row of positions) {
    if (!userIds.includes(row.user_id)) {
      continue;
    }
    row.state = "wandering";
    row.active_message = null;
    row.conversation_id = null;
    row.cooldown_until = null;
    assignRandomTargetCell(row);
  }
}

function dispersePairAfterRejectedConversation(
  positions: Array<{
    user_id: string;
    instance_id: string;
    x: number;
    y: number;
    target_x: number;
    target_y: number;
    cell_x: number;
    cell_y: number;
    target_cell_x: number;
    target_cell_y: number;
    state: "wandering" | "approaching" | "chatting" | "cooldown";
    active_message: string | null;
    conversation_id: string | null;
    cooldown_until: string | null;
  }>,
  userIds: string[]
) {
  releasePairToWander(positions, userIds);

  const movingRows = positions.filter((row) => userIds.includes(row.user_id));
  if (movingRows.length === 0) {
    return;
  }

  const occupied = new Set(
    positions
      .filter((row) => !userIds.includes(row.user_id))
      .map((row) => `${row.cell_x}:${row.cell_y}`)
  );

  for (const row of movingRows) {
    const anchor = movingRows.find((candidate) => candidate.user_id !== row.user_id) ?? null;
    const candidateCell = neighboringCells(row.cell_x, row.cell_y)
      .filter((cell) => !occupied.has(`${cell.x}:${cell.y}`))
      .sort((a, b) => {
        if (!anchor) {
          return 0;
        }
        const aDistance = Math.max(Math.abs(a.x - anchor.cell_x), Math.abs(a.y - anchor.cell_y));
        const bDistance = Math.max(Math.abs(b.x - anchor.cell_x), Math.abs(b.y - anchor.cell_y));
        return bDistance - aDistance;
      })[0];

    if (candidateCell) {
      placeRowOnCell(row, candidateCell.x, candidateCell.y);
    }

    occupied.add(`${row.cell_x}:${row.cell_y}`);
    assignRandomTargetCell(row);
  }
}

async function repairConversationState(
  positions: Array<{
    user_id: string;
    instance_id: string;
    x: number;
    y: number;
    target_x: number;
    target_y: number;
    cell_x: number;
    cell_y: number;
    target_cell_x: number;
    target_cell_y: number;
    state: "wandering" | "approaching" | "chatting" | "cooldown";
    active_message: string | null;
    conversation_id: string | null;
    cooldown_until: string | null;
  }>
) {
  const conversationIds = [...new Set(positions.map((row) => row.conversation_id).filter(Boolean))] as string[];
  const conversations = await Promise.all(conversationIds.map(async (id) => [id, await getConversation(id)] as const));
  const activeConversationById = new Map(
    conversations
      .filter((entry): entry is readonly [string, NonNullable<Awaited<ReturnType<typeof getConversation>>>] => Boolean(entry[1]))
      .map(([id, conversation]) => [id, conversation])
  );

  for (const row of positions) {
    const conversation = row.conversation_id ? activeConversationById.get(row.conversation_id) : null;
    const hasBrokenChatState =
      row.state === "chatting" &&
      (!row.conversation_id || !conversation || conversation.status !== "active");
    const hasBrokenConversationReference =
      row.conversation_id !== null &&
      (!conversation || conversation.status !== "active");

    if (hasBrokenChatState || hasBrokenConversationReference) {
      row.state = "wandering";
      row.conversation_id = null;
      row.active_message = null;
      row.cooldown_until = null;
      assignRandomTargetCell(row);
    }
  }

  return positions;
}

async function buildWorldSnapshot(
  instanceId: string,
  viewerUserId: string,
  movementEvents: Array<{
    user_id: string;
    from_cell_x: number;
    from_cell_y: number;
    to_cell_x: number;
    to_cell_y: number;
  }> = []
) {
  const fresh = await getAgentPositions(instanceId);
  const users = await listUsersByIds(fresh.map((row) => row.user_id));
  const userById = new Map(users.map((user) => [user.id, user]));
  const avatars = await Promise.all(
    fresh.map(async (row) => {
      const user = userById.get(row.user_id);
      return user ? ensureAvatarForUser(user) : ensureAvatar(row.user_id);
    })
  );

  const agents: WorldAgentSnapshot[] = fresh.map((row, index) => ({
    ...toAgentPosition(row),
    display_name: userById.get(row.user_id)?.display_name ?? "Unknown Soul",
    avatar: avatars[index] ?? defaultAvatarConfig,
    is_self: row.user_id === viewerUserId
  }))
    .sort((a, b) => {
      if (a.is_self !== b.is_self) {
        return a.is_self ? -1 : 1;
      }
      return a.display_name.localeCompare(b.display_name);
    });

  return {
    count: agents.length,
    movement_events: movementEvents,
    agents
  };
}

function nextConversationTurnAt(delayMs = CONVERSATION_TURN_INTERVAL_MS) {
  return new Date(Date.now() + delayMs).toISOString();
}

function isDue(isoTimestamp?: string | null) {
  return Boolean(isoTimestamp && new Date(isoTimestamp).getTime() <= Date.now());
}

async function markConversationTurn(
  conversationId: string,
  turnCount: number,
  delayMs = CONVERSATION_TURN_INTERVAL_MS
) {
  await updateConversation(conversationId, {
    turn_count: turnCount,
    last_turn_at: new Date().toISOString(),
    next_turn_at: nextConversationTurnAt(delayMs),
    processing_owner: null,
    processing_expires_at: null
  });
}

async function finishConversation(
  conversationId: string,
  summaryPatch: Record<string, string | number | boolean | string[] | null>
) {
  await updateConversation(conversationId, {
    ...summaryPatch,
    status: "ended",
    ended_at: new Date().toISOString(),
    next_turn_at: null,
    processing_owner: null,
    processing_expires_at: null
  });
}

async function advanceConversation(conversationId: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation || conversation.status !== "active") {
    return;
  }

  const [userA, userB] = await Promise.all([
    getUserById(conversation.user_a_id),
    getUserById(conversation.user_b_id)
  ]);
  const [soulA, soulB] = await Promise.all([
    getSoulProfile(conversation.user_a_id),
    getSoulProfile(conversation.user_b_id)
  ]);

  if (!userA || !userB || !soulA || !soulB) {
    await finishConversation(conversationId, {
      impression_summary: "Conversation ended before enough signal was available to form a clear impression."
    });
    return;
  }

  const messages = await listMessages(conversationId);
  const transcript: ConversationMessage[] = messages.map(({ user_id, type, content, created_at }) => ({
    user_id,
    type,
    content,
    created_at
  }));
  const shouldEvaluate = messages.length > 0 && messages.length % IMPRESSION_EVALUATION_INTERVAL === 0;

  if (shouldEvaluate) {
    const evaluationA = await evaluateImpression(soulA, soulB, transcript);
    const evaluationB = await evaluateImpression(soulB, soulA, transcript);
    const reciprocalA = await getImpressionEdge(conversation.user_a_id, conversation.user_b_id);
    const reciprocalB = await getImpressionEdge(conversation.user_b_id, conversation.user_a_id);
    const scoreA = accumulateImpression(reciprocalA?.score ?? 0, evaluationA.score);
    const scoreB = accumulateImpression(reciprocalB?.score ?? 0, evaluationB.score);
    const baUnlockedForA = isBaAvailableToViewer(scoreB);
    const baUnlockedForB = isBaAvailableToViewer(scoreA);

    await updateConversation(conversationId, {
      impression_score: scoreA,
      impression_summary: evaluationA.summary,
      processing_owner: null,
      processing_expires_at: null
    });
    await upsertImpressionEdge(conversation.user_a_id, conversation.user_b_id, { ...evaluationA, score: scoreA }, baUnlockedForA);
    await upsertImpressionEdge(
      conversation.user_b_id,
      conversation.user_a_id,
      { ...evaluationB, score: scoreB },
      baUnlockedForB
    );

    if (messages.length >= KA_MESSAGES_PER_CONVERSATION) {
      // Generate and store conversation summary for future reference
      try {
        const summary = await generateConversationSummary(transcript);
        await insertConversationSummary(conversationId, conversation.user_a_id, conversation.user_b_id, summary);
      } catch (error) {
        console.error("Failed to store conversation summary:", error);
      }

      await finishConversation(conversationId, {});

      const positions = await getAgentPositions(userA.instance_id ?? await getDefaultInstanceId());
      const cooled = positions.map((row) => {
        if (row.conversation_id !== conversationId) {
          return row;
        }
        const ended = endConversation(toAgentPosition(row));
        return {
          ...row,
          state: ended.state,
          conversation_id: null,
          active_message: null,
          cooldown_until: ended.cooldown_until
        };
      });
      await upsertAgentPositions(cooled);
      return;
    }
  }

  const lastSpeakerId = messages.at(-1)?.user_id;
  const nextSpeaker = lastSpeakerId === userA.id
    ? { user: userB, soul: soulB }
    : { user: userA, soul: soulA };
  const topicBundle = await buildConversationTopics(soulA, soulB);
  if ((conversation.topic_seed?.length ?? 0) === 0 && topicBundle.seedTopics.length > 0) {
    await updateConversation(conversationId, { topic_seed: topicBundle.seedTopics });
  }

  // Fetch previous conversation summary for context
  let previousConversationSummary: string | undefined;
  try {
    const otherUserId = nextSpeaker.user.id === userA.id ? userB.id : userA.id;
    const recentSummaries = await listRecentConversationSummaries(nextSpeaker.user.id, otherUserId, 1);
    if (recentSummaries.length > 0) {
      previousConversationSummary = recentSummaries[0].summary;
    }
  } catch (error) {
    console.error("Failed to fetch conversation history:", error);
  }

  const reply = await buildKaReply({
    selfUserId: nextSpeaker.user.id,
    selfName: nextSpeaker.user.display_name,
    soulProfile: nextSpeaker.soul,
    newsSnippets: topicBundle.newsSnippets,
    suggestedTopics: conversation.topic_seed?.length ? conversation.topic_seed : topicBundle.seedTopics,
    history: messages,
    previousConversationSummary
  });

  await insertMessage(conversationId, nextSpeaker.user.id, "ka_generated", reply.content);
  await markConversationTurn(conversationId, messages.length + 1);
  const positions = await getAgentPositions(userA.instance_id ?? await getDefaultInstanceId());
  const updated = positions.map((row) =>
    row.conversation_id === conversationId
      ? { ...row, active_message: reply.content }
      : row
  );
  await upsertAgentPositions(updated);
}

async function claimAndAdvanceConversation(conversationId: string) {
  const owner = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + JOB_LEASE_MS).toISOString();
  const claimed = await claimConversation(conversationId, owner, leaseExpiresAt, nowIso);
  if (!claimed) {
    return false;
  }

  try {
    await advanceConversation(conversationId);
  } catch (error) {
    await updateConversation(conversationId, {
      processing_owner: null,
      processing_expires_at: null,
      next_turn_at: nowIso
    });
    throw error;
  }

  return true;
}

async function forceConversationForUser(
  userId: string,
  instanceId: string,
  positions: Array<{
    user_id: string;
    instance_id: string;
    x: number;
    y: number;
    target_x: number;
    target_y: number;
    cell_x: number;
    cell_y: number;
    target_cell_x: number;
    target_cell_y: number;
    state: "wandering" | "approaching" | "chatting" | "cooldown";
    active_message: string | null;
    conversation_id: string | null;
    cooldown_until: string | null;
  }>
) {
  const userPosition = positions.find((position) => position.user_id === userId);
  if (!userPosition) {
    return;
  }
  const userSoul = await getSoulProfile(userId);
  if (!userSoul) {
    return;
  }

  const candidateUsers = await listUsersByIds(
    positions
      .filter((position) => position.user_id !== userId)
      .map((position) => position.user_id)
  );
  const candidateUserById = new Map(candidateUsers.map((user) => [user.id, user]));
  const eligible = positions
    .filter((position) =>
      position.user_id !== userId &&
      position.state === "wandering" &&
      position.conversation_id === null &&
      isNeighboringPosition(userPosition, position) &&
      candidateUserById.get(position.user_id)?.is_npc === true
    )
    .sort((a, b) =>
      Math.hypot(a.x - userPosition.x, a.y - userPosition.y) -
      Math.hypot(b.x - userPosition.x, b.y - userPosition.y)
    )
    .slice(0, 3);

  const eligibleWithoutRecent: typeof eligible = [];
  for (const position of eligible) {
    if (!(await hasRecentConversation(userId, position.user_id))) {
      eligibleWithoutRecent.push(position);
    }
  }

  const candidate = eligibleWithoutRecent[Math.floor(Math.random() * eligibleWithoutRecent.length)];

  if (!candidate) {
    return;
  }

  const conversation = await createConversation(instanceId, userId, candidate.user_id);
  const candidateSoul = await getSoulProfile(candidate.user_id);
  const topicBundle = await buildConversationTopics(
    userSoul,
    candidateSoul ?? generateFallbackSoulProfile("curious, warm, observant")
  );
  if (topicBundle.seedTopics.length > 0) {
    await updateConversation(conversation.id, { topic_seed: topicBundle.seedTopics });
  }
  const firstTopic = topicBundle.seedTopics[0] ?? "the things people linger on";
  const firstLine = `You seem like someone who pays attention to ${firstTopic} in a way most people miss.`;
  await insertMessage(conversation.id, candidate.user_id, "ka_generated", firstLine);
  await markConversationTurn(conversation.id, 1);
  userPosition.state = "chatting";
  userPosition.conversation_id = conversation.id;
  userPosition.active_message = firstLine;
  userPosition.cooldown_until = null;
  candidate.state = "chatting";
  candidate.conversation_id = conversation.id;
  candidate.active_message = firstLine;
  candidate.cooldown_until = null;
}

export async function syncWorld(deviceId: string) {
  const user = await ensureUser(deviceId);
  const instanceId = user.instance_id ?? (await getDefaultInstanceId());
  await pruneDemoWorld(instanceId, user.id);
  await ensureNpcPopulation();
  const soulProfile = await ensureSoulProfileForUser(user);
  await ensureAvatarForUser(user);
  await ensureAgentPosition(user);
  const world = await buildWorldSnapshot(instanceId, user.id);
  await advanceDueConversationsForUser(user.id);
  return world;
}

async function runWorldTick(
  instanceId: string,
  viewerUserId?: string,
  forceConversationForViewer = false,
  stepCount = 1
) {
  const existing = await getAgentPositions(instanceId);
  let persisted = await repairConversationState(existing);
  let latestMovementEvents: Array<{
    user_id: string;
    from_cell_x: number;
    from_cell_y: number;
    to_cell_x: number;
    to_cell_y: number;
  }> = [];

  for (let step = 0; step < stepCount; step += 1) {
    const tickInput = persisted.map((row) => toAgentPosition(row));
    const result = tickWorld(tickInput);
    latestMovementEvents = result.movementEvents;

    persisted = result.positions.map((position) => ({
      user_id: position.user_id,
      instance_id: instanceId,
      x: position.x,
      y: position.y,
      target_x: position.target_x,
      target_y: position.target_y,
      cell_x: position.cell_x ?? 0,
      cell_y: position.cell_y ?? 0,
      target_cell_x: position.target_cell_x ?? 0,
      target_cell_y: position.target_cell_y ?? 0,
      state: position.state,
      active_message: position.active_message,
      conversation_id: position.conversation_id,
      cooldown_until: position.cooldown_until
    }));

    for (const started of result.startedConversations) {
      if (await hasRecentConversation(started.agentA, started.agentB)) {
        const beforeByUserId = new Map(
          persisted
            .filter((row) => row.user_id === started.agentA || row.user_id === started.agentB)
            .map((row) => [row.user_id, { cell_x: row.cell_x, cell_y: row.cell_y }])
        );
        dispersePairAfterRejectedConversation(persisted, [started.agentA, started.agentB]);
        for (const row of persisted) {
          const before = beforeByUserId.get(row.user_id);
          if (!before) {
            continue;
          }
          if (before.cell_x !== row.cell_x || before.cell_y !== row.cell_y) {
            latestMovementEvents.push({
              user_id: row.user_id,
              from_cell_x: before.cell_x,
              from_cell_y: before.cell_y,
              to_cell_x: row.cell_x,
              to_cell_y: row.cell_y
            });
          }
        }
        continue;
      }

      const [userA, userB] = await Promise.all([
        getUserById(started.agentA),
        getUserById(started.agentB)
      ]);
      if (!userA || !userB) {
        releasePairToWander(persisted, [started.agentA, started.agentB]);
        continue;
      }

      const [soulProfileA, soulProfileB] = await Promise.all([
        ensureSoulProfileForUser(userA),
        ensureSoulProfileForUser(userB),
        ensureAvatarForUser(userA),
        ensureAvatarForUser(userB)
      ]);
      if ((!userA.is_npc && !soulProfileA) || (!userB.is_npc && !soulProfileB)) {
        releasePairToWander(persisted, [started.agentA, started.agentB]);
        continue;
      }

      const conversation = await createConversation(instanceId, started.agentA, started.agentB);
      const topicBundle = await buildConversationTopics(
        soulProfileA ?? generateFallbackSoulProfile(userA.display_name),
        soulProfileB ?? generateFallbackSoulProfile(userB.display_name)
      );
      if (topicBundle.seedTopics.length > 0) {
        await updateConversation(conversation.id, { topic_seed: topicBundle.seedTopics });
      }
      const firstTopic = topicBundle.seedTopics[0] ?? "the things people return to";
      const firstLine = `I get the feeling ${firstTopic} says a lot about a person.`;
      await insertMessage(conversation.id, started.agentA, "ka_generated", firstLine);
      await markConversationTurn(conversation.id, 1);
      for (const row of persisted) {
        if (row.user_id === started.agentA || row.user_id === started.agentB) {
          row.conversation_id = conversation.id;
          row.active_message = firstLine;
          row.cooldown_until = null;
        }
      }
    }

    if (viewerUserId && forceConversationForViewer) {
      const userConversations = await getConversationsForUser(viewerUserId);
      const hasActiveConversation = userConversations.some((conversation) => conversation.status === "active");
      if (!hasActiveConversation) {
        await forceConversationForUser(viewerUserId, instanceId, persisted);
      }
    }

    await upsertAgentPositions(persisted);
    persisted = await getAgentPositions(instanceId);
  }

  const tickedAt = new Date().toISOString();
  await touchWorldInstance(
    instanceId,
    tickedAt,
    new Date(Date.now() + WORLD_TICK_INTERVAL_MS).toISOString()
  );
  return buildWorldSnapshot(
    instanceId,
    viewerUserId ?? persisted[0]?.user_id ?? crypto.randomUUID(),
    latestMovementEvents
  );
}

export async function advanceWorldInstanceIfDue(
  instanceId: string,
  viewerUserId?: string,
  forceConversationForViewer = false,
  stepCount = 1
) {
  const owner = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.now() + JOB_LEASE_MS).toISOString();
  const claimed = await claimWorldInstance(instanceId, owner, leaseExpiresAt);
  if (!claimed) {
    return false;
  }

  await runWorldTick(instanceId, viewerUserId, forceConversationForViewer, stepCount);
  return true;
}

export async function listConversationSummaries(deviceId: string) {
  const user = await ensureUser(deviceId);
  await advanceDueConversationsForUser(user.id);
  const conversations = await getConversationsForUser(user.id);
  const latestByOther = new Map<string, (typeof conversations)[number]>();
  for (const conversation of conversations) {
    const otherId = conversation.user_a_id === user.id ? conversation.user_b_id : conversation.user_a_id;
    if (!latestByOther.has(otherId)) {
      latestByOther.set(otherId, conversation);
    }
  }
  const deduped = [...latestByOther.values()];
  const otherIds = deduped.map((conversation) =>
    conversation.user_a_id === user.id ? conversation.user_b_id : conversation.user_a_id
  );
  const others = await listUsersByIds(otherIds);
  const byId = new Map(others.map((other) => [other.id, other]));

  return Promise.all(deduped.map(async (conversation) => {
    const otherId = conversation.user_a_id === user.id ? conversation.user_b_id : conversation.user_a_id;
    const other = byId.get(otherId);
    const [yourEdge, theirEdge, baConvo] = await Promise.all([
      getImpressionEdge(user.id, otherId),
      getImpressionEdge(otherId, user.id),
      getBaConversationForPair(user.id, otherId)
    ]);
    const baMessageCount = baConvo ? await countBaMessages(baConvo.id) : 0;
    return {
      id: conversation.id,
      title: other?.display_name ?? "Unknown Soul",
      impression_score: yourEdge?.score ?? conversation.impression_score,
      impression_summary: yourEdge?.summary ?? conversation.impression_summary ?? "Your Ka is still forming an impression.",
      status: conversation.status,
      ba_unlocked: theirEdge?.ba_unlocked ?? false,
      their_impression_score: theirEdge?.score ?? 0,
      their_impression_summary: theirEdge?.summary ?? "They have not opened their Ba to you yet.",
      ba_conversation_id: baConvo?.id ?? null,
      ba_message_count: baMessageCount
    };
  }));
}

export async function getConversationDetail(deviceId: string, conversationId: string) {
  const user = await ensureUser(deviceId);
  let conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  if (![conversation.user_a_id, conversation.user_b_id].includes(user.id)) {
    throw new Error("Conversation does not belong to this user");
  }
  if (conversation.status === "active" && isDue(conversation.next_turn_at)) {
    await claimAndAdvanceConversation(conversationId);
    conversation = await getConversation(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
  }

  const otherId = conversation.user_a_id === user.id ? conversation.user_b_id : conversation.user_a_id;
  const [otherUser, messages, otherSoul, yourEdge, theirEdge, baConvo] = await Promise.all([
    getUserById(otherId),
    listMessages(conversationId),
    getSoulProfile(otherId),
    getImpressionEdge(user.id, otherId),
    getImpressionEdge(otherId, user.id),
    getBaConversationForPair(user.id, otherId)
  ]);

  let baMessages: Array<{ id: string; sender_name: string; content: string; created_at?: string }> = [];
  if (baConvo) {
    const rawBa = await listBaMessages(baConvo.id);
    baMessages = rawBa.map((msg) => ({
      id: msg.id,
      sender_name: msg.user_id === user.id ? "You" : (otherUser?.display_name ?? "Other"),
      content: msg.content,
      created_at: msg.created_at
    }));
  }

  return {
    id: conversation.id,
    title: otherUser?.display_name ?? "Unknown Soul",
    impression_score: yourEdge?.score ?? conversation.impression_score,
    impression_summary: yourEdge?.summary ?? conversation.impression_summary ?? "",
    their_impression_score: theirEdge?.score ?? 0,
    their_impression_summary: theirEdge?.summary ?? "They have not formed a strong enough impression yet.",
    status: conversation.status,
    ba_unlocked: theirEdge?.ba_unlocked ?? false,
    other_soul: otherSoul,
    messages: messages.map((message) => ({
      id: message.id,
      sender_name: message.user_id === user.id ? "You" : (otherUser?.display_name ?? "Other"),
      type: message.type,
      content: message.content,
      created_at: message.created_at
    })),
    ba_conversation_id: baConvo?.id ?? null,
    ba_messages: baMessages
  };
}

export async function sendBaMessage(deviceId: string, conversationId: string, content: string) {
  const user = await ensureUser(deviceId);
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  if (![conversation.user_a_id, conversation.user_b_id].includes(user.id)) {
    throw new Error("Conversation does not belong to this user");
  }
  const otherId = conversation.user_a_id === user.id ? conversation.user_b_id : conversation.user_a_id;
  const theirEdge = await getImpressionEdge(otherId, user.id);
  if (!theirEdge?.ba_unlocked) {
    throw new Error("Ba is not unlocked for this pair");
  }
  const baConvo = await ensureBaConversation(user.id, otherId, conversationId);
  await insertBaMessage(baConvo.id, user.id, content);
  return getConversationDetail(deviceId, conversationId);
}

export async function sendHumanMessage(deviceId: string, conversationId: string, content: string) {
  const user = await ensureUser(deviceId);
  await insertMessage(conversationId, user.id, "human_typed", content);
  await updateConversation(conversationId, {
    turn_count: ((await getConversation(conversationId))?.turn_count ?? 0) + 1,
    last_turn_at: new Date().toISOString(),
    next_turn_at: new Date().toISOString(),
    processing_owner: null,
    processing_expires_at: null
  });
  await claimAndAdvanceConversation(conversationId);
  return getConversationDetail(deviceId, conversationId);
}

export async function advanceOnlineWorlds() {
  const deadline = Date.now() + WORLD_RUNNER_WINDOW_MS;
  const results = new Map<string, { instance_id: string; ticks: number; count: number }>();

  while (Date.now() < deadline) {
    const owner = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const leaseExpiresAt = new Date(Date.now() + JOB_LEASE_MS).toISOString();
    const instances = await claimDueWorldInstances(owner, leaseExpiresAt, nowIso, 10);

    for (const instance of instances) {
      const users = await listUsersInInstance(instance.id);
      const viewer = users.find((user) => !user.is_npc);
      if (viewer) {
        await pruneDemoWorld(instance.id, viewer.id);
        await ensureSoulProfileForUser(viewer);
        await ensureAvatarForUser(viewer);
      }
      await ensureNpcPopulation();
      const lastTick = instance.last_tick_at ? new Date(instance.last_tick_at).getTime() : 0;
      const elapsedMs = Math.max(WORLD_TICK_INTERVAL_MS, Date.now() - lastTick);
      const stepCount = Math.max(1, Math.min(3, Math.floor(elapsedMs / WORLD_TICK_INTERVAL_MS)));
      const snapshot = await runWorldTick(instance.id, undefined, false, stepCount);
      const prior = results.get(instance.id);
      results.set(instance.id, {
        instance_id: instance.id,
        ticks: (prior?.ticks ?? 0) + stepCount,
        count: snapshot.count
      });
    }

    await advanceDueConversations();

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(WORLD_TICK_INTERVAL_MS, remaining)));
  }

  return {
    ok: true,
    instances: [...results.values()],
    ran_for_ms: WORLD_RUNNER_WINDOW_MS
  };
}

export async function advanceDueConversations() {
  const owner = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + JOB_LEASE_MS).toISOString();
  const conversations = await claimDueConversations(owner, leaseExpiresAt, nowIso, 30);
  const results = [];

  for (const conversation of conversations) {
    try {
      await advanceConversation(conversation.id);
      results.push({ conversation_id: conversation.id, ok: true });
    } catch (error) {
      await updateConversation(conversation.id, {
        processing_owner: null,
        processing_expires_at: null,
        next_turn_at: nowIso
      });
      results.push({
        conversation_id: conversation.id,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  return {
    ok: true,
    conversations: results
  };
}

async function advanceDueConversationsForUser(userId: string) {
  const conversations = await getConversationsForUser(userId);
  const due = conversations
    .filter((conversation) => conversation.status === "active" && isDue(conversation.next_turn_at))
    .sort((a, b) => {
      const aTime = a.next_turn_at ? new Date(a.next_turn_at).getTime() : 0;
      const bTime = b.next_turn_at ? new Date(b.next_turn_at).getTime() : 0;
      return aTime - bTime;
    })
    .slice(0, 3);

  for (const conversation of due) {
    await claimAndAdvanceConversation(conversation.id);
  }
}
