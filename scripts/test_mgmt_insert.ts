import "dotenv/config";
import { randomUUID } from "crypto";

const token = process.env.SUPABASE_ACCESS_TOKEN!;
const pid = process.env.SUPABASE_PROJECT_ID!;

async function sql(q: string) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${pid}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q })
  });
  return r.json();
}

async function test() {
  const uid = randomUUID();

  // Test: multi-statement with pre-generated UUID and FK reference
  await sql(`
INSERT INTO users (id, device_id, display_name, is_npc) VALUES ('${uid}', 'test-multi-001', 'MultiTest', true);
INSERT INTO soul_profiles (user_id, personality, interests, values, avoid_topics, raw_input, guessed_fields) VALUES ('${uid}', 'test', ARRAY['art']::text[], ARRAY['honesty']::text[], ARRAY['none']::text[], 'test', ARRAY[]::text[]);
  `);

  const r2 = await sql("SELECT count(*)::int as cnt FROM users WHERE device_id = 'test-multi-001'");
  console.log("Multi-stmt persists:", r2);

  // Test: multi-row INSERT
  const uid2 = randomUUID();
  const uid3 = randomUUID();
  await sql(`
INSERT INTO users (id, device_id, display_name, is_npc) VALUES
('${uid2}', 'test-multi-002', 'MultiTest2', true),
('${uid3}', 'test-multi-003', 'MultiTest3', true);
  `);

  const r3 = await sql("SELECT count(*)::int as cnt FROM users WHERE device_id LIKE 'test-multi-00%'");
  console.log("Multi-row persists:", r3);

  // Cleanup
  await sql("DELETE FROM soul_profiles WHERE user_id IN (SELECT id FROM users WHERE device_id LIKE 'test-multi-%'); DELETE FROM users WHERE device_id LIKE 'test-multi-%'");
  console.log("Cleaned up");
}

test().catch(console.error);
