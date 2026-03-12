import type { AvatarConfig } from "../../../src/domain/avatar.ts";
import { avatarForSeed, defaultAvatarConfig } from "../../../src/domain/avatar.ts";
import type { ConversationMessage, ImpressionEvaluation, SoulProfile } from "../../../src/domain/types.ts";
import { WORLD_GRID_COLUMNS, WORLD_GRID_ROWS } from "../../../src/domain/constants.ts";
import { OBSTACLE_CELLS } from "../../../src/domain/obstacle_map.ts";
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
  state: "wandering" | "idle" | "approaching" | "chatting" | "cooldown";
  active_message: string | null;
  conversation_id: string | null;
  cooldown_until: string | null;
  behavior?: "wander" | "idle" | "drift_social" | "drift_poi" | "retreat";
  behavior_ticks_remaining?: number;
  heading?: number;
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
      if (key === avoid || occupied.has(key) || OBSTACLE_CELLS.has(key)) {
        continue;
      }
      options.push({ x: cellX, y: cellY });
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
      capacity: 50,
      min_population: 15
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
  const rows = await rest<Partial<AvatarConfig>[]>(`avatars?user_id=eq.${userId}&select=sprite_id,body_shape,skin_tone,hair_style,hair_color,eyes,outfit_top,outfit_bottom,accessory,aura_color`);
  if (!rows[0]) {
    return null;
  }
  return {
    ...defaultAvatarConfig,
    ...rows[0]
  };
}

export async function getAvatarsByUserIds(userIds: string[]): Promise<Map<string, AvatarConfig>> {
  if (userIds.length === 0) return new Map();
  const rows = await rest<Array<Partial<AvatarConfig> & { user_id: string }>>(
    `avatars?user_id=in.(${userIds.join(",")})&select=user_id,sprite_id,body_shape,skin_tone,hair_style,hair_color,eyes,outfit_top,outfit_bottom,accessory,aura_color`
  );
  const map = new Map<string, AvatarConfig>();
  for (const row of rows) {
    const { user_id, ...rest } = row;
    map.set(user_id, { ...defaultAvatarConfig, ...rest });
  }
  return map;
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
    `agent_positions?instance_id=eq.${instanceId}&select=user_id,instance_id,x,y,target_x,target_y,cell_x,cell_y,target_cell_x,target_cell_y,path,move_speed,state,active_message,conversation_id,cooldown_until,behavior,behavior_ticks_remaining,heading`
  );
}

export async function getAgentPosition(userId: string): Promise<AgentPositionRow | null> {
  const rows = await rest<AgentPositionRow[]>(
    `agent_positions?user_id=eq.${userId}&select=user_id,instance_id,x,y,target_x,target_y,cell_x,cell_y,target_cell_x,target_cell_y,path,move_speed,state,active_message,conversation_id,cooldown_until,behavior,behavior_ticks_remaining,heading`
  );
  return rows[0] ?? null;
}

export async function upsertAgentPositions(positions: AgentPositionRow[]): Promise<void> {
  // Normalize all rows to have identical keys (PostgREST PGRST102 requires this)
  const normalized = positions.map((p) => ({
    user_id: p.user_id,
    instance_id: p.instance_id,
    x: p.x,
    y: p.y,
    target_x: p.target_x,
    target_y: p.target_y,
    cell_x: p.cell_x,
    cell_y: p.cell_y,
    target_cell_x: p.target_cell_x,
    target_cell_y: p.target_cell_y,
    path: p.path ?? [],
    move_speed: p.move_speed ?? 1.8,
    state: p.state,
    active_message: p.active_message,
    conversation_id: p.conversation_id,
    cooldown_until: p.cooldown_until,
    behavior: p.behavior ?? "wander",
    behavior_ticks_remaining: p.behavior_ticks_remaining ?? 0,
    heading: p.heading ?? 0
  }));
  await rest<Json>("agent_positions?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(normalized)
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
    cooldown_until: null,
    behavior: "wander",
    behavior_ticks_remaining: 5 + Math.floor(Math.random() * 6),
    heading: Math.floor(Math.random() * 8)
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
  baUnlocked: boolean
): Promise<void> {
  await rest<Json>("impression_edges?on_conflict=user_id,target_user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      user_id: userId,
      target_user_id: targetUserId,
      score: evaluation.score,
      summary: evaluation.summary,
      ba_unlocked: baUnlocked
    }])
  });
}

export async function getImpressionEdge(userId: string, targetUserId: string): Promise<ImpressionEdgeRow | null> {
  const rows = await rest<ImpressionEdgeRow[]>(
    `impression_edges?user_id=eq.${userId}&target_user_id=eq.${targetUserId}&select=score,summary,ba_unlocked`
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

const NPC_SEEDS: Array<{
  name: string;
  personality: string;
  interests: string[];
  values: string[];
}> = [
  { name: "Nahla", personality: "Nahla is quietly playful, observant, and drawn to emotional subtext.", interests: ["film photography", "indie cinema", "night walks"], values: ["honesty", "patience", "warmth"] },
  { name: "Iset", personality: "Iset is steady, thoughtful, and likes asking the second question instead of the first.", interests: ["architecture", "coffee culture", "urban design"], values: ["clarity", "growth", "care"] },
  { name: "Khepri", personality: "Khepri is enthusiastic, reflective, and energized by ambitious ideas.", interests: ["startups", "science books", "documentaries"], values: ["curiosity", "courage", "humor"] },
  { name: "Setka", personality: "Setka is gentle, literary, and notices how people choose words.", interests: ["poetry", "translation", "museum exhibits"], values: ["depth", "kindness", "attention"] },
  { name: "Meri", personality: "Meri is bright, restless, and likes conversations that move between craft and feeling.", interests: ["fashion history", "music scenes", "travel"], values: ["taste", "freedom", "sincerity"] },
  { name: "Amunet", personality: "Amunet is warm, nurturing, and fascinated by growth and change.", interests: ["cooking", "gardening", "meditation"], values: ["resilience", "empathy", "balance"] },
  { name: "Bastet", personality: "Bastet is bold, direct, and appreciates honesty over politeness.", interests: ["rock climbing", "stand-up comedy", "cycling"], values: ["courage", "integrity", "freedom"] },
  { name: "Djedi", personality: "Djedi is dreamy, imaginative, and finds meaning in small details.", interests: ["watercolor painting", "mythology", "astronomy"], values: ["wonder", "patience", "depth"] },
  { name: "Eshe", personality: "Eshe is analytical, curious, and connects disparate ideas easily.", interests: ["robotics", "philosophy", "podcasts"], values: ["curiosity", "clarity", "growth"] },
  { name: "Femi", personality: "Femi is calm, grounded, and provides stability in conversation.", interests: ["jazz", "ceramics", "hiking"], values: ["kindness", "balance", "warmth"] },
  { name: "Gaspar", personality: "Gaspar is witty, quick, and uses humor to build connection.", interests: ["board games", "electronic music", "street art"], values: ["humor", "sincerity", "taste"] },
  { name: "Heka", personality: "Heka is philosophical, deep, and drawn to existential questions.", interests: ["vintage books", "calligraphy", "marine biology"], values: ["depth", "wonder", "integrity"] },
  { name: "Ineni", personality: "Ineni is energetic, spontaneous, and loves trying new things.", interests: ["surfing", "travel", "cooking"], values: ["freedom", "courage", "humor"] },
  { name: "Jabari", personality: "Jabari is empathetic, intuitive, and reads between the lines.", interests: ["creative writing", "theater", "yoga"], values: ["empathy", "attention", "care"] },
  { name: "Kamilah", personality: "Kamilah is creative, unconventional, and challenges assumptions.", interests: ["street art", "fashion history", "indie cinema"], values: ["taste", "curiosity", "resilience"] },
  { name: "Lotfi", personality: "Lotfi is patient, wise, and values silence as much as words.", interests: ["meditation", "calligraphy", "astronomy"], values: ["patience", "balance", "depth"] },
  { name: "Menat", personality: "Menat is passionate, expressive, and wears her heart on her sleeve.", interests: ["theater", "music scenes", "poetry"], values: ["sincerity", "warmth", "courage"] },
  { name: "Neferu", personality: "Neferu is methodical, precise, and finds beauty in structure.", interests: ["architecture", "robotics", "urban design"], values: ["clarity", "integrity", "attention"] },
  { name: "Osei", personality: "Osei is adventurous, fearless, and always seeking the next horizon.", interests: ["rock climbing", "surfing", "travel"], values: ["courage", "freedom", "growth"] },
  { name: "Ptah", personality: "Ptah is contemplative, serene, and drawn to nature and stillness.", interests: ["gardening", "hiking", "marine biology"], values: ["balance", "wonder", "patience"] },
  { name: "Qadesh", personality: "Qadesh is sharp-tongued, loyal, and fiercely protective of those she loves.", interests: ["documentaries", "podcasts", "philosophy"], values: ["honesty", "resilience", "empathy"] },
  { name: "Rensi", personality: "Rensi is easygoing, generous, and lights up any gathering.", interests: ["cooking", "jazz", "board games"], values: ["warmth", "humor", "kindness"] },
  { name: "Safiya", personality: "Safiya is precise, elegant, and quietly competitive.", interests: ["calligraphy", "cycling", "fashion history"], values: ["attention", "taste", "integrity"] },
  { name: "Tau", personality: "Tau is restless, curious, and can't resist pulling threads.", interests: ["science books", "startups", "electronic music"], values: ["curiosity", "growth", "courage"] },
  { name: "Usir", personality: "Usir is stoic, reliable, and speaks only when it matters.", interests: ["vintage books", "hiking", "mythology"], values: ["integrity", "patience", "depth"] },
  { name: "Vashti", personality: "Vashti is magnetic, unpredictable, and drawn to contrast.", interests: ["indie cinema", "street art", "night walks"], values: ["freedom", "sincerity", "wonder"] },
  { name: "Wadjet", personality: "Wadjet is observant, strategic, and always three steps ahead.", interests: ["board games", "urban design", "documentaries"], values: ["clarity", "courage", "attention"] },
  { name: "Xenon", personality: "Xenon is quirky, inventive, and delighted by odd connections.", interests: ["robotics", "stand-up comedy", "mythology"], values: ["humor", "curiosity", "wonder"] },
  { name: "Yara", personality: "Yara is tender, poetic, and carries a quiet intensity.", interests: ["poetry", "watercolor painting", "night walks"], values: ["depth", "empathy", "warmth"] },
  { name: "Zuberi", personality: "Zuberi is grounded, principled, and speaks from experience.", interests: ["gardening", "ceramics", "philosophy"], values: ["honesty", "resilience", "balance"] },
  { name: "Amara", personality: "Amara is sparkling, curious, and finds wonder in everyday moments.", interests: ["film photography", "coffee culture", "yoga"], values: ["wonder", "care", "growth"] },
  { name: "Bennu", personality: "Bennu is intense, devoted, and transformed by every deep conversation.", interests: ["theater", "creative writing", "meditation"], values: ["sincerity", "depth", "courage"] },
  { name: "Chione", personality: "Chione is cool, graceful, and reveals warmth slowly.", interests: ["astronomy", "jazz", "translation"], values: ["patience", "taste", "kindness"] },
  { name: "Darius", personality: "Darius is charismatic, ambitious, and energized by bold plans.", interests: ["startups", "cycling", "travel"], values: ["courage", "growth", "freedom"] },
  { name: "Edjo", personality: "Edjo is fierce, loyal, and protects what matters with quiet resolve.", interests: ["rock climbing", "marine biology", "podcasts"], values: ["integrity", "resilience", "honesty"] },
  { name: "Farouk", personality: "Farouk is gentle, humorous, and puts people at ease instantly.", interests: ["cooking", "stand-up comedy", "hiking"], values: ["humor", "warmth", "care"] },
  { name: "Geb", personality: "Geb is earthy, patient, and deeply connected to place.", interests: ["gardening", "ceramics", "architecture"], values: ["balance", "attention", "patience"] },
  { name: "Hathor", personality: "Hathor is joyful, sensual, and celebrates beauty in all forms.", interests: ["music scenes", "watercolor painting", "fashion history"], values: ["taste", "warmth", "wonder"] },
  { name: "Imhotep", personality: "Imhotep is brilliant, methodical, and builds things that last.", interests: ["robotics", "science books", "urban design"], values: ["clarity", "integrity", "curiosity"] },
  { name: "Jendayi", personality: "Jendayi is grateful, reflective, and treasures meaningful connection.", interests: ["yoga", "poetry", "film photography"], values: ["empathy", "sincerity", "kindness"] },
  { name: "Kemet", personality: "Kemet is ancient-souled, perceptive, and drawn to cycles and patterns.", interests: ["mythology", "astronomy", "vintage books"], values: ["depth", "wonder", "patience"] },
  { name: "Lapis", personality: "Lapis is vivid, expressive, and communicates through color and metaphor.", interests: ["watercolor painting", "street art", "indie cinema"], values: ["taste", "freedom", "curiosity"] },
  { name: "Masika", personality: "Masika is spontaneous, warm, and turns strangers into friends.", interests: ["travel", "cooking", "board games"], values: ["warmth", "humor", "care"] },
  { name: "Nebtu", personality: "Nebtu is nurturing, wise, and draws out the best in others.", interests: ["gardening", "meditation", "creative writing"], values: ["kindness", "growth", "empathy"] },
  { name: "Onuris", personality: "Onuris is driven, competitive, and thrives under pressure.", interests: ["cycling", "rock climbing", "electronic music"], values: ["courage", "resilience", "freedom"] },
  { name: "Pakhet", personality: "Pakhet is fierce, independent, and speaks uncomfortable truths.", interests: ["philosophy", "documentaries", "surfing"], values: ["honesty", "integrity", "courage"] },
  { name: "Quasar", personality: "Quasar is luminous, expansive, and thinks at cosmic scale.", interests: ["astronomy", "science books", "podcasts"], values: ["wonder", "curiosity", "growth"] },
  { name: "Rashida", personality: "Rashida is graceful, discerning, and knows exactly what she wants.", interests: ["fashion history", "calligraphy", "jazz"], values: ["taste", "clarity", "attention"] },
  { name: "Sahu", personality: "Sahu is contemplative, spiritual, and seeks meaning beyond the visible.", interests: ["mythology", "meditation", "marine biology"], values: ["depth", "balance", "wonder"] },
  { name: "Tiye", personality: "Tiye is regal, decisive, and leads with quiet authority.", interests: ["architecture", "theater", "translation"], values: ["integrity", "clarity", "resilience"] }
];

export const NPC_DEVICE_IDS = new Set(NPC_SEEDS.map((s) => `npc-${s.name.toLowerCase()}`));

export async function ensureNpcPopulation(): Promise<void> {
  // NPC population is managed by scripts/nuke_and_populate.ts
  // This is a no-op to avoid slowing down world ticks.
  // The NPC_SEEDS data above is kept for pruneDemoWorld's NPC_DEVICE_IDS whitelist.
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
