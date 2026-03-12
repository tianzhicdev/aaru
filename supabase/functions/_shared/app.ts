import { buildKaReply, generateConversationSummary, generateRelationshipMemory } from "../../../src/domain/ka.ts";
import type { z } from "zod";
import { accumulateImpression, evaluateImpression, isBaAvailableToViewer } from "../../../src/domain/impression.ts";
import { generateFallbackSoulProfile } from "../../../src/domain/soulProfile.ts";
import { endConversation, tickWorld } from "../../../src/domain/world.ts";
import { findPath } from "../../../src/domain/pathfinding.ts";
import type { AgentPosition, ConversationMessage, SoulProfile, WorldConfig } from "../../../src/domain/types.ts";
import {
  createConversation,
  ensureAgentPosition,
  ensureAvatar,
  ensureNpcPopulation,
  ensureUser,
  getAgentPosition,
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
  broadcastToChannel,
  insertBaMessage,
  getAvatarsByUserIds,
  updateHeartbeat,
  transitionStalePresence,
  incrementOfflineConvo,
  getUserPresence,
  upsertPushToken,
  getDeviceTokensForUsers,
  updateLastNotificationAt,
  updateUserDisplayName,
  upsertImpressionMemory
} from "./db.ts";
import type { Json } from "./db.ts";
import {
  BUBBLE_READING_WORDS_PER_SECOND,
  CAMERA_VISIBLE_COLUMNS,
  CAMERA_VISIBLE_ROWS,
  CONVERSATION_SPEAKING_WORDS_PER_SECOND,
  CONVERSATION_TURN_GAP_MS,
  IMPRESSION_EVALUATION_INTERVAL,
  getMessagesForEncounter,
  MIN_BUBBLE_DISPLAY_MS,
  MIN_REPLY_DELAY_MS,
  MOVE_ANIMATION_MS,
  WORLD_TICK_INTERVAL_MS,
  WORLD_GRID_COLUMNS,
  WORLD_GRID_ROWS,
  AGENT_MOVE_SPEED,
  USER_MOVE_SPEED,
  getPairCooldownHours,
  getEffectiveMessageLimit,
  getConversationPhase,
  OFFLINE_MAX_CONVERSATIONS_PER_DAY,
  MAX_PUSH_NOTIFICATIONS_PER_DAY
} from "../../../src/domain/constants.ts";
import { OBSTACLE_CELLS } from "../../../src/domain/obstacle_map.ts";
import type { AvatarConfig } from "../../../src/domain/avatar.ts";
import { avatarForSeed, defaultAvatarConfig } from "../../../src/domain/avatar.ts";
import { fetchInterestNews } from "./xai.ts";
import { sendConversationSummaryNotification } from "./apns.ts";
import { worldBroadcastPayloadSchema } from "./contracts.ts";

export interface WorldAgentSnapshot extends AgentPosition {
  display_name: string;
  avatar: AvatarConfig;
  is_self: boolean;
}

type WorldBroadcastPayload = z.infer<typeof worldBroadcastPayloadSchema>;

type AppUser = Awaited<ReturnType<typeof ensureUser>>;

// NPC population managed by scripts/nuke_and_populate.ts
const JOB_LEASE_MS = 20_000;
const WORLD_RUNNER_WINDOW_MS = 55_000;

function buildWorldConfig(): WorldConfig {
  return {
    gridColumns: WORLD_GRID_COLUMNS,
    gridRows: WORLD_GRID_ROWS,
    worldTickMs: WORLD_TICK_INTERVAL_MS,
    moveAnimationMs: MOVE_ANIMATION_MS,
    bubbleReadingWordsPerSecond: BUBBLE_READING_WORDS_PER_SECOND,
    conversationSpeakingWordsPerSecond: CONVERSATION_SPEAKING_WORDS_PER_SECOND,
    conversationTurnGapMs: CONVERSATION_TURN_GAP_MS,
    minBubbleDisplayMs: MIN_BUBBLE_DISPLAY_MS,
    minReplyDelayMs: MIN_REPLY_DELAY_MS,
    cameraVisibleColumns: CAMERA_VISIBLE_COLUMNS,
    cameraVisibleRows: CAMERA_VISIBLE_ROWS,
    agentMoveSpeed: AGENT_MOVE_SPEED
  };
}

function serializeWorldConfig() {
  const config = buildWorldConfig();
  return {
    grid_columns: config.gridColumns,
    grid_rows: config.gridRows,
    world_tick_ms: config.worldTickMs,
    move_animation_ms: config.moveAnimationMs,
    bubble_reading_wps: config.bubbleReadingWordsPerSecond,
    conversation_speaking_wps: config.conversationSpeakingWordsPerSecond,
    conversation_turn_gap_ms: config.conversationTurnGapMs,
    min_bubble_display_ms: config.minBubbleDisplayMs,
    min_reply_delay_ms: config.minReplyDelayMs,
    camera_visible_columns: config.cameraVisibleColumns,
    camera_visible_rows: config.cameraVisibleRows,
    agent_move_speed: config.agentMoveSpeed
  };
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function bubbleDisplayDurationMs(text: string) {
  const words = Math.max(1, wordCount(text));
  return Math.max(
    MIN_BUBBLE_DISPLAY_MS,
    Math.round((words / BUBBLE_READING_WORDS_PER_SECOND) * 1000)
  );
}

function conversationReplyDelayMs(text: string) {
  const words = Math.max(1, wordCount(text));
  return Math.max(
    MIN_REPLY_DELAY_MS,
    Math.round((words / CONVERSATION_SPEAKING_WORDS_PER_SECOND) * 1000 + CONVERSATION_TURN_GAP_MS)
  );
}

function logWorldTickSummary(input: {
  instanceId: string;
  step: number;
  movementEvents: Array<{
    user_id: string;
    from_cell_x: number;
    from_cell_y: number;
    to_cell_x: number;
    to_cell_y: number;
  }>;
  startedConversations: Array<{
    agentA: string;
    agentB: string;
  }>;
}) {
  const movementSample = input.movementEvents.slice(0, 8).map((event) => ({
    user_id: event.user_id,
    from: [event.from_cell_x, event.from_cell_y],
    to: [event.to_cell_x, event.to_cell_y]
  }));
  const conversationSample = input.startedConversations.slice(0, 4).map((entry) => ({
    agent_a: entry.agentA,
    agent_b: entry.agentB
  }));

  console.log(JSON.stringify({
    event: "world_tick",
    instance_id: input.instanceId,
    step: input.step,
    moved_count: input.movementEvents.length,
    started_conversation_count: input.startedConversations.length,
    movement_sample: movementSample,
    conversation_sample: conversationSample
  }));
}

function scheduleActiveMessageClear(instanceId: string, conversationId: string, userId: string, content: string) {
  const bubbleLifetimeMs = bubbleDisplayDurationMs(content);
  void (async () => {
    await new Promise((resolve) => setTimeout(resolve, bubbleLifetimeMs));
    const refreshed = await getAgentPositions(instanceId);
    await upsertAgentPositions(
      refreshed.map((row) =>
        row.conversation_id === conversationId && row.user_id === userId && row.active_message === content
          ? { ...row, active_message: null }
          : row
      )
    );
  })();
}

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
    path: row.path ?? [],
    move_speed: row.move_speed ?? AGENT_MOVE_SPEED,
    state: row.state,
    active_message: row.active_message,
    conversation_id: row.conversation_id,
    cooldown_until: row.cooldown_until,
    behavior: row.behavior,
    behavior_ticks_remaining: row.behavior_ticks_remaining,
    heading: row.heading,
    user_target_cell_x: row.user_target_cell_x,
    user_target_cell_y: row.user_target_cell_y,
    user_directed: row.user_directed
  };
}

function buildBroadcastAgent(row: Awaited<ReturnType<typeof getAgentPositions>>[number]) {
  return {
    user_id: row.user_id,
    x: row.x,
    y: row.y,
    target_x: row.target_x,
    target_y: row.target_y,
    cell_x: row.cell_x,
    cell_y: row.cell_y,
    path: row.path ?? [],
    move_speed: row.move_speed ?? AGENT_MOVE_SPEED,
    state: row.state,
    behavior: row.behavior ?? null,
    heading: row.heading ?? null,
    active_message: row.active_message,
    conversation_id: row.conversation_id
  };
}

function broadcastTickCounter() {
  return Math.floor(Date.now() / WORLD_TICK_INTERVAL_MS);
}

async function broadcastWorldState(
  instanceId: string,
  positions: Awaited<ReturnType<typeof getAgentPositions>>,
  tick: number
) {
  const payload: WorldBroadcastPayload = {
    tick,
    ts: Date.now(),
    agents: positions.map(buildBroadcastAgent)
  };
  worldBroadcastPayloadSchema.parse(payload);
  await broadcastToChannel(`world:${instanceId}`, "tick", payload as Json);
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
      if (key === exclude || OBSTACLE_CELLS.has(key)) {
        continue;
      }
      cells.push({ x: cellX, y: cellY });
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
      const key = `${nextX}:${nextY}`;
      if (!OBSTACLE_CELLS.has(key) && !cells.some((cell) => cell.x === nextX && cell.y === nextY)) {
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

function edgeFactors(edge: Awaited<ReturnType<typeof getImpressionEdge>>) {
  if (!edge) {
    return undefined;
  }
  return {
    responsiveness: Math.round(edge.responsiveness ?? 0),
    values_alignment: Math.round(edge.values_alignment ?? 0),
    conversation_quality: Math.round(edge.conversation_quality ?? 0),
    interest_overlap: Math.round(edge.interest_overlap ?? 0),
    novelty: Math.round(edge.novelty ?? 0)
  };
}

function relationshipPhase(
  yourEdge: Awaited<ReturnType<typeof getImpressionEdge>>,
  theirEdge: Awaited<ReturnType<typeof getImpressionEdge>>
) {
  const encounterCount = Math.max(yourEdge?.encounter_count ?? 0, theirEdge?.encounter_count ?? 0);
  return {
    encounterCount,
    phase: getConversationPhase(Math.max(encounterCount, 1))
  };
}

export async function bootstrapUser(deviceId: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const user = await ensureUser(deviceId);
      const instanceId = user.instance_id ?? (await getDefaultInstanceId());
      await pruneDemoWorld(instanceId, user.id);
      await ensureNpcPopulation(instanceId);
      await ensureSoulProfileForUser(user);
      await ensureAgentPosition(user);
      const soulProfile = await getSoulProfile(user.id);
      const avatar = (await getAvatar(user.id)) ?? defaultAvatarConfig;
      await advanceDueConversationsForUser(user.id);
      const world = await buildWorldSnapshot(instanceId, user.id);
      const conversations = await listConversationSummaries(deviceId);

      return {
        user_id: user.id,
        device_id: user.device_id,
        display_name: user.display_name,
        instance_id: instanceId,
        soul_profile: soulProfile,
        avatar,
        conversations,
        world
      };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  throw lastError;
}

export async function saveSoulProfile(deviceId: string, profile: SoulProfile, displayName?: string) {
  const user = await ensureUser(deviceId);
  const trimmedDisplayName = displayName?.trim();
  const finalUser = trimmedDisplayName && trimmedDisplayName !== user.display_name
    ? await updateUserDisplayName(user.id, trimmedDisplayName)
    : user;
  const saved = await upsertSoulProfile(user.id, profile);
  await ensureAvatar(user.id);
  return { user_id: user.id, display_name: finalUser.display_name, soul_profile: saved };
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

async function pruneDemoWorld(_instanceId: string, _viewerUserId: string) {
  // No-op: NPC population is managed by scripts/nuke_and_populate.ts
}

async function hasRecentConversation(
  userA: string,
  userB: string,
  encounterCount: number = 0,
  baUnlocked: boolean = false
) {
  const cooldownHours = getPairCooldownHours(encounterCount, baUnlocked);
  const since = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
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
    state: "wandering" | "idle" | "approaching" | "chatting" | "cooldown" | "user_moving";
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
    state: "wandering" | "idle" | "approaching" | "chatting" | "cooldown" | "user_moving";
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
    state: "wandering" | "idle" | "approaching" | "chatting" | "cooldown" | "user_moving";
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
  const userIds = fresh.map((row) => row.user_id);
  const [users, avatarMap] = await Promise.all([
    listUsersByIds(userIds),
    getAvatarsByUserIds(userIds)
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));

  const agents: WorldAgentSnapshot[] = fresh.map((row) => {
    const pos = toAgentPosition(row);
    return {
      ...pos,
      active_message: pos.active_message,
      display_name: userById.get(row.user_id)?.display_name ?? "Unknown Soul",
      avatar: avatarMap.get(row.user_id) ?? avatarForSeed(userById.get(row.user_id)?.device_id ?? row.user_id),
      is_self: row.user_id === viewerUserId
    };
  })
    .sort((a, b) => {
      if (a.is_self !== b.is_self) {
        return a.is_self ? -1 : 1;
      }
      return a.display_name.localeCompare(b.display_name);
    });

  return {
    count: agents.length,
    config: serializeWorldConfig(),
    movement_events: movementEvents,
    agents
  };
}

function nextConversationTurnAt(delayMs = MIN_REPLY_DELAY_MS) {
  return new Date(Date.now() + delayMs).toISOString();
}

function isDue(isoTimestamp?: string | null) {
  return Boolean(isoTimestamp && new Date(isoTimestamp).getTime() <= Date.now());
}

async function markConversationTurn(
  conversationId: string,
  turnCount: number,
  delayMs = MIN_REPLY_DELAY_MS
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
  // Look up encounter counts for this pair
  const reciprocalA = await getImpressionEdge(conversation.user_a_id, conversation.user_b_id);
  const reciprocalB = await getImpressionEdge(conversation.user_b_id, conversation.user_a_id);
  const encounterCountA = (reciprocalA?.encounter_count ?? 0) + 1;
  const encounterCountB = (reciprocalB?.encounter_count ?? 0) + 1;
  const encounterCount = Math.min(encounterCountA, encounterCountB);

  // Evaluate impressions at interval
  const shouldEvaluate = messages.length > 0 && messages.length % IMPRESSION_EVALUATION_INTERVAL === 0;
  if (shouldEvaluate) {
    const evaluationA = await evaluateImpression(soulA, soulB, transcript, {
      selfName: userA.display_name,
      otherName: userB.display_name
    });
    const evaluationB = await evaluateImpression(soulB, soulA, transcript, {
      selfName: userB.display_name,
      otherName: userA.display_name
    });
    const scoreA = accumulateImpression(reciprocalA?.score ?? 0, evaluationA.score, encounterCountA);
    const scoreB = accumulateImpression(reciprocalB?.score ?? 0, evaluationB.score, encounterCountB);
    const baUnlockedForA = isBaAvailableToViewer(scoreB);
    const baUnlockedForB = isBaAvailableToViewer(scoreA);

    await updateConversation(conversationId, {
      impression_score: scoreA,
      impression_summary: evaluationA.summary,
      processing_owner: null,
      processing_expires_at: null
    });
    await upsertImpressionEdge(
      conversation.user_a_id, conversation.user_b_id,
      { ...evaluationA, score: scoreA }, baUnlockedForA, encounterCountA,
      {
        responsiveness: evaluationA.responsiveness,
        valuesAlignment: evaluationA.values_alignment,
        conversationQuality: evaluationA.conversation_quality,
        interestOverlap: evaluationA.interest_overlap,
        novelty: evaluationA.novelty
      }
    );
    await upsertImpressionEdge(
      conversation.user_b_id, conversation.user_a_id,
      { ...evaluationB, score: scoreB }, baUnlockedForB, encounterCountB,
      {
        responsiveness: evaluationB.responsiveness,
        valuesAlignment: evaluationB.values_alignment,
        conversationQuality: evaluationB.conversation_quality,
        interestOverlap: evaluationB.interest_overlap,
        novelty: evaluationB.novelty
      }
    );
  }

  // Phase-aware conversation end check with momentum extension
  const baseLimit = getMessagesForEncounter(encounterCount);
  const edgeA = await getImpressionEdge(conversation.user_a_id, conversation.user_b_id);
  const edgeB = await getImpressionEdge(conversation.user_b_id, conversation.user_a_id);
  const bestResponsiveness = Math.max(edgeA?.responsiveness ?? 0, edgeB?.responsiveness ?? 0);
  const bestQuality = Math.max(edgeA?.conversation_quality ?? 0, edgeB?.conversation_quality ?? 0);
  const messageLimit = getEffectiveMessageLimit(baseLimit, bestResponsiveness, bestQuality);
  if (messages.length >= messageLimit) {
    let summary = "";
    try {
      summary = await generateConversationSummary(transcript);
      await insertConversationSummary(conversationId, conversation.user_a_id, conversation.user_b_id, summary);
    } catch (error) {
      console.error("Failed to store conversation summary:", error);
    }

    try {
      const [memoryA, memoryB] = await Promise.all([
        generateRelationshipMemory(userA.display_name, userB.display_name, transcript),
        generateRelationshipMemory(userB.display_name, userA.display_name, transcript)
      ]);
      await Promise.all([
        upsertImpressionMemory(conversation.user_a_id, conversation.user_b_id, memoryA || summary),
        upsertImpressionMemory(conversation.user_b_id, conversation.user_a_id, memoryB || summary)
      ]);
    } catch (error) {
      console.error("Failed to store relationship memory:", error);
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

    // Notify offline participants about the conversation
    for (const participant of [userA, userB]) {
      if (participant.is_npc) continue;
      try {
        const presence = await getUserPresence(participant.id);
        if (!presence || presence.presence === "online") continue;
        // Max 1 notification per day
        if (presence.last_notification_at) {
          const lastNotif = new Date(presence.last_notification_at).getTime();
          if (Date.now() - lastNotif < 24 * 60 * 60 * 1000) continue;
        }
        const tokens = await getDeviceTokensForUsers([participant.id]);
        if (tokens.length === 0) continue;
        const otherUser = participant.id === userA.id ? userB : userA;
        await sendConversationSummaryNotification(
          tokens.map((t) => t.device_token),
          otherUser.display_name
        );
        await updateLastNotificationAt(participant.id);
      } catch (error) {
        console.error("Failed to send conversation notification:", error);
      }
    }

    return;
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
  const otherUserId = nextSpeaker.user.id === userA.id ? userB.id : userA.id;
  let previousConversationSummary: string | undefined;
  try {
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
    previousConversationSummary,
    encounterCount
  });

  await insertMessage(conversationId, nextSpeaker.user.id, "ka_generated", reply.content);
  await markConversationTurn(conversationId, messages.length + 1, conversationReplyDelayMs(reply.content));
  const instanceId2 = userA.instance_id ?? await getDefaultInstanceId();
  const positions = await getAgentPositions(instanceId2);
  const updated = positions.map((row) =>
    row.conversation_id === conversationId
      ? { ...row, active_message: row.user_id === nextSpeaker.user.id ? reply.content : null }
      : row
  );
  await upsertAgentPositions(updated);
  scheduleActiveMessageClear(
    instanceId2,
    conversationId,
    nextSpeaker.user.id,
    reply.content
  );
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
    state: "wandering" | "idle" | "approaching" | "chatting" | "cooldown" | "user_moving";
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
    const edge = await getImpressionEdge(userId, position.user_id);
    const theirEdge = await getImpressionEdge(position.user_id, userId);
    const encounterCount = edge?.encounter_count ?? 0;
    const baUnlocked = theirEdge?.ba_unlocked ?? false;
    if (!(await hasRecentConversation(userId, position.user_id, encounterCount, baUnlocked))) {
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
  await markConversationTurn(conversation.id, 1, conversationReplyDelayMs(firstLine));
  scheduleActiveMessageClear(instanceId, conversation.id, candidate.user_id, firstLine);
  userPosition.state = "chatting";
  userPosition.conversation_id = conversation.id;
  userPosition.active_message = null;
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
  await ensureNpcPopulation(instanceId);
  await ensureSoulProfileForUser(user);
  await ensureAvatarForUser(user);
  await ensureAgentPosition(user);
  await advanceDueConversationsForUser(user.id);
  const world = await buildWorldSnapshot(instanceId, user.id);
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
    logWorldTickSummary({
      instanceId,
      step: step + 1,
      movementEvents: result.movementEvents,
      startedConversations: result.startedConversations
    });

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
      path: position.path,
      move_speed: position.move_speed,
      state: position.state,
      active_message: position.active_message,
      conversation_id: position.conversation_id,
      cooldown_until: position.cooldown_until,
      behavior: position.behavior,
      behavior_ticks_remaining: position.behavior_ticks_remaining,
      heading: position.heading,
      user_target_cell_x: position.user_target_cell_x,
      user_target_cell_y: position.user_target_cell_y,
      user_directed: position.user_directed
    }));

    for (const started of result.startedConversations) {
      const edgeAB = await getImpressionEdge(started.agentA, started.agentB);
      const edgeBA = await getImpressionEdge(started.agentB, started.agentA);
      const encounterCount = Math.max(edgeAB?.encounter_count ?? 0, edgeBA?.encounter_count ?? 0);
      const baUnlocked = (edgeAB?.ba_unlocked ?? false) || (edgeBA?.ba_unlocked ?? false);
      if (await hasRecentConversation(started.agentA, started.agentB, encounterCount, baUnlocked)) {
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

      // Offline limit gate: skip conversation if any non-NPC user is offline and over daily limit
      let offlineLimitHit = false;
      for (const participant of [userA, userB]) {
        if (participant.is_npc) continue;
        try {
          const presence = await getUserPresence(participant.id);
          if (presence && presence.presence === "offline" && presence.daily_offline_convos >= OFFLINE_MAX_CONVERSATIONS_PER_DAY) {
            offlineLimitHit = true;
            break;
          }
        } catch {
          // Presence check failure should not block conversations
        }
      }
      if (offlineLimitHit) {
        dispersePairAfterRejectedConversation(persisted, [started.agentA, started.agentB]);
        continue;
      }
      // Increment offline convo counter for offline non-NPC participants
      for (const participant of [userA, userB]) {
        if (participant.is_npc) continue;
        try {
          const presence = await getUserPresence(participant.id);
          if (presence && presence.presence === "offline") {
            await incrementOfflineConvo(participant.id);
          }
        } catch {
          // Counter increment failure should not block conversations
        }
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
      await markConversationTurn(conversation.id, 1, conversationReplyDelayMs(firstLine));
      scheduleActiveMessageClear(instanceId, conversation.id, started.agentA, firstLine);
      for (const row of persisted) {
        if (row.user_id === started.agentA) {
          row.conversation_id = conversation.id;
          row.active_message = firstLine;
          row.cooldown_until = null;
        } else if (row.user_id === started.agentB) {
          row.conversation_id = conversation.id;
          row.active_message = null;
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
    void broadcastWorldState(instanceId, persisted, broadcastTickCounter()).catch((error) => {
      console.error(JSON.stringify({
        event: "world_broadcast_failed",
        instance_id: instanceId,
        error: error instanceof Error ? error.message : String(error)
      }));
    });
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
    const relationship = relationshipPhase(yourEdge, theirEdge);
    const baMessageCount = baConvo ? await countBaMessages(baConvo.id) : 0;
    return {
      id: conversation.id,
      title: other?.display_name ?? "Unknown Soul",
      impression_score: yourEdge?.score ?? conversation.impression_score,
      impression_summary: yourEdge?.summary ?? conversation.impression_summary ?? "Your Ka is still forming an impression.",
      impression_factors: edgeFactors(yourEdge),
      memory_summary: yourEdge?.memory_summary ?? undefined,
      status: conversation.status,
      ba_unlocked: theirEdge?.ba_unlocked ?? false,
      their_impression_score: theirEdge?.score ?? 0,
      their_impression_summary: theirEdge?.summary ?? "They have not opened their Ba to you yet.",
      their_impression_factors: edgeFactors(theirEdge),
      their_memory_summary: theirEdge?.memory_summary ?? undefined,
      encounter_count: relationship.encounterCount,
      phase: relationship.phase,
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
  const relationship = relationshipPhase(yourEdge, theirEdge);

  return {
    id: conversation.id,
    title: otherUser?.display_name ?? "Unknown Soul",
    impression_score: yourEdge?.score ?? conversation.impression_score,
    impression_summary: yourEdge?.summary ?? conversation.impression_summary ?? "",
    impression_factors: edgeFactors(yourEdge),
    memory_summary: yourEdge?.memory_summary ?? undefined,
    their_impression_score: theirEdge?.score ?? 0,
    their_impression_summary: theirEdge?.summary ?? "They have not formed a strong enough impression yet.",
    their_impression_factors: edgeFactors(theirEdge),
    their_memory_summary: theirEdge?.memory_summary ?? undefined,
    encounter_count: relationship.encounterCount,
    phase: relationship.phase,
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
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  await insertMessage(conversationId, user.id, "human_typed", content);
  const instanceId = user.instance_id ?? (await getDefaultInstanceId());
  const positions = await getAgentPositions(instanceId);
  await upsertAgentPositions(
    positions.map((row) =>
      row.conversation_id === conversationId && row.user_id === user.id
        ? { ...row, active_message: content }
        : row
    )
  );
  await updateConversation(conversationId, {
    turn_count: (conversation.turn_count ?? 0) + 1,
    last_turn_at: new Date().toISOString(),
    next_turn_at: nextConversationTurnAt(conversationReplyDelayMs(content)),
    processing_owner: null,
    processing_expires_at: null
  });
  scheduleActiveMessageClear(instanceId, conversationId, user.id, content);
  return getConversationDetail(deviceId, conversationId);
}

// ── Presence handlers ──────────────────────────────────────────

// ── Tap Control ──────────────────────────────────────────────

export async function handleTapCell(
  deviceId: string,
  targetCellX: number,
  targetCellY: number
) {
  const user = await ensureUser(deviceId);
  const position = await getAgentPosition(user.id);
  if (!position) {
    throw new Error("Agent position not found");
  }

  if (position.state === "chatting" || position.state === "cooldown") {
    return { error: "Agent is busy", status: 409 };
  }

  if (targetCellX < 0 || targetCellX >= WORLD_GRID_COLUMNS ||
      targetCellY < 0 || targetCellY >= WORLD_GRID_ROWS) {
    return { error: "Target cell out of bounds", status: 422 };
  }

  const currentCellX = position.cell_x;
  const currentCellY = position.cell_y;

  // Only terrain obstacles block tap-to-cell (not other agents)
  const blocked = new Set(OBSTACLE_CELLS);

  const path = findPath(
    { x: currentCellX, y: currentCellY },
    { x: targetCellX, y: targetCellY },
    blocked
  );

  if (path.length === 0) {
    return { error: "Unreachable destination", status: 422 };
  }

  // Estimate duration: path.length cells at USER_MOVE_SPEED cells/sec * tick interval
  const estimatedDurationMs = Math.round(path.length / USER_MOVE_SPEED * WORLD_TICK_INTERVAL_MS);

  // Update agent position
  await upsertAgentPositions([{
    ...position,
    path,
    state: "user_moving",
    user_directed: true,
    user_target_cell_x: targetCellX,
    user_target_cell_y: targetCellY,
    move_speed: USER_MOVE_SPEED,
    behavior: "wander",
    behavior_ticks_remaining: 0
  }]);

  return {
    path,
    estimated_duration_ms: estimatedDurationMs
  };
}

export async function handleTapCharacter(
  deviceId: string,
  targetUserId: string
) {
  const user = await ensureUser(deviceId);
  if (user.id === targetUserId) {
    return { error: "Cannot approach self", status: 422 };
  }

  const position = await getAgentPosition(user.id);
  if (!position) {
    throw new Error("Agent position not found");
  }

  if (position.state === "chatting" || position.state === "cooldown") {
    return { error: "Agent is busy", status: 409 };
  }

  const targetPosition = await getAgentPosition(targetUserId);
  if (!targetPosition) {
    return { error: "Target agent not found", status: 422 };
  }

  const currentCellX = position.cell_x;
  const currentCellY = position.cell_y;
  const targetCellX = targetPosition.cell_x;
  const targetCellY = targetPosition.cell_y;

  // Find an adjacent cell to the target that is walkable
  const blocked = new Set(OBSTACLE_CELLS);
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

  let bestAdjacentCell: { x: number; y: number } | null = null;
  let bestDist = Infinity;

  for (let d = 0; d < 8; d++) {
    const ax = targetCellX + dx[d];
    const ay = targetCellY + dy[d];
    if (ax < 0 || ax >= WORLD_GRID_COLUMNS || ay < 0 || ay >= WORLD_GRID_ROWS) continue;
    if (blocked.has(`${ax}:${ay}`)) continue;
    // Prefer the adjacent cell closest to the user
    const dist = Math.max(Math.abs(ax - currentCellX), Math.abs(ay - currentCellY));
    if (dist < bestDist) {
      bestDist = dist;
      bestAdjacentCell = { x: ax, y: ay };
    }
  }

  if (!bestAdjacentCell) {
    return { error: "No walkable cell adjacent to target", status: 422 };
  }

  // If already adjacent, no need to pathfind
  if (bestAdjacentCell.x === currentCellX && bestAdjacentCell.y === currentCellY) {
    return { path: [], estimated_duration_ms: 0 };
  }

  const path = findPath(
    { x: currentCellX, y: currentCellY },
    bestAdjacentCell,
    blocked
  );

  if (path.length === 0) {
    return { error: "Cannot reach target", status: 422 };
  }

  const estimatedDurationMs = Math.round(path.length / USER_MOVE_SPEED * WORLD_TICK_INTERVAL_MS);

  await upsertAgentPositions([{
    ...position,
    path,
    state: "user_moving",
    user_directed: true,
    user_target_cell_x: bestAdjacentCell.x,
    user_target_cell_y: bestAdjacentCell.y,
    move_speed: USER_MOVE_SPEED,
    behavior: "wander",
    behavior_ticks_remaining: 0
  }]);

  return {
    path,
    estimated_duration_ms: estimatedDurationMs
  };
}

export async function handleHeartbeat(deviceId: string) {
  const user = await ensureUser(deviceId);
  await updateHeartbeat(user.id);
  return { ok: true };
}

export async function handleRegisterPushToken(deviceId: string, deviceToken: string, platform: string) {
  const user = await ensureUser(deviceId);
  await upsertPushToken(user.id, deviceToken, platform);
  return { ok: true };
}

export async function advanceOnlineWorlds() {
  const deadline = Date.now() + WORLD_RUNNER_WINDOW_MS;
  const results = new Map<string, { instance_id: string; ticks: number; count: number }>();
  console.log(JSON.stringify({
    event: "advance_worlds_start",
    deadline_ms: WORLD_RUNNER_WINDOW_MS,
    tick_interval_ms: WORLD_TICK_INTERVAL_MS
  }));

  while (Date.now() < deadline) {
    // Transition stale presence: online→background→offline
    try {
      const transitioned = await transitionStalePresence();
      if (transitioned > 0) {
        console.log(JSON.stringify({ event: "presence_transitions", count: transitioned }));
      }
    } catch (error) {
      console.error("Failed to transition stale presence:", error);
    }

    const owner = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const leaseExpiresAt = new Date(Date.now() + JOB_LEASE_MS).toISOString();
    const instances = await claimDueWorldInstances(owner, leaseExpiresAt, nowIso, 10);
    console.log(JSON.stringify({
      event: "advance_worlds_claim",
      owner,
      claimed_count: instances.length,
      due_before: nowIso
    }));

    for (const instance of instances) {
      const users = await listUsersInInstance(instance.id);
      const viewer = users.find((user) => !user.is_npc);
      if (viewer) {
        await pruneDemoWorld(instance.id, viewer.id);
        await ensureSoulProfileForUser(viewer);
        await ensureAvatarForUser(viewer);
      }
      await ensureNpcPopulation(instance.id);
      const lastTick = instance.last_tick_at ? new Date(instance.last_tick_at).getTime() : 0;
      const elapsedMs = Math.max(WORLD_TICK_INTERVAL_MS, Date.now() - lastTick);
      const stepCount = 1;
      console.log(JSON.stringify({
        event: "advance_world_instance",
        instance_id: instance.id,
        prior_last_tick_at: instance.last_tick_at,
        elapsed_ms: elapsedMs,
        step_count: stepCount,
        user_count: users.length
      }));
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
  console.log(JSON.stringify({
    event: "advance_conversations_claim",
    owner,
    claimed_count: conversations.length,
    due_before: nowIso
  }));

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
