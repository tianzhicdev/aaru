-- Marketing screenshot seed data for App Store screenshots
-- Run: source .env && psql "$DATABASE_URL_DEV" -f scripts/seed-marketing.sql
-- Safe to re-run (deletes + re-inserts for clean state)
--
-- Screenshots covered:
--   2. AI Interview    → soul_messages (last 3 messages)
--   3. Soul File       → visible_soul_files (Luna)
--   4. Why You Match   → matches reasoning (Luna + Noor)
--   5. Match Chat      → match_messages Option A (Luna + Noor)
--   6. Privacy screen  → no data needed

BEGIN;

-- ============================================================
-- 0. Clean up stale marketing users from prior seed versions
-- ============================================================
DELETE FROM users WHERE device_id IN ('mrk-match-2', 'mrk-match-3', 'mrk-match-4');

-- ============================================================
-- 1. Users: Luna (main) + Noor (match)
-- ============================================================

INSERT INTO users (id, device_id, display_name, model_profile_id, language, last_active_at)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'mrk',       'Luna', 'frontier', 'en', now()),
  ('a0000000-0000-0000-0000-000000000002', 'mrk-match', 'Noor', 'frontier', 'en', now())
ON CONFLICT (device_id) DO UPDATE SET display_name = EXCLUDED.display_name;

-- Resolve actual user IDs (may differ from INSERT if rows pre-existed)
DO $$
DECLARE
  v_luna uuid; v_noor uuid;
BEGIN
  SELECT id INTO v_luna FROM users WHERE device_id = 'mrk';
  SELECT id INTO v_noor FROM users WHERE device_id = 'mrk-match';

  CREATE TEMP TABLE IF NOT EXISTS _mrk_ids (key text PRIMARY KEY, uid uuid);
  INSERT INTO _mrk_ids VALUES ('luna', v_luna), ('noor', v_noor)
  ON CONFLICT (key) DO UPDATE SET uid = EXCLUDED.uid;
END $$;

-- ============================================================
-- 2. Soul messages for Luna
--    Earlier messages build character; last 3 are Screenshot 2
--    Screenshot 2 timestamps: 8:47 PM, 8:49 PM, 8:49 PM
-- ============================================================

DELETE FROM soul_messages WHERE user_id = (SELECT uid FROM _mrk_ids WHERE key = 'luna');

INSERT INTO soul_messages (user_id, role, content, created_at)
SELECT uid, role, content, ts
FROM _mrk_ids, (VALUES
  -- Day 1: opening
  ('assistant', 'Hey! I''m really glad you''re here. What''s the last thing that genuinely made you laugh — even something tiny?',
   now() - interval '7 days'),

  ('user', 'my friend sent me a voice note that was supposed to be 10 seconds and turned into a 4 minute unhinged rant about how her cat judges her lifestyle choices. i played it three times',
   now() - interval '7 days' + interval '2 minutes'),

  ('assistant', 'Three times! What is it about that kind of thing that gets you?',
   now() - interval '7 days' + interval '4 minutes'),

  ('user', 'i think it''s when people are accidentally themselves?? like she wasn''t trying to be funny she was genuinely outraged. that unfiltered energy is my favorite thing in humans',
   now() - interval '7 days' + interval '7 minutes'),

  -- Day 2: going deeper
  ('assistant', 'Authenticity as comedy. Does that show up in other parts of your life too?',
   now() - interval '6 days'),

  ('user', 'literally everywhere. i can''t do small talk for more than like 90 seconds before i ask someone what they''re actually thinking about. it either makes people love me or think i''m insane lol',
   now() - interval '6 days' + interval '3 minutes'),

  ('assistant', 'What happens when you find someone who matches that energy?',
   now() - interval '6 days' + interval '5 minutes'),

  ('user', 'honestly it''s the best feeling. like when the conversation just drops a level and suddenly you''re both being real and nobody''s performing. that''s when i feel most alive',
   now() - interval '6 days' + interval '8 minutes'),

  -- Day 3: daily life
  ('assistant', 'That shift from performing to connecting — it sounds almost physical for you. What does your world look like day to day?',
   now() - interval '5 days'),

  ('user', 'i work in UX so i stare at screens and try to make things make sense for people. evenings are either reading in complete silence or going too deep in conversation with someone i care about. no in between',
   now() - interval '5 days' + interval '3 minutes'),

  ('assistant', 'Reading in complete silence or going deep — that''s a very specific toggle. What''s the silence about for you?',
   now() - interval '5 days' + interval '5 minutes'),

  ('user', 'recharging. i''m social when i want to be but my battery is finite. silence isn''t lonely for me it''s necessary. the right person would understand that without me having to explain it every time',
   now() - interval '5 days' + interval '8 minutes'),

  -- Day 4: relationships
  ('assistant', 'Being understood without having to narrate yourself. Has someone ever gotten that right?',
   now() - interval '4 days'),

  ('user', 'my best friend. she''ll come over and we''ll sit in the same room doing completely different things and not talk for an hour and it''s the most intimate thing. she never tries to fill the quiet',
   now() - interval '4 days' + interval '2 minutes'),

  ('assistant', 'Silence as intimacy, not awkwardness. What about romantic relationships — what have you learned about how you love?',
   now() - interval '4 days' + interval '4 minutes'),

  ('user', 'that i lead with jokes and it takes me a while to let someone actually see me. i''m funny and warm up front but the real stuff is behind a few doors. not because i don''t want to share it i just need to know someone will be careful with it',
   now() - interval '4 days' + interval '7 minutes'),

  -- Day 5: trust and loyalty
  ('assistant', 'Humor as the first door, vulnerability behind the next ones. What does earning that trust look like?',
   now() - interval '3 days'),

  ('user', 'consistency. remembering the random stuff. not grand gestures but like bringing you tea when you''re stressed without asking. proof that someone was actually paying attention when it didn''t matter yet',
   now() - interval '3 days' + interval '3 minutes'),

  ('assistant', 'Being seen in the mundane moments, not just the highlights. That keeps coming back in everything you say.',
   now() - interval '3 days' + interval '5 minutes'),

  ('user', 'because it''s the whole thing for me. i''m loyal to a stupid degree once i trust someone. ride or die. but earning it takes time because i''ve let people in too fast before and got hurt. so the door opens slower now but it opens wider',
   now() - interval '3 days' + interval '8 minutes'),

  -- Day 6: what she wants
  ('assistant', 'A slower door that opens wider. When you picture the right partnership, what does it look like?',
   now() - interval '2 days'),

  ('user', 'someone who makes me laugh when i''m spiraling. who sits in the silence with me. who texts me something random at 2pm because it reminded them of me. nothing performative just real',
   now() - interval '2 days' + interval '3 minutes'),

  -- *** SCREENSHOT 2: last 3 messages (8:47 PM, 8:49 PM, 8:49 PM) ***
  ('assistant', 'what''s something someone could do that would make you feel completely seen?',
   (CURRENT_DATE - 1) + interval '20 hours 47 minutes'),

  ('user', 'idk honestly just remembering things. like if i mention something random and they bring it up weeks later. that kills me',
   (CURRENT_DATE - 1) + interval '20 hours 49 minutes'),

  ('assistant', 'so it''s not grand gestures — it''s proof that someone was actually listening when it didn''t matter yet',
   (CURRENT_DATE - 1) + interval '20 hours 49 minutes 30 seconds')

  -- ALT Screenshot 2 (swap the last 3 messages above for these if preferred):
  -- ('assistant', 'what do people usually get wrong about you on first impression?',
  --  (CURRENT_DATE - 1) + interval '21 hours 12 minutes'),
  -- ('user', 'they think i''m really confident lol. like i can talk to anyone but i go home and replay every conversation wondering if i said something stupid',
  --  (CURRENT_DATE - 1) + interval '21 hours 14 minutes'),
  -- ('assistant', 'so the performance is easy. it''s believing you deserved to be in the room that''s hard',
  --  (CURRENT_DATE - 1) + interval '21 hours 14 minutes 30 seconds')

) AS t(role, content, ts)
WHERE _mrk_ids.key = 'luna';

-- ============================================================
-- 3. Visible soul file for Luna (Screenshot 3)
--    Compass uses the app's 8 hardcoded axes (0-100 scale)
--    Portrait = the screenshot excerpt text
-- ============================================================

DELETE FROM visible_soul_files WHERE user_id = (SELECT uid FROM _mrk_ids WHERE key = 'luna');

INSERT INTO visible_soul_files (
  user_id, version, portrait,
  how_you_light_up, how_you_show_up, how_you_love,
  how_you_weather_storms, what_youre_looking_for,
  your_growing_edges, your_warmth,
  crystallized_moments, open_threads,
  compass_scores, personality_spectrum, top_values,
  relational_style, attachment_style, love_signature,
  completeness, status
)
SELECT
  uid, 1,

  -- Portrait (Screenshot 3 visible excerpt)
  'Leads with humor as armor but craves being known underneath it. Loyal to a fault once trust is earned — but trust is earned slowly. Needs a partner who can sit in silence without filling it. Finds safety in people who ask follow-up questions instead of changing the subject.',

  -- how_you_light_up
  'You come alive when conversations drop a level — when someone stops performing and starts being accidentally real. Your favorite moments are voice notes that go off-script, midnight confessions that weren''t planned, the electric second when both people stop pretending at the same time.',

  -- how_you_show_up
  'Warm and funny on the surface, carefully layered underneath. You can talk to anyone for 90 seconds but you''ll ask what they''re really thinking within the first two minutes. People either love that or they don''t — and you''re fine with either.',

  -- how_you_love
  'You love by listening. By remembering the throwaway thing someone said three weeks ago and bringing it up when it counts. Your loyalty is absolute once earned — ride or die, no questions. But earning it means showing up in the boring moments, not just the dramatic ones.',

  -- how_you_weather_storms
  'You need space before you can engage honestly. Your humor comes out first — deflecting, softening, buying time. Then the real thing arrives. You''ve learned to name this pattern clearly now. When you''re ready, you want depth over resolution, honesty over peace.',

  -- what_youre_looking_for
  'Someone who makes you laugh when you''re spiraling. Who sits in the silence without filling it. Who texts you something random at 2pm because it reminded them of you. Nothing performative — just proof of real attention.',

  -- your_growing_edges
  'The doors open slower now, and that''s mostly wisdom. But sometimes they filter out people who are genuine but just move at a different pace. Learning to tell the difference between protecting yourself and hiding.',

  -- your_warmth
  'You have a gift for making people feel like the most interesting person in the room — and meaning it. Your curiosity is real and people feel it immediately.',

  -- crystallized_moments
  '[
    {"quote": "when people are accidentally themselves — that unfiltered energy is my favorite thing in humans", "reflection": "Her deepest joy lives in watching people forget to perform."},
    {"quote": "silence isn''t lonely for me. the right person would understand that without me having to explain it every time", "reflection": "Intimacy for her is the absence of noise, not its presence."},
    {"quote": "i''m loyal to a stupid degree once i trust someone. but earning it takes time because i''ve let people in too fast before", "reflection": "A slower door that opens wider — trust earned in ordinary moments, not dramatic ones."}
  ]'::jsonb,

  -- open_threads
  '["How her humor-as-armor pattern developed and what it protects", "The friendship that taught her what silence-as-intimacy means", "What she is learning about the pace of trust"]'::jsonb,

  -- compass_scores (0-100, shaped for visual interest on the radar chart)
  '{"openness": 76, "playfulness": 72, "warmth": 85, "emotional_depth": 88, "devotion": 82, "resilience": 48, "independence": 72, "passion": 58}'::jsonb,

  -- personality_spectrum
  '{
    "openness": {"position": 80, "label": "Deep Diver", "evidence": "Skips small talk within 90 seconds — always heading for the real conversation"},
    "conscientiousness": {"position": 55, "label": "Instinct-Led", "evidence": "Follows the conversation wherever it goes, structured only when it matters"},
    "extraversion": {"position": 42, "label": "Selective Igniter", "evidence": "Social battery is finite but burns bright with the right person"},
    "agreeableness": {"position": 78, "label": "Warm Challenger", "evidence": "Leads with kindness but won''t pretend things are fine when they aren''t"},
    "emotionalSensitivity": {"position": 84, "label": "Attuned Reader", "evidence": "Reads the room before speaking and holds space for what she finds there"}
  }'::jsonb,

  -- top_values
  '[
    {"value": "Authenticity", "description": "She''d rather have one real conversation than a hundred polished ones."},
    {"value": "Earned Loyalty", "description": "Once she trusts you, she''s all in — but the door opens on her timeline."},
    {"value": "Quiet Attention", "description": "Love lives in the follow-up question, the remembered detail, the silence that isn''t awkward."}
  ]'::jsonb,

  -- relational_style
  'Slow-building, humor-forward, deeply loyal. Connects through real conversation and proof of attention over time.',

  -- attachment_style
  'Secure-leaning with a cautious entry — takes time to trust but loves completely once she does.',

  -- love_signature
  'The Follow-Up Question — Luna loves by proving she was listening when it didn''t matter yet.',

  0.88,
  'ready'
FROM _mrk_ids WHERE key = 'luna';

-- ============================================================
-- 4. Visible soul file for Noor (needed for matching)
-- ============================================================

DELETE FROM visible_soul_files WHERE user_id = (SELECT uid FROM _mrk_ids WHERE key = 'noor');

INSERT INTO visible_soul_files (
  user_id, version, portrait, how_you_light_up, how_you_show_up, how_you_love, what_youre_looking_for,
  compass_scores, personality_spectrum, top_values,
  relational_style, attachment_style, love_signature, completeness, status
)
SELECT uid, 1,
  'Noor speaks in observations that land three seconds after she says them. Quiet confidence, wicked humor, and an unshakeable instinct for naming the thing everyone else is dancing around.',
  'You light up when someone surprises you with honesty — the unplanned confession, the joke that reveals something real.',
  'Calm and perceptive. You make people feel heard in a way they can''t quite explain.',
  'You love by naming what others can''t. The partner who says "you seem off today" before you''ve admitted it to yourself.',
  'Someone who leads with humor but has depth underneath. A partner who earns trust slowly and keeps it fiercely.',
  '{"openness": 82, "playfulness": 74, "warmth": 80, "emotional_depth": 90, "devotion": 84, "resilience": 76, "independence": 78, "passion": 68}'::jsonb,
  '{"openness": {"position": 83, "label": "Perceptive Explorer", "evidence": "Reads between every line"}, "conscientiousness": {"position": 70, "label": "Intentional", "evidence": "Deliberate in everything"}, "extraversion": {"position": 45, "label": "Quiet Presence", "evidence": "Fills a room without raising her voice"}, "agreeableness": {"position": 72, "label": "Direct Warmth", "evidence": "Says what she means, gently"}, "emotionalSensitivity": {"position": 88, "label": "Deep Feeler", "evidence": "Feels everything, processes through words"}}'::jsonb,
  '[{"value": "Emotional Honesty", "description": "Names the feeling everyone else avoids."}, {"value": "Presence", "description": "Would rather be fully here than half-anywhere."}, {"value": "Depth", "description": "Small talk is just the lobby."}]'::jsonb,
  'Attentive and perceptive. Names what others can''t, stays when others leave.',
  'Secure and emotionally fluent — creates safety by being the first to be vulnerable.',
  'The Mirror — Noor loves by reflecting back the truest version of you.',
  0.82, 'ready'
FROM _mrk_ids WHERE key = 'noor';

-- ============================================================
-- 5. Soulmate profiles
-- ============================================================

INSERT INTO soulmate_profiles (user_id, display_name, age, gender, latitude, longitude, preferred_age_min, preferred_age_max, preferred_genders, active)
SELECT uid, name, age, gender, lat, lng, age_min, age_max, prefs, true
FROM _mrk_ids
JOIN (VALUES
  ('luna', 'Luna', 26, 'female', 37.7749, -122.4194, 23, 34, ARRAY['male','female','non_binary']),
  ('noor', 'Noor', 27, 'female', 37.7849, -122.4094, 23, 34, ARRAY['male','female','non_binary'])
) AS t(k, name, age, gender, lat, lng, age_min, age_max, prefs) ON _mrk_ids.key = t.k
ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name;

-- ============================================================
-- 6. Match: Luna + Noor (Screenshot 4)
--    Constraint: user_a_id < user_b_id (enforced by LEAST/GREATEST)
-- ============================================================

DELETE FROM matches
WHERE user_a_id IN (SELECT uid FROM _mrk_ids)
   OR user_b_id IN (SELECT uid FROM _mrk_ids);

-- reasoning_a = Luna's view (Luna is user_a when her UUID < Noor's UUID)
-- reasoning_b = Noor's view
INSERT INTO matches (
  user_a_id, user_b_id, a_soul_version, b_soul_version,
  result, score, reasoning, reasoning_a, reasoning_b,
  connection_zones
)
SELECT
  LEAST(l.uid, n.uid), GREATEST(l.uid, n.uid), 1, 1,
  'match', 0.91,
  -- shared reasoning (fallback)
  'You both deflect with humor before you let anyone close. She names the feeling you''ve been circling. You make her laugh right when the conversation gets heavy. You both need someone who earns trust slowly — and neither of you rushes it.',
  -- reasoning_a (for whichever user is user_a)
  CASE WHEN l.uid < n.uid
    THEN 'You both deflect with humor before you let anyone close. She names the feeling you''ve been circling. You make her laugh right when the conversation gets heavy. You both need someone who earns trust slowly — and neither of you rushes it.'
    ELSE 'You both deflect with humor before you let anyone close. She makes you laugh right when the conversation gets heavy. You name the feeling she''s been circling. You both need someone who earns trust slowly — and neither of you rushes it.'
  END,
  -- reasoning_b (for whichever user is user_b)
  CASE WHEN l.uid < n.uid
    THEN 'You both deflect with humor before you let anyone close. She makes you laugh right when the conversation gets heavy. You name the feeling she''s been circling. You both need someone who earns trust slowly — and neither of you rushes it.'
    ELSE 'You both deflect with humor before you let anyone close. She names the feeling you''ve been circling. You make her laugh right when the conversation gets heavy. You both need someone who earns trust slowly — and neither of you rushes it.'
  END,
  -- connection_zones (drives MatchVisualizationView line density)
  '[
    {"theme": "HUMOR AS ARMOR", "density": 0.88},
    {"theme": "SLOW TRUST", "density": 0.72},
    {"theme": "QUIET DEPTH", "density": 0.45}
  ]'::jsonb
FROM _mrk_ids l, _mrk_ids n WHERE l.key = 'luna' AND n.key = 'noor';

  -- ALT Screenshot 4 reasoning (shorter version):
  -- 'You both treat silence as intimacy, not awkwardness. She leads with questions,
  --  you lead with observations — together you actually finish the thought.'

-- ============================================================
-- 7. Match messages: Luna + Noor — Option A (Screenshot 5)
--    Timestamps: 10:33 PM – 10:36 PM
-- ============================================================

DELETE FROM match_messages
WHERE sender_id IN (SELECT uid FROM _mrk_ids)
   OR receiver_id IN (SELECT uid FROM _mrk_ids);

INSERT INTO match_messages (sender_id, receiver_id, content, created_at)
SELECT
  CASE WHEN sender = 'noor' THEN n.uid ELSE l.uid END,
  CASE WHEN sender = 'noor' THEN l.uid ELSE n.uid END,
  content, ts
FROM _mrk_ids l, _mrk_ids n, (VALUES
  ('noor', 'ok but why did you just describe my exact morning routine down to the standing in front of the fridge part',
   (CURRENT_DATE - 1) + interval '22 hours 33 minutes'),
  ('luna', 'because I do the same thing??? just standing there hoping something new appeared since last time',
   (CURRENT_DATE - 1) + interval '22 hours 34 minutes'),
  ('noor', 'STOP that''s literally it. like the fridge owes me something',
   (CURRENT_DATE - 1) + interval '22 hours 34 minutes 30 seconds'),
  ('luna', 'it does. we''ve been loyal customers',
   (CURRENT_DATE - 1) + interval '22 hours 35 minutes'),
  ('noor', 'i feel like you''ve been in my apartment watching me live my life',
   (CURRENT_DATE - 1) + interval '22 hours 36 minutes'),
  ('luna', 'that''s what happens when thumos is right about a match',
   (CURRENT_DATE - 1) + interval '22 hours 36 minutes 30 seconds')
) AS t(sender, content, ts) WHERE l.key = 'luna' AND n.key = 'noor';

  -- ALT Option B (quiet vulnerability):
  -- ('noor', 'I never tell people this but I still write letters I''ll never send. like to my younger self mostly',
  --  (CURRENT_DATE - 1) + interval '23 hours 2 minutes'),
  -- ('luna', 'wait that''s not weird that''s beautiful. what would you tell her',
  --  (CURRENT_DATE - 1) + interval '23 hours 3 minutes'),
  -- ('noor', 'honestly? that the people who leave aren''t taking pieces of you with them. you''re still whole',
  --  (CURRENT_DATE - 1) + interval '23 hours 5 minutes'),
  -- ('luna', 'ok I need a minute with that one',
  --  (CURRENT_DATE - 1) + interval '23 hours 5 minutes 30 seconds'),
  -- ('noor', 'lol sorry',
  --  (CURRENT_DATE - 1) + interval '23 hours 6 minutes'),
  -- ('luna', 'no don''t be sorry. I think I needed to hear that too',
  --  (CURRENT_DATE - 1) + interval '23 hours 6 minutes 30 seconds')

  -- ALT Option C (playful with a turn):
  -- ('noor', 'what''s your controversial food opinion',
  --  (CURRENT_DATE - 1) + interval '21 hours 48 minutes'),
  -- ('luna', 'cereal is a soup',
  --  (CURRENT_DATE - 1) + interval '21 hours 48 minutes 30 seconds'),
  -- ('noor', 'blocked and reported',
  --  (CURRENT_DATE - 1) + interval '21 hours 49 minutes'),
  -- ('luna', 'milk is the broth. cereal is the croutons. bowl is the bowl. it''s soup',
  --  (CURRENT_DATE - 1) + interval '21 hours 49 minutes 30 seconds'),
  -- ('noor', 'i hate that this makes sense',
  --  (CURRENT_DATE - 1) + interval '21 hours 50 minutes'),
  -- ('noor', 'wait actually can we talk about why you eat cereal at midnight though because same',
  --  (CURRENT_DATE - 1) + interval '21 hours 51 minutes'),
  -- ('luna', 'it''s the only time cereal feels right and i will not be questioned on this',
  --  (CURRENT_DATE - 1) + interval '21 hours 51 minutes 30 seconds')

-- ============================================================
-- Cleanup
-- ============================================================

DROP TABLE IF EXISTS _mrk_ids;

COMMIT;
