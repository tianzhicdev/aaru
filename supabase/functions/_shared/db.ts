import type { AvatarConfig } from "../../../src/domain/avatar.ts";
import { avatarForSeed, defaultAvatarConfig } from "../../../src/domain/avatar.ts";
import type { ConversationMessage, ImpressionEvaluation, SoulProfile } from "../../../src/domain/types.ts";
import { WORLD_GRID_COLUMNS, WORLD_GRID_ROWS } from "../../../src/domain/constants.ts";
import { supabaseServiceRoleKey, supabaseUrl } from "./env.ts";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

interface UserRow {
  id: string;
  device_id: string;
  display_name: string;
  instance_id: string | null;
  is_npc: boolean;
}

interface AgentPositionRow {
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
  path?: Array<{ x: number; y: number }>;
  move_speed?: number;
  state: "wandering" | "approaching" | "chatting" | "cooldown";
  active_message: string | null;
  conversation_id: string | null;
  cooldown_until: string | null;
}

interface ConversationRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  impression_score: number;
  impression_summary: string | null;
  status: string;
  started_at: string;
  ended_at?: string | null;
  topic_seed?: string[];
  turn_count?: number;
  last_turn_at?: string | null;
  next_turn_at?: string | null;
  processing_owner?: string | null;
  processing_expires_at?: string | null;
}

interface ImpressionEdgeRow {
  score: number;
  summary: string | null;
  ba_unlocked: boolean;
  encounter_count: number;
}

interface NewsItemRow {
  topic: string;
  headline: string;
  summary: string;
  fetched_at: string;
}

interface ConversationSummaryRow {
  id: string;
  conversation_id: string;
  user_a_id: string;
  user_b_id: string;
  summary: string;
  created_at: string;
}

interface DeviceTokenRow {
  user_id: string;
  device_token: string;
  platform: string;
  is_active: boolean;
  updated_at: string;
}

interface WorldInstanceRow {
  id: string;
  slug: string;
  is_online: boolean;
  last_tick_at: string | null;
  next_tick_at?: string | null;
  processing_owner?: string | null;
  processing_expires_at?: string | null;
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseServiceRoleKey(),
      Authorization: `Bearer ${supabaseServiceRoleKey()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase REST error ${response.status}: ${await response.text()}`);
  }

  if (response.status === 204) {
    return [] as T;
  }

  const text = await response.text();
  if (text.trim().length === 0) {
    return [] as T;
  }

  return JSON.parse(text) as T;
}

async function rpc<T>(name: string, body: Record<string, Json>): Promise<T> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey(),
      Authorization: `Bearer ${supabaseServiceRoleKey()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Supabase RPC error ${response.status}: ${await response.text()}`);
  }

  if (response.status === 204) {
    return [] as T;
  }

  const text = await response.text();
  if (text.trim().length === 0) {
    return [] as T;
  }

  return JSON.parse(text) as T;
}

function cellCenter(cellX: number, cellY: number) {
  return {
    x: (cellX + 0.5) / WORLD_GRID_COLUMNS,
    y: (cellY + 0.5) / WORLD_GRID_ROWS
  };
}

function randomOpenCell(occupied: Set<string>, avoid?: string) {
  const options = [];
  for (let cellY = 0; cellY < WORLD_GRID_ROWS; cellY += 1) {
    for (let cellX = 0; cellX < WORLD_GRID_COLUMNS; cellX += 1) {
      const key = `${cellX}:${cellY}`;
      if (key === avoid) {
        continue;
      }
      if (!occupied.has(key)) {
        options.push({ x: cellX, y: cellY });
      }
    }
  }
  return options[Math.floor(Math.random() * options.length)] ?? { x: 0, y: 0 };
}

export async function getDefaultInstanceId(): Promise<string> {
  const rows = await rest<Array<{ id: string }>>("world_instances?slug=eq.sunset-beach&select=id");
  if (rows[0]?.id) {
    return rows[0].id;
  }
  const created = await rest<Array<{ id: string }>>("world_instances", {
    method: "POST",
    body: JSON.stringify({
      name: "Sunset Beach",
      slug: "sunset-beach",
      capacity: 100,
      min_population: 30
    })
  });
  return created[0].id;
}

export async function listOnlineWorldInstances(): Promise<WorldInstanceRow[]> {
  return rest<WorldInstanceRow[]>(
    "world_instances?is_online=eq.true&select=id,slug,is_online,last_tick_at,next_tick_at,processing_owner,processing_expires_at"
  );
}

export async function touchWorldInstance(instanceId: string, tickedAt: string, nextTickAt: string): Promise<void> {
  await rest<Json>(`world_instances?id=eq.${instanceId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      last_tick_at: tickedAt,
      next_tick_at: nextTickAt,
      processing_owner: null,
      processing_expires_at: null
    })
  });
}

export async function claimWorldInstance(
  instanceId: string,
  owner: string,
  leaseExpiresAt: string
): Promise<boolean> {
  return rpc<boolean>("claim_world_instance", {
    p_instance_id: instanceId,
    p_owner: owner,
    p_lease_until: leaseExpiresAt
  });
}

export async function claimDueWorldInstances(
  owner: string,
  leaseExpiresAt: string,
  dueBefore: string,
  limit = 5
): Promise<WorldInstanceRow[]> {
  return rpc<WorldInstanceRow[]>("claim_due_world_instances", {
    p_owner: owner,
    p_lease_until: leaseExpiresAt,
    p_due_before: dueBefore,
    p_limit: limit
  });
}

export async function getUserByDeviceId(deviceId: string): Promise<UserRow | null> {
  const rows = await rest<UserRow[]>(
    `users?device_id=eq.${encodeURIComponent(deviceId)}&select=id,device_id,display_name,instance_id,is_npc`
  );
  return rows[0] ?? null;
}

export async function getUserById(userId: string): Promise<UserRow | null> {
  const rows = await rest<UserRow[]>(
    `users?id=eq.${userId}&select=id,device_id,display_name,instance_id,is_npc`
  );
  return rows[0] ?? null;
}

export async function listUsersInInstance(instanceId: string): Promise<UserRow[]> {
  return rest<UserRow[]>(
    `users?instance_id=eq.${instanceId}&select=id,device_id,display_name,instance_id,is_npc`
  );
}

export async function createUser(deviceId: string): Promise<UserRow> {
  const instanceId = await getDefaultInstanceId();
  const created = await rest<UserRow[]>("users?on_conflict=device_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      device_id: deviceId,
      display_name: `Soul ${deviceId.slice(-4)}`,
      instance_id: instanceId,
      is_npc: false
    })
  });
  return created[0];
}

export async function ensureUser(deviceId: string): Promise<UserRow> {
  return createUser(deviceId);
}

export async function getSoulProfile(userId: string): Promise<SoulProfile | null> {
  const rows = await rest<SoulProfile[]>(`soul_profiles?user_id=eq.${userId}&select=*`);
  return rows[0] ?? null;
}

export async function upsertSoulProfile(userId: string, profile: SoulProfile): Promise<SoulProfile> {
  const rows = await rest<SoulProfile[]>("soul_profiles?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{ user_id: userId, ...profile }])
  });
  return rows[0];
}

export async function getAvatar(userId: string): Promise<AvatarConfig | null> {
  const rows = await rest<AvatarConfig[]>(`avatars?user_id=eq.${userId}&select=body_shape,skin_tone,hair_style,hair_color,eyes,outfit_top,outfit_bottom,accessory,aura_color`);
  return rows[0] ?? null;
}

export async function upsertAvatar(userId: string, avatar: AvatarConfig): Promise<AvatarConfig> {
  const rows = await rest<AvatarConfig[]>("avatars?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{ user_id: userId, ...avatar }])
  });
  return rows[0];
}

export async function ensureAvatar(userId: string): Promise<AvatarConfig> {
  return (await getAvatar(userId)) ?? upsertAvatar(userId, defaultAvatarConfig);
}

export async function getAgentPositions(instanceId: string): Promise<AgentPositionRow[]> {
  return rest<AgentPositionRow[]>(
    `agent_positions?instance_id=eq.${instanceId}&select=user_id,instance_id,x,y,target_x,target_y,cell_x,cell_y,target_cell_x,target_cell_y,path,move_speed,state,active_message,conversation_id,cooldown_until`
  );
}

export async function getAgentPosition(userId: string): Promise<AgentPositionRow | null> {
  const rows = await rest<AgentPositionRow[]>(
    `agent_positions?user_id=eq.${userId}&select=user_id,instance_id,x,y,target_x,target_y,cell_x,cell_y,target_cell_x,target_cell_y,path,move_speed,state,active_message,conversation_id,cooldown_until`
  );
  return rows[0] ?? null;
}

export async function upsertAgentPositions(positions: AgentPositionRow[]): Promise<void> {
  await rest<Json>("agent_positions?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(positions)
  });
}

export async function ensureAgentPosition(user: UserRow): Promise<AgentPositionRow> {
  const existing = await getAgentPosition(user.id);
  if (existing) {
    return existing;
  }

  const instanceId = user.instance_id ?? (await getDefaultInstanceId());
  const occupied = new Set(
    (await getAgentPositions(instanceId)).map((row) => `${row.cell_x}:${row.cell_y}`)
  );
  const currentCell = randomOpenCell(occupied);
  occupied.add(`${currentCell.x}:${currentCell.y}`);
  const targetCell = randomOpenCell(occupied, `${currentCell.x}:${currentCell.y}`);
  const currentCenter = cellCenter(currentCell.x, currentCell.y);
  const targetCenter = cellCenter(targetCell.x, targetCell.y);
  const created: AgentPositionRow = {
    user_id: user.id,
    instance_id: instanceId,
    x: currentCenter.x,
    y: currentCenter.y,
    target_x: targetCenter.x,
    target_y: targetCenter.y,
    cell_x: currentCell.x,
    cell_y: currentCell.y,
    target_cell_x: targetCell.x,
    target_cell_y: targetCell.y,
    state: "wandering",
    active_message: null,
    conversation_id: null,
    cooldown_until: null
  };
  await upsertAgentPositions([created]);
  return created;
}

export async function createConversation(instanceId: string, userA: string, userB: string): Promise<ConversationRow> {
  const rows = await rest<ConversationRow[]>("conversations", {
    method: "POST",
    body: JSON.stringify([{
      instance_id: instanceId,
      user_a_id: userA,
      user_b_id: userB,
      status: "active",
      impression_score: 0,
      impression_summary: null,
      topic_seed: [],
      turn_count: 0,
      next_turn_at: new Date().toISOString()
    }])
  });
  return rows[0];
}

export async function listRecentConversationsBetweenUsers(
  userA: string,
  userB: string,
  sinceIso: string
): Promise<ConversationRow[]> {
  return rest<ConversationRow[]>(
    `conversations?or=(and(user_a_id.eq.${userA},user_b_id.eq.${userB}),and(user_a_id.eq.${userB},user_b_id.eq.${userA}))&started_at=gte.${encodeURIComponent(sinceIso)}&select=id,user_a_id,user_b_id,impression_score,impression_summary,status,started_at,topic_seed`
  );
}

export async function updateConversation(
  conversationId: string,
  patch: Record<string, Json>
): Promise<void> {
  await rest<Json>(`conversations?id=eq.${conversationId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch)
  });
}

export async function getConversationsForUser(userId: string): Promise<ConversationRow[]> {
  return rest<ConversationRow[]>(
    `conversations?or=(user_a_id.eq.${userId},user_b_id.eq.${userId})&order=started_at.desc&select=id,user_a_id,user_b_id,impression_score,impression_summary,status,started_at,ended_at,topic_seed,turn_count,last_turn_at,next_turn_at,processing_owner,processing_expires_at`
  );
}

export async function getConversation(conversationId: string): Promise<ConversationRow | null> {
  const rows = await rest<ConversationRow[]>(
    `conversations?id=eq.${conversationId}&select=id,user_a_id,user_b_id,impression_score,impression_summary,status,started_at,ended_at,topic_seed,turn_count,last_turn_at,next_turn_at,processing_owner,processing_expires_at`
  );
  return rows[0] ?? null;
}

export async function claimConversation(
  conversationId: string,
  owner: string,
  leaseExpiresAt: string,
  _dueBefore: string
): Promise<boolean> {
  return rpc<boolean>("claim_conversation", {
    p_conversation_id: conversationId,
    p_owner: owner,
    p_lease_until: leaseExpiresAt,
    p_due_before: _dueBefore
  });
}

export async function claimDueConversations(
  owner: string,
  leaseExpiresAt: string,
  dueBefore: string,
  limit = 20
): Promise<ConversationRow[]> {
  return rpc<ConversationRow[]>("claim_due_conversations", {
    p_owner: owner,
    p_lease_until: leaseExpiresAt,
    p_due_before: dueBefore,
    p_limit: limit
  });
}

export async function listMessages(conversationId: string): Promise<Array<ConversationMessage & { id: string }>> {
  return rest<Array<ConversationMessage & { id: string }>>(
    `messages?conversation_id=eq.${conversationId}&order=created_at.asc&select=id,user_id,type,content,created_at`
  );
}

export async function insertMessage(
  conversationId: string,
  userId: string,
  type: "ka_generated" | "human_typed",
  content: string
): Promise<void> {
  await rest<Json>("messages", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{ conversation_id: conversationId, user_id: userId, type, content }])
  });
}

export async function upsertImpressionEdge(
  userId: string,
  targetUserId: string,
  evaluation: ImpressionEvaluation,
  baUnlocked: boolean,
  encounterCount: number
): Promise<void> {
  await rest<Json>("impression_edges?on_conflict=user_id,target_user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      user_id: userId,
      target_user_id: targetUserId,
      score: evaluation.score,
      summary: evaluation.summary,
      ba_unlocked: baUnlocked,
      encounter_count: encounterCount
    }])
  });
}

export async function getImpressionEdge(userId: string, targetUserId: string): Promise<ImpressionEdgeRow | null> {
  const rows = await rest<ImpressionEdgeRow[]>(
    `impression_edges?user_id=eq.${userId}&target_user_id=eq.${targetUserId}&select=score,summary,ba_unlocked,encounter_count`
  );
  return rows[0] ?? null;
}

export async function listFreshNewsItems(topics: string[], sinceIso: string): Promise<NewsItemRow[]> {
  if (topics.length === 0) {
    return [];
  }
  const encodedTopics = topics.map((topic) => `"${topic}"`).join(",");
  return rest<NewsItemRow[]>(
    `news_items?topic=in.(${encodedTopics})&fetched_at=gte.${encodeURIComponent(sinceIso)}&order=fetched_at.desc&select=topic,headline,summary,fetched_at`
  );
}

export async function insertNewsItems(items: Array<{ topic: string; headline: string; summary: string }>): Promise<void> {
  if (items.length === 0) {
    return;
  }
  await rest<Json>("news_items", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(items)
  });
}

export async function listUsersByIds(userIds: string[]): Promise<UserRow[]> {
  if (userIds.length === 0) {
    return [];
  }
  return rest<UserRow[]>(
    `users?id=in.(${userIds.join(",")})&select=id,device_id,display_name,instance_id,is_npc`
  );
}

export async function deleteUsersByIds(userIds: string[]): Promise<void> {
  if (userIds.length === 0) {
    return;
  }

  await rest<Json>(`users?id=in.(${userIds.join(",")})`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
}

export async function listRecentConversationSummaries(
  userIdA: string,
  userIdB: string,
  limit: number
): Promise<ConversationSummaryRow[]> {
  return rest<ConversationSummaryRow[]>(
    `conversation_summaries?or=(and(user_a_id.eq.${userIdA},user_b_id.eq.${userIdB}),and(user_a_id.eq.${userIdB},user_b_id.eq.${userIdA}))&order=created_at.desc&limit=${limit}&select=id,conversation_id,user_a_id,user_b_id,summary,created_at`
  );
}

export async function insertConversationSummary(
  conversationId: string,
  userAId: string,
  userBId: string,
  summary: string
): Promise<void> {
  await rest<Json>("conversation_summaries", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      conversation_id: conversationId,
      user_a_id: userAId,
      user_b_id: userBId,
      summary
    }])
  });
}

export async function countUserConversationsToday(userId: string): Promise<number> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayIso = startOfToday.toISOString();

  const rows = await rest<Array<{ count: number }>>(
    `conversations?or=(user_a_id.eq.${userId},user_b_id.eq.${userId})&started_at=gte.${encodeURIComponent(todayIso)}&select=count`
  );

  return rows.length;
}

export async function ensureNpcPopulation(): Promise<void> {
  const instanceId = await getDefaultInstanceId();
  const npcSeeds = [
    {
      name: "Nahla",
      personality: "Nahla is quietly playful, observant, and drawn to emotional subtext.",
      interests: ["film photography", "indie cinema", "night walks"],
      values: {
        self_transcendence: 0.8,
        self_enhancement: 0.3,
        openness_to_change: 0.9,
        conservation: 0.2,
        expressed: ["honesty", "patience", "warmth", "creative integrity"]
      },
      narrative: {
        formative_stories: [
          "When I was twelve, I found my mother's old film camera in a closet. I spent that whole summer photographing the neighborhood cats. Most of the photos came out blurry, but one — a tabby sleeping in a sunbeam — made my mother cry. I didn't understand why until much later.",
          "There was a week in college when I watched the same Koreeda film every night. I kept noticing things — the way he held on faces a beat too long, the silence between words. That week changed how I listen to people."
        ],
        self_defining_memories: [
          "Walking home alone after a late movie screening, feeling like the city was showing me something private"
        ],
        narrative_themes: ["communion", "observation", "quiet beauty"]
      }
    },
    {
      name: "Iset",
      personality: "Iset is steady, thoughtful, and likes asking the second question instead of the first.",
      interests: ["architecture", "coffee culture", "urban design"],
      values: {
        self_transcendence: 0.6,
        self_enhancement: 0.5,
        openness_to_change: 0.6,
        conservation: 0.7,
        expressed: ["clarity", "growth", "care", "craftsmanship"]
      },
      narrative: {
        formative_stories: [
          "My father built furniture. Not for money — he was an accountant. But every weekend he'd be in the garage with wood and hand tools. I asked him once why he didn't use power tools. He said the slow way teaches you what the wood wants to become. I think about that constantly.",
          "I moved to a new city knowing nobody. For three months my only real conversations were with the barista at this tiny place that roasted their own beans. She taught me that small talk can be an art form if you actually pay attention."
        ],
        self_defining_memories: [
          "Standing in front of Tadao Ando's Church of the Light, feeling architecture could be a form of prayer"
        ],
        narrative_themes: ["agency", "craftsmanship", "quiet dedication"]
      }
    },
    {
      name: "Khepri",
      personality: "Khepri is enthusiastic, reflective, and energized by ambitious ideas.",
      interests: ["startups", "science books", "documentaries"],
      values: {
        self_transcendence: 0.5,
        self_enhancement: 0.8,
        openness_to_change: 0.9,
        conservation: 0.3,
        expressed: ["curiosity", "courage", "humor", "ambition"]
      },
      narrative: {
        formative_stories: [
          "I built my first thing at fourteen — a terrible weather app that crashed every time it rained. But seeing something I made actually run on a phone, even badly, rewired my brain. I realized you could just... make things exist.",
          "My grandfather was a civil engineer in Cairo. He took me to see bridges he'd designed and would explain how they distributed weight. He said the best structures are the ones that look effortless but carry everything. That's stuck with me for every project since."
        ],
        self_defining_memories: [
          "The night my first real project got its hundredth user — sitting alone in my apartment, refreshing the dashboard, feeling like the world had slightly changed shape"
        ],
        narrative_themes: ["agency", "building", "optimistic ambition"]
      }
    },
    {
      name: "Setka",
      personality: "Setka is gentle, literary, and notices how people choose words.",
      interests: ["poetry", "translation", "museum exhibits"],
      values: {
        self_transcendence: 0.9,
        self_enhancement: 0.2,
        openness_to_change: 0.7,
        conservation: 0.5,
        expressed: ["depth", "kindness", "attention", "nuance"]
      },
      narrative: {
        formative_stories: [
          "I spent a year translating a short story collection from Arabic to English. One phrase took me three weeks — it described the feeling of hearing your grandmother's voice in a crowded market. There's no English word for it. I ended up writing a footnote that was longer than the story itself.",
          "When I was small, my aunt would read to me in two languages, switching mid-sentence. I think that's why I notice the gaps between what people say and what they mean — I grew up living in those gaps."
        ],
        self_defining_memories: [
          "Sitting in a museum alone with a Rothko painting, feeling understood by a rectangle of color"
        ],
        narrative_themes: ["communion", "translation", "finding words for wordless things"]
      }
    },
    {
      name: "Meri",
      personality: "Meri is bright, restless, and likes conversations that move between craft and feeling.",
      interests: ["fashion history", "music scenes", "travel"],
      values: {
        self_transcendence: 0.6,
        self_enhancement: 0.7,
        openness_to_change: 0.9,
        conservation: 0.2,
        expressed: ["taste", "freedom", "sincerity", "style"]
      },
      narrative: {
        formative_stories: [
          "I went to a punk show at sixteen in a basement that smelled like wet concrete. The music was objectively terrible. But everyone there had made something — their clothes, their zines, the flyers on the walls. That night I realized taste isn't about quality, it's about caring enough to have an opinion.",
          "I traveled alone through Southeast Asia for two months with one backpack. Somewhere in Vietnam I stopped trying to find the 'authentic' experience and just started talking to people at bus stops. The best conversations of my life happened waiting for buses."
        ],
        self_defining_memories: [
          "Trying on my grandmother's vintage Chanel jacket and feeling her whole era click into focus"
        ],
        narrative_themes: ["agency", "restless seeking", "style as identity"]
      }
    }
  ];
  const npcNames = npcSeeds.map((seed) => seed.name);
  const allowedDeviceIds = new Set(npcNames.map((name) => `npc-${name.toLowerCase()}`));
  const existingNpcUsers = await rest<UserRow[]>(
    "users?is_npc=eq.true&select=id,device_id,display_name,instance_id,is_npc"
  );
  const staleNpcIds = existingNpcUsers
    .filter((user) => !allowedDeviceIds.has(user.device_id))
    .map((user) => user.id);
  await deleteUsersByIds(staleNpcIds);

  for (const seed of npcSeeds) {
    const name = seed.name;
    const deviceId = `npc-${name.toLowerCase()}`;
    const created = await rest<UserRow[]>("users?on_conflict=device_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([{
        device_id: deviceId,
        display_name: name,
        instance_id: instanceId,
        is_npc: true
      }])
    });
    const user = created[0];

    await upsertSoulProfile(user.id, {
      personality: seed.personality,
      interests: seed.interests,
      values: seed.values,
      narrative: seed.narrative,
      avoid_topics: ["cruelty"],
      raw_input: `${name} likes good stories and patient conversations.`,
      guessed_fields: []
    });
    await upsertAvatar(user.id, avatarForSeed(deviceId));
    await ensureAgentPosition(user);
  }
}

// ── Ba Conversations ──────────────────────────────────────────────

interface BaConversationRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  source_conversation_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface BaMessageRow {
  id: string;
  ba_conversation_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

function normalizePair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

export async function getBaConversationForPair(userA: string, userB: string): Promise<BaConversationRow | null> {
  const [a, b] = normalizePair(userA, userB);
  const rows = await rest<BaConversationRow[]>(
    `ba_conversations?user_a_id=eq.${a}&user_b_id=eq.${b}&select=id,user_a_id,user_b_id,source_conversation_id,status,created_at,updated_at`
  );
  return rows[0] ?? null;
}

export async function ensureBaConversation(userA: string, userB: string, sourceConversationId: string): Promise<BaConversationRow> {
  const [a, b] = normalizePair(userA, userB);
  const rows = await rest<BaConversationRow[]>("ba_conversations?on_conflict=user_a_id,user_b_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      user_a_id: a,
      user_b_id: b,
      source_conversation_id: sourceConversationId,
      status: "active"
    }])
  });
  return rows[0];
}

export async function listBaConversationsForUser(userId: string): Promise<BaConversationRow[]> {
  return rest<BaConversationRow[]>(
    `ba_conversations?or=(user_a_id.eq.${userId},user_b_id.eq.${userId})&select=id,user_a_id,user_b_id,source_conversation_id,status,created_at,updated_at`
  );
}

export async function listBaMessages(baConversationId: string): Promise<BaMessageRow[]> {
  return rest<BaMessageRow[]>(
    `ba_messages?ba_conversation_id=eq.${baConversationId}&order=created_at.asc&select=id,ba_conversation_id,user_id,content,created_at`
  );
}

export async function countBaMessages(baConversationId: string): Promise<number> {
  const rows = await rest<BaMessageRow[]>(
    `ba_messages?ba_conversation_id=eq.${baConversationId}&select=id`
  );
  return rows.length;
}

export async function insertBaMessage(baConversationId: string, userId: string, content: string): Promise<void> {
  await rest<Json>("ba_messages", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{ ba_conversation_id: baConversationId, user_id: userId, content }])
  });
}

export async function getDeviceTokensForUsers(userIds: string[]): Promise<DeviceTokenRow[]> {
  if (userIds.length === 0) {
    return [];
  }
  return rest<DeviceTokenRow[]>(
    `device_tokens?user_id=in.(${userIds.join(",")})&is_active=eq.true&select=user_id,device_token,platform,is_active,updated_at`
  );
}
