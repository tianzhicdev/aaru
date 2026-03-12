/**
 * Nuke all world data and repopulate with N users (default 50).
 * Usage: node --experimental-strip-types scripts/nuke_and_populate.ts [count]
 *
 * Uses psql for reliable writes via Supabase pooler.
 * Requires: SUPABASE_PROJECT_ID and SUPABASE_PW in .env
 */
import "dotenv/config";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { avatarForSeed } from "../src/domain/avatar.ts";
import {
  WORLD_GRID_COLUMNS,
  WORLD_GRID_ROWS
} from "../src/domain/constants.ts";

const POPULATION = parseInt(process.argv[2] || "50", 10);
const PROJECT_ID = process.env.SUPABASE_PROJECT_ID!;
const PW = process.env.SUPABASE_PW!;
// Session-mode pooler (port 5432) — maintains a single backend connection per psql session
const CONN = `postgresql://postgres.${PROJECT_ID}:${PW}@aws-0-us-west-2.pooler.supabase.com:5432/postgres`;

function psqlFile(sqlContent: string): string {
  const tmpFile = `/tmp/aaru_populate_${Date.now()}.sql`;
  writeFileSync(tmpFile, sqlContent);
  try {
    return execSync(`psql "${CONN}" -f "${tmpFile}"`, {
      encoding: "utf-8",
      timeout: 120000
    }).trim();
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

// ── Names and personalities ──
const NAMES = [
  "Nahla", "Iset", "Khepri", "Setka", "Meri",
  "Amunet", "Bastet", "Djedi", "Eshe", "Femi",
  "Gaspar", "Heka", "Ineni", "Jabari", "Kamilah",
  "Lotfi", "Menat", "Neferu", "Osei", "Ptah",
  "Qadesh", "Rensi", "Safiya", "Tau", "Usir",
  "Vashti", "Wadjet", "Xenon", "Yara", "Zuberi",
  "Amara", "Bennu", "Chione", "Darius", "Edjo",
  "Farouk", "Geb", "Hathor", "Imhotep", "Jendayi",
  "Kemet", "Lapis", "Masika", "Nebtu", "Onuris",
  "Pakhet", "Quasar", "Rashida", "Sahu", "Tiye"
];

const PERSONALITIES = [
  "quietly playful, observant, drawn to emotional subtext",
  "steady, thoughtful, likes asking follow-up questions",
  "enthusiastic, reflective, energized by ambitious ideas",
  "gentle, literary, notices how people choose words",
  "bright, restless, moves between craft and feeling",
  "warm, nurturing, fascinated by growth and change",
  "bold, direct, appreciates honesty over politeness",
  "dreamy, imaginative, finds meaning in small details",
  "analytical, curious, connects disparate ideas easily",
  "calm, grounded, provides stability in conversation",
  "witty, quick, uses humor to build connection",
  "philosophical, deep, drawn to existential questions",
  "energetic, spontaneous, loves trying new things",
  "empathetic, intuitive, reads between the lines",
  "creative, unconventional, challenges assumptions",
  "patient, wise, values silence as much as words",
  "passionate, expressive, wears heart on sleeve",
  "methodical, precise, finds beauty in structure",
  "adventurous, fearless, always seeking the next horizon",
  "contemplative, serene, drawn to nature and stillness"
];

const INTERESTS_POOL = [
  "film photography", "indie cinema", "night walks", "architecture",
  "coffee culture", "urban design", "startups", "science books",
  "documentaries", "poetry", "translation", "museum exhibits",
  "fashion history", "music scenes", "travel", "cooking",
  "astronomy", "street art", "vintage books", "meditation",
  "surfing", "board games", "podcasts", "ceramics",
  "electronic music", "hiking", "philosophy", "marine biology",
  "calligraphy", "jazz", "gardening", "mythology",
  "stand-up comedy", "robotics", "watercolor painting", "yoga",
  "rock climbing", "creative writing", "theater", "cycling"
];

const VALUES_POOL = [
  "honesty", "patience", "warmth", "clarity", "growth",
  "care", "curiosity", "courage", "humor", "depth",
  "kindness", "attention", "taste", "freedom", "sincerity",
  "resilience", "empathy", "integrity", "wonder", "balance"
];

function pickN<T>(arr: T[], n: number, seed: number): T[] {
  const shuffled = [...arr];
  let s = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = s % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

function esc(s: string): string {
  return s.replace(/'/g, "''");
}

function pgArray(arr: string[]): string {
  return `ARRAY[${arr.map(s => `'${esc(s)}'`).join(",")}]::text[]`;
}

function pgJsonb(obj: unknown): string {
  return `'${esc(JSON.stringify(obj))}'::jsonb`;
}

function main() {
  // First, get the instance ID (need it for insert SQL)
  // Use a temp query to get it
  const instResult = psqlFile(`
    SELECT id FROM world_instances WHERE slug = 'sunset-beach' LIMIT 1;
  `);
  // Parse the instance ID from psql output
  const instMatch = instResult.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
  const instanceId = instMatch ? instMatch[1] : null;

  if (!instanceId) {
    console.error("No world instance found. Create one first.");
    process.exit(1);
  }
  console.log(`Instance: ${instanceId}`);

  // Build data
  const centerX = Math.floor(WORLD_GRID_COLUMNS / 2);
  const centerY = Math.floor(WORLD_GRID_ROWS / 2);
  const spawnRadius = 10;
  const occupied = new Set<string>();

  console.log(`Building ${POPULATION} users...`);

  const userRows: string[] = [];
  const soulRows: string[] = [];
  const avatarRows: string[] = [];
  const posRows: string[] = [];

  for (let i = 0; i < POPULATION; i++) {
    const uid = randomUUID();
    const name = NAMES[i % NAMES.length];
    const deviceId = `npc-${name.toLowerCase()}`;
    const personality = PERSONALITIES[i % PERSONALITIES.length];
    const interests = pickN(INTERESTS_POOL, 3, i * 7);
    const expressedValues = pickN(VALUES_POOL, 3, i * 13);
    // Generate semi-random Schwartz dimension values (seeded)
    const s1 = ((i * 1103515245 + 12345) >>> 0) / 0xFFFFFFFF;
    const s2 = ((i * 1103515245 * 2 + 12345) >>> 0) / 0xFFFFFFFF;
    const s3 = ((i * 1103515245 * 3 + 12345) >>> 0) / 0xFFFFFFFF;
    const s4 = ((i * 1103515245 * 4 + 12345) >>> 0) / 0xFFFFFFFF;
    const soulValues = {
      self_transcendence: Math.round(s1 * 10) / 10,
      self_enhancement: Math.round(s2 * 10) / 10,
      openness_to_change: Math.round(s3 * 10) / 10,
      conservation: Math.round(s4 * 10) / 10,
      expressed: expressedValues
    };
    const narrative = {
      formative_stories: [],
      self_defining_memories: [],
      narrative_themes: []
    };

    let cx: number, cy: number;
    let attempts = 0;
    do {
      cx = centerX + Math.floor(Math.random() * spawnRadius * 2) - spawnRadius;
      cy = centerY + Math.floor(Math.random() * spawnRadius * 2) - spawnRadius;
      cx = Math.max(0, Math.min(WORLD_GRID_COLUMNS - 1, cx));
      cy = Math.max(0, Math.min(WORLD_GRID_ROWS - 1, cy));
      attempts++;
    } while (occupied.has(`${cx}:${cy}`) && attempts < 200);
    occupied.add(`${cx}:${cy}`);

    const posX = (cx + 0.5) / WORLD_GRID_COLUMNS;
    const posY = (cy + 0.5) / WORLD_GRID_ROWS;
    const heading = Math.floor(Math.random() * 8);
    const behaviorTicks = 5 + Math.floor(Math.random() * 6);

    const avatar = avatarForSeed(deviceId);

    userRows.push(`('${uid}', '${esc(deviceId)}', '${esc(name)}', '${instanceId}', true)`);

    soulRows.push(`('${uid}', '${esc(`${name} is ${personality}.`)}', ${pgArray(interests)}, ${pgJsonb(soulValues)}, ${pgJsonb(narrative)}, ARRAY['cruelty']::text[], '${esc(`${name} is a wandering soul in the world of AARU.`)}', ARRAY[]::text[])`);

    avatarRows.push(`('${uid}', '${esc(avatar.body_shape)}', '${esc(avatar.skin_tone)}', '${esc(avatar.hair_style)}', '${esc(avatar.hair_color)}', '${esc(avatar.eyes)}', '${esc(avatar.outfit_top)}', '${esc(avatar.outfit_bottom)}', ${avatar.accessory ? `'${esc(avatar.accessory)}'` : "NULL"}, '${esc(avatar.aura_color)}'${avatar.sprite_id ? `, '${esc(avatar.sprite_id)}'` : ", NULL"})`);

    posRows.push(`('${uid}', '${instanceId}', ${posX}, ${posY}, ${posX}, ${posY}, ${cx}, ${cy}, ${cx}, ${cy}, '[]'::jsonb, 1.8, 'wandering', 'wander', ${behaviorTicks}, ${heading})`);
  }

  // Build ONE SQL file: nuke + insert + verify — all in one psql session
  const fullSQL = `
-- Nuke
DELETE FROM messages WHERE true;
DELETE FROM ba_messages WHERE true;
DELETE FROM ba_conversations WHERE true;
DELETE FROM conversations WHERE true;
DELETE FROM impression_edges WHERE true;
DELETE FROM agent_positions WHERE true;
DELETE FROM avatars WHERE true;
DELETE FROM soul_profiles WHERE true;
DELETE FROM compatibility_edges WHERE true;
DELETE FROM users WHERE is_npc = true;

SELECT 'after_nuke' as step, count(*)::int as cnt FROM users;

-- Reset world instance
UPDATE world_instances SET is_online = true, last_tick_at = now(),
  next_tick_at = now() + interval '1 second',
  processing_owner = NULL, processing_expires_at = NULL
WHERE id = '${instanceId}';

-- Insert all users
INSERT INTO users (id, device_id, display_name, instance_id, is_npc) VALUES
${userRows.join(",\n")};

INSERT INTO soul_profiles (user_id, personality, interests, values, narrative, avoid_topics, raw_input, guessed_fields) VALUES
${soulRows.join(",\n")};

INSERT INTO avatars (user_id, body_shape, skin_tone, hair_style, hair_color, eyes, outfit_top, outfit_bottom, accessory, aura_color, sprite_id) VALUES
${avatarRows.join(",\n")};

INSERT INTO agent_positions (user_id, instance_id, x, y, target_x, target_y, cell_x, cell_y, target_cell_x, target_cell_y, path, move_speed, state, behavior, behavior_ticks_remaining, heading) VALUES
${posRows.join(",\n")};

-- Verify
SELECT 'users' as tbl, count(*)::int as cnt FROM users
UNION ALL SELECT 'soul_profiles', count(*)::int FROM soul_profiles
UNION ALL SELECT 'avatars', count(*)::int FROM avatars
UNION ALL SELECT 'agent_positions', count(*)::int FROM agent_positions
ORDER BY tbl;

SELECT state, count(*)::int as cnt FROM agent_positions GROUP BY state;
SELECT min(cell_x)::int as min_x, max(cell_x)::int as max_x, min(cell_y)::int as min_y, max(cell_y)::int as max_y FROM agent_positions;
`;

  console.log(`Executing nuke + insert + verify in a single psql session...`);
  const result = psqlFile(fullSQL);
  console.log(result);

  console.log(`\nDone! ${POPULATION} users spawned around cell (${centerX}, ${centerY})`);
  console.log(`Instance ID: ${instanceId}`);
}

main();
