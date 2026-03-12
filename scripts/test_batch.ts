import "dotenv/config";
import { randomUUID } from "crypto";

const token = process.env.SUPABASE_ACCESS_TOKEN!;
const pid = process.env.SUPABASE_PROJECT_ID!;

async function rawSql(q: string) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${pid}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q })
  });
  return { status: r.status, body: await r.text() };
}

async function test() {
  const uid = randomUUID();

  // Test: users + soul_profiles (2 tables)
  console.log("=== users + soul_profiles ===");
  const r1 = await rawSql(`
INSERT INTO users (id, device_id, display_name, instance_id, is_npc) VALUES ('${uid}', 'test-t-001', 'T1', '2b0e6fae-449f-4f13-97a6-aa15331fd736', true);
INSERT INTO soul_profiles (user_id, personality, interests, values, avoid_topics, raw_input, guessed_fields) VALUES ('${uid}', 'test', ARRAY['art']::text[], ARRAY['x']::text[], ARRAY['y']::text[], 'z', ARRAY[]::text[]);
  `);
  console.log("Status:", r1.status);
  const c1 = await rawSql(`SELECT count(*)::int as cnt FROM users WHERE id = '${uid}'`);
  console.log("User exists:", c1.body);

  // Now add avatar
  console.log("\n=== + avatars ===");
  const r2 = await rawSql(`
INSERT INTO avatars (user_id, body_shape, skin_tone, hair_style, hair_color, eyes, outfit_top, outfit_bottom, accessory, aura_color, sprite_id) VALUES ('${uid}', 'athletic', 'amber', 'braid', 'black', 'round', 'tunic', 'pants', NULL, '#d4af37', 'human_curlyhair');
  `);
  console.log("Status:", r2.status, "Body:", r2.body.slice(0, 300));
  const c2 = await rawSql(`SELECT count(*)::int as cnt FROM avatars WHERE user_id = '${uid}'`);
  console.log("Avatar exists:", c2.body);

  // Now add position
  console.log("\n=== + agent_positions ===");
  const r3 = await rawSql(`
INSERT INTO agent_positions (user_id, instance_id, x, y, target_x, target_y, cell_x, cell_y, target_cell_x, target_cell_y, path, move_speed, state, behavior, behavior_ticks_remaining, heading) VALUES ('${uid}', '2b0e6fae-449f-4f13-97a6-aa15331fd736', 0.5, 0.5, 0.5, 0.5, 32, 32, 32, 32, '[]'::jsonb, 1.8, 'wandering', 'wander', 5, 0);
  `);
  console.log("Status:", r3.status, "Body:", r3.body.slice(0, 300));
  const c3 = await rawSql(`SELECT count(*)::int as cnt FROM agent_positions WHERE user_id = '${uid}'`);
  console.log("Position exists:", c3.body);

  // All in one call
  console.log("\n=== ALL 4 in one call ===");
  const uid2 = randomUUID();
  const r4 = await rawSql(`
INSERT INTO users (id, device_id, display_name, instance_id, is_npc) VALUES ('${uid2}', 'test-t-002', 'T2', '2b0e6fae-449f-4f13-97a6-aa15331fd736', true);
INSERT INTO soul_profiles (user_id, personality, interests, values, avoid_topics, raw_input, guessed_fields) VALUES ('${uid2}', 'test', ARRAY['art']::text[], ARRAY['x']::text[], ARRAY['y']::text[], 'z', ARRAY[]::text[]);
INSERT INTO avatars (user_id, body_shape, skin_tone, hair_style, hair_color, eyes, outfit_top, outfit_bottom, accessory, aura_color, sprite_id) VALUES ('${uid2}', 'athletic', 'amber', 'braid', 'black', 'round', 'tunic', 'pants', NULL, '#d4af37', 'human_curlyhair');
INSERT INTO agent_positions (user_id, instance_id, x, y, target_x, target_y, cell_x, cell_y, target_cell_x, target_cell_y, path, move_speed, state, behavior, behavior_ticks_remaining, heading) VALUES ('${uid2}', '2b0e6fae-449f-4f13-97a6-aa15331fd736', 0.5, 0.5, 0.5, 0.5, 32, 32, 32, 32, '[]'::jsonb, 1.8, 'wandering', 'wander', 5, 0);
  `);
  console.log("Status:", r4.status, "Body:", r4.body.slice(0, 300));
  const c4 = await rawSql(`SELECT count(*)::int as cnt FROM users WHERE id = '${uid2}'`);
  console.log("User exists:", c4.body);

  // Cleanup
  await rawSql(`DELETE FROM agent_positions WHERE user_id IN ('${uid}', '${uid2}'); DELETE FROM avatars WHERE user_id IN ('${uid}', '${uid2}'); DELETE FROM soul_profiles WHERE user_id IN ('${uid}', '${uid2}'); DELETE FROM users WHERE id IN ('${uid}', '${uid2}')`);
  console.log("\nCleaned up");
}

test().catch(console.error);
