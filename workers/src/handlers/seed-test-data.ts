import { jsonResponse } from "../../../src/lib/http.ts";
import type { Env } from "../env.ts";
import type { NeonSQL } from "../db.ts";
import { computePhotoEtag } from "../matchApp.ts";

const TEST_USERS = {
  alex: {
    id: "aaaaaaaa-0001-4000-a000-000000000001",
    deviceId: "test-device-alex-0001",
    displayName: "Alex",
    age: 28,
    gender: "male",
    preferredGenders: ["female"],
    clerkEmail: "apptest@trymagpie.xyz"
  },
  claire: {
    id: "aaaaaaaa-0002-4000-a000-000000000002",
    deviceId: "test-device-claire-0002",
    displayName: "Claire",
    age: 26,
    gender: "female",
    preferredGenders: ["male"],
    hasPhoto: true
  },
  sophia: {
    id: "aaaaaaaa-0003-4000-a000-000000000003",
    deviceId: "test-device-sophia-0003",
    displayName: "Sophia",
    age: 27,
    gender: "female",
    preferredGenders: ["male"],
    hasPhoto: false
  }
} as const;

function authorize(request: Request, env: Env): { ok: true } | { ok: false; status: number; message: string } {
  if (!env.ADMIN_TOKEN) {
    return { ok: false, status: 503, message: "Admin endpoint not configured" };
  }
  const header = request.headers.get("x-thumos-admin-token")?.trim();
  if (!header || header !== env.ADMIN_TOKEN) {
    return { ok: false, status: 403, message: "Invalid admin token" };
  }
  return { ok: true };
}

export async function handleSeedTestData(
  sql: NeonSQL,
  env: Env,
  _payload: unknown,
  request: Request
) {
  const auth = authorize(request, env);
  if (!auth.ok) {
    return jsonResponse(auth.status, { code: auth.status, message: auth.message });
  }

  const results: string[] = [];

  // Step 1: Create/update Clerk user via Clerk API (if CLERK_SECRET_KEY is set)
  let clerkUserId: string | null = null;
  if (env.CLERK_SECRET_KEY) {
    clerkUserId = await ensureClerkUser(env.CLERK_SECRET_KEY, results);
  } else {
    results.push("CLERK_SECRET_KEY not set — skipping Clerk user creation");
  }

  // Step 2: Upsert test users
  for (const [name, user] of Object.entries(TEST_USERS)) {
    const clerkId = name === "alex" ? clerkUserId : null;
    await sql`
      INSERT INTO users (id, device_id, display_name, is_test_user, clerk_user_id, language)
      VALUES (${user.id}, ${user.deviceId}, ${user.displayName}, true, ${clerkId}, 'en')
      ON CONFLICT (id) DO UPDATE SET
        device_id = EXCLUDED.device_id,
        display_name = EXCLUDED.display_name,
        is_test_user = true,
        clerk_user_id = EXCLUDED.clerk_user_id
    `;
    results.push(`User ${name} (${user.id}) upserted`);
  }

  // Step 3: Upsert soulmate profiles
  const lat = 37.7749; // San Francisco
  const lon = -122.4194;
  for (const [name, user] of Object.entries(TEST_USERS)) {
    await sql`
      INSERT INTO soulmate_profiles (user_id, display_name, age, gender, latitude, longitude,
        preferred_age_min, preferred_age_max, preferred_genders, active, photo_count)
      VALUES (${user.id}, ${user.displayName}, ${user.age}, ${user.gender},
        ${lat}, ${lon}, 18, 40, ${user.preferredGenders}, true,
        ${"hasPhoto" in user && user.hasPhoto ? 1 : 0})
      ON CONFLICT (user_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        age = EXCLUDED.age,
        gender = EXCLUDED.gender,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        preferred_genders = EXCLUDED.preferred_genders,
        photo_count = EXCLUDED.photo_count,
        updated_at = now()
    `;
    results.push(`Profile for ${name} upserted`);
  }

  // Step 4: Upsert visible soul files
  await seedSoulFiles(sql, results);

  // Step 5: Seed soul messages for Alex
  await seedSoulMessages(sql, results);

  // Step 6: Seed matches (Alex ↔ Claire, Alex ↔ Sophia)
  await seedMatches(sql, results);

  // Step 7: Seed chat messages
  await seedMatchMessages(sql, results);

  // Step 8: Seed photo for Claire
  await seedPhoto(sql, results);

  return jsonResponse(200, { ok: true, results });
}

async function ensureClerkUser(secretKey: string, results: string[]): Promise<string | null> {
  try {
    // Check if user already exists
    const searchRes = await fetch(
      `https://api.clerk.com/v1/users?email_address=${encodeURIComponent("apptest@trymagpie.xyz")}`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );
    const existing = await searchRes.json() as Array<{ id: string }>;
    if (existing.length > 0) {
      results.push(`Clerk user already exists: ${existing[0].id}`);
      return existing[0].id;
    }

    // Create new user
    const createRes = await fetch("https://api.clerk.com/v1/users", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email_address: ["apptest@trymagpie.xyz"],
        password: "apptest@trymagpie",
        skip_password_checks: true
      })
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      results.push(`Clerk user creation failed: ${err}`);
      return null;
    }
    const created = await createRes.json() as { id: string };
    results.push(`Clerk user created: ${created.id}`);
    return created.id;
  } catch (error) {
    results.push(`Clerk API error: ${error}`);
    return null;
  }
}

async function seedSoulFiles(sql: NeonSQL, results: string[]) {
  const files = [
    {
      userId: TEST_USERS.alex.id,
      portrait: "Alex is a warm, curious soul who finds meaning in the small rituals of daily life. A natural improviser in the kitchen and in conversation, he balances structure with spontaneity. His emotional depth runs quiet but steady — the kind of person who listens before he speaks and remembers the details that matter.",
      howYouLightUp: "You come alive in moments of creative flow — when the recipe goes off-script and something unexpected emerges. Music, long walks, and deep conversations with close friends fuel your energy.",
      howYouShowUp: "You lead with calm reliability. People trust you because you follow through, and you bring a steady presence that puts others at ease even in chaos.",
      howYouLove: "You love through acts of care — a home-cooked meal, remembering someone's favorite song, showing up consistently. Your love language is quiet devotion.",
      howYouWeatherStorms: "You process internally first, then communicate. You need space to think but always come back to the conversation. Conflict makes you uncomfortable but you've learned to lean into it.",
      whatYoureLookingFor: "Someone who matches your depth. You want a partner who can sit in comfortable silence and also stay up late talking about everything. Authenticity over perfection.",
      yourGrowingEdges: "You sometimes retreat too far into your own head. Learning to share your feelings in real-time rather than after processing is your growth edge.",
      yourWarmth: "Your friends describe you as the person who makes everyone feel seen. You notice when someone's energy shifts and quietly check in."
    },
    {
      userId: TEST_USERS.claire.id,
      portrait: "Claire is a vibrant, emotionally intelligent woman who navigates the world with equal parts grace and fierce authenticity. A lover of art, spontaneous adventures, and meaningful connections, she brings warmth and honesty to every relationship.",
      howYouLightUp: "You light up around creative expression — painting, dancing, or simply rearranging a room to feel more alive. Nature grounds you, and you seek beauty in everyday moments.",
      howYouShowUp: "You show up with your whole heart. People know where they stand with you because you value honesty over comfort. You're the friend who tells the truth with love.",
      howYouLove: "You love expressively and physically — through touch, words of affirmation, and creating shared experiences. You want your partner to feel chosen every day.",
      howYouWeatherStorms: "You face conflict head-on but with compassion. You'd rather have a hard conversation now than let resentment build. You need to feel heard to move forward.",
      whatYoureLookingFor: "A partner who is emotionally present and unafraid of vulnerability. Someone who can match your intensity but also bring calm when you need grounding.",
      yourGrowingEdges: "You sometimes take on others' emotions as your own. Learning to hold space without absorbing is your ongoing work.",
      yourWarmth: "Your warmth is infectious — you make strangers feel like old friends and create pockets of joy wherever you go."
    },
    {
      userId: TEST_USERS.sophia.id,
      portrait: "Sophia is a thoughtful, introspective woman with a quiet strength that draws people in. An avid reader and journal-keeper, she processes the world through writing and finds connection in shared vulnerability.",
      howYouLightUp: "You light up in libraries, coffee shops, and one-on-one conversations that go deep fast. Ideas energize you — the intersection of philosophy and everyday life is your playground.",
      howYouShowUp: "You show up with intentionality. Nothing about you is casual or careless. You think before you speak and when you do, people listen.",
      howYouLove: "You love through understanding — learning someone's inner world, remembering their dreams, and supporting their growth even when it's inconvenient for you.",
      howYouWeatherStorms: "You write through conflict before talking about it. Your journal is your first therapist. You need time but you always return to repair.",
      whatYoureLookingFor: "Someone who values inner life as much as outer adventure. You want intellectual chemistry that deepens over time, not just sparks that fade.",
      yourGrowingEdges: "You can be too in your head, analyzing feelings instead of feeling them. Letting go of the narrative and being present is your edge.",
      yourWarmth: "Your warmth comes through in handwritten notes, remembered birthdays, and the way you ask questions that make people feel truly known."
    }
  ];

  for (const f of files) {
    // Delete existing and insert fresh
    await sql`DELETE FROM visible_soul_files WHERE user_id = ${f.userId}`;
    await sql`
      INSERT INTO visible_soul_files (
        user_id, version, status, portrait,
        how_you_light_up, how_you_show_up, how_you_love,
        how_you_weather_storms, what_youre_looking_for,
        your_growing_edges, your_warmth,
        crystallized_moments, open_threads, compass_scores,
        personality_spectrum, top_values, completeness
      ) VALUES (
        ${f.userId}, 1, 'ready', ${f.portrait},
        ${f.howYouLightUp}, ${f.howYouShowUp}, ${f.howYouLove},
        ${f.howYouWeatherStorms}, ${f.whatYoureLookingFor},
        ${f.yourGrowingEdges}, ${f.yourWarmth},
        '[]'::jsonb, '[]'::jsonb, '{}'::jsonb,
        '{}'::jsonb, '[]'::jsonb, 0.85
      )
    `;
    results.push(`Soul file seeded for user ${f.userId}`);
  }
}

async function seedSoulMessages(sql: NeonSQL, results: string[]) {
  const alexId = TEST_USERS.alex.id;
  // Clear existing test messages
  await sql`DELETE FROM soul_messages WHERE user_id = ${alexId}`;

  const messages = [
    { role: "assistant", content: "Hey! I'm so glad you're here. I'd love to get to know the real you — not the resume version, but the person behind it all. What's something that lights you up lately?" },
    { role: "user", content: "I've been really into cooking recently. There's something meditative about it — following a recipe step by step, but also knowing when to improvise and trust my instincts." },
    { role: "assistant", content: "I love that distinction — the recipe versus the improvisation. It says something about you, actually. You appreciate structure, but you're not rigid. You trust yourself enough to go off-script. When did you first realize cooking was more than just feeding yourself?" },
    { role: "user", content: "Probably when I cooked for friends for the first time and saw how it brought everyone together. The food was just okay but the evening was perfect. I realized I wasn't just cooking — I was creating a space for people to connect." },
    { role: "assistant", content: "That's beautiful — and really telling. You're not someone who just wants to be good at things for the sake of mastery. You want what you do to mean something to the people around you. That generosity of spirit... is that how you show up in most of your relationships?" },
    { role: "user", content: "Yeah, I think so. I'm the friend who remembers what you mentioned three weeks ago and follows up on it. I notice the small things. Sometimes I wonder if people notice that about me though." },
    { role: "assistant", content: "There's a quiet ache in that — being the one who sees, and wondering if you're truly seen in return. That's not a flaw, Alex. That's depth. The right person will notice you noticing. And they'll make sure you know it." },
    { role: "user", content: "That actually means a lot to hear. I've never really put it into words like that before." }
  ];

  for (const msg of messages) {
    await sql`
      INSERT INTO soul_messages (user_id, role, content)
      VALUES (${alexId}, ${msg.role}, ${msg.content})
    `;
  }
  results.push(`${messages.length} soul messages seeded for Alex`);
}

async function seedMatches(sql: NeonSQL, results: string[]) {
  const alexId = TEST_USERS.alex.id;
  const claireId = TEST_USERS.claire.id;
  const sophiaId = TEST_USERS.sophia.id;

  // Alex < Claire and Alex < Sophia (lexicographic), so Alex is always user_a
  const matches = [
    {
      userA: alexId,
      userB: claireId,
      score: 0.92,
      reasoningA: "Claire's expressiveness and emotional warmth could be exactly what draws you out of your head and into the moment. You both value authenticity over pretense, and her direct communication style matches your desire for honesty. Where you create connection through care and cooking, she creates it through presence and joy — together, you'd build something both grounded and alive.",
      reasoningB: "Alex's quiet depth and attentiveness are the kind of things you might not notice at first — but once you do, you can't unsee them. He notices the details others miss, and his love shows up in steady, tangible ways. Your expressiveness meets his groundedness in a way that could feel like coming home.",
      connectionZones: ["emotional depth", "authenticity", "creative expression"]
    },
    {
      userA: alexId,
      userB: sophiaId,
      score: 0.87,
      reasoningA: "Sophia's intellectual curiosity and introspective nature mirror your own inner world in ways that could spark deep, lasting conversation. You both process before you speak, value depth over breadth, and find meaning in the quiet moments. She'd understand your need for space because she needs it too — and when you come back together, the connection would be richer for it.",
      reasoningB: "Alex has the kind of quiet strength that you've always been drawn to. He's someone who listens deeply and shows love through action rather than grand gestures. Your shared love of meaningful conversation and comfortable silence creates a foundation that most people never find.",
      connectionZones: ["intellectual depth", "quiet devotion", "inner world"]
    }
  ];

  for (const m of matches) {
    // Delete existing match between these users
    await sql`
      DELETE FROM matches
      WHERE user_a_id = ${m.userA} AND user_b_id = ${m.userB}
    `;
    await sql`
      INSERT INTO matches (
        user_a_id, user_b_id, a_soul_version, b_soul_version,
        result, score, reasoning_a, reasoning_b,
        connection_zones
      ) VALUES (
        ${m.userA}, ${m.userB}, 1, 1,
        'match', ${m.score}, ${m.reasoningA}, ${m.reasoningB},
        ${JSON.stringify(m.connectionZones)}::jsonb
      )
    `;
    results.push(`Match seeded: ${m.userA} ↔ ${m.userB}`);
  }
}

async function seedMatchMessages(sql: NeonSQL, results: string[]) {
  const alexId = TEST_USERS.alex.id;
  const claireId = TEST_USERS.claire.id;
  const sophiaId = TEST_USERS.sophia.id;

  // Clear existing test messages
  await sql`
    DELETE FROM match_messages
    WHERE sender_id IN (${alexId}, ${claireId}, ${sophiaId})
       OR receiver_id IN (${alexId}, ${claireId}, ${sophiaId})
  `;

  const alexClaireChat = [
    { sender: claireId, receiver: alexId, content: "Hey Alex! Magpie matched us — I read about your love of cooking and honestly, that's such an attractive quality. What's the last thing you improvised in the kitchen?" },
    { sender: alexId, receiver: claireId, content: "Hey Claire! Last night I made this fusion thing — Thai curry flavors but in a pasta format. It was either genius or chaos, I'm still not sure which 😄" },
    { sender: claireId, receiver: alexId, content: "That sounds amazing actually! I love when people are brave enough to mix things that shouldn't work. I'm the same way with art — my best paintings came from happy accidents." },
    { sender: alexId, receiver: claireId, content: "A painter! I'd love to see your work sometime. There's something about cooking and painting that feels similar — you start with a plan but the best part is when the medium surprises you." }
  ];

  const alexSophiaChat = [
    { sender: sophiaId, receiver: alexId, content: "Hi Alex. I loved what Magpie shared about how you notice the small things. That resonated with me — I'm someone who lives in the details too." },
    { sender: alexId, receiver: sophiaId, content: "Hi Sophia! That means a lot. I think the details are where real life happens, you know? Not in the big moments but in the Tuesday morning coffee conversations." },
    { sender: sophiaId, receiver: alexId, content: "Exactly. I actually just journaled about that — how the most meaningful connections happen in the margins, not the headlines. Have you read any Mary Oliver? She captures that perfectly." }
  ];

  for (const msg of alexClaireChat) {
    await sql`
      INSERT INTO match_messages (sender_id, receiver_id, content)
      VALUES (${msg.sender}, ${msg.receiver}, ${msg.content})
    `;
  }
  for (const msg of alexSophiaChat) {
    await sql`
      INSERT INTO match_messages (sender_id, receiver_id, content)
      VALUES (${msg.sender}, ${msg.receiver}, ${msg.content})
    `;
  }
  results.push(`${alexClaireChat.length + alexSophiaChat.length} match messages seeded`);
}

async function seedPhoto(sql: NeonSQL, results: string[]) {
  const claireId = TEST_USERS.claire.id;

  // Check if photo already exists
  const existing = await sql`
    SELECT 1 FROM soulmate_photos WHERE user_id = ${claireId} LIMIT 1
  `;
  if (existing.length > 0) {
    results.push("Claire photo already exists, skipping");
    return;
  }

  try {
    // Download a placeholder avatar
    const res = await fetch("https://placehold.co/200x200/FFB6C1/333333.png?text=C");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = new Uint8Array(await res.arrayBuffer());
    const etag = await computePhotoEtag(data);

    await sql`
      INSERT INTO soulmate_photos (user_id, idx, data, mime_type, byte_size, etag)
      VALUES (${claireId}, 0, ${data}, 'image/png', ${data.byteLength}, ${etag})
    `;
    results.push(`Claire photo seeded (${data.byteLength} bytes, etag=${etag})`);
  } catch (error) {
    results.push(`Claire photo fetch failed: ${error}`);
  }
}
