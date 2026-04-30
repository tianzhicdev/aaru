-- Seed script: 10 diverse users for simulated matching testing
-- Run against dev Neon: psql $DATABASE_URL < scripts/seed-simulated-matching.sql

BEGIN;

-- Clean up any previous seed data (reverse dependency order)
DELETE FROM match_messages WHERE sender_id IN (SELECT id FROM users WHERE device_id LIKE 'seed-sim-%');
DELETE FROM matches WHERE user_a_id IN (SELECT id FROM users WHERE device_id LIKE 'seed-sim-%') OR user_b_id IN (SELECT id FROM users WHERE device_id LIKE 'seed-sim-%');
DELETE FROM soulmate_profiles WHERE user_id IN (SELECT id FROM users WHERE device_id LIKE 'seed-sim-%');
DELETE FROM visible_soul_files WHERE user_id IN (SELECT id FROM users WHERE device_id LIKE 'seed-sim-%');
DELETE FROM hidden_soul_files WHERE user_id IN (SELECT id FROM users WHERE device_id LIKE 'seed-sim-%');
DELETE FROM soul_messages WHERE user_id IN (SELECT id FROM users WHERE device_id LIKE 'seed-sim-%');
DELETE FROM device_sessions WHERE user_id IN (SELECT id FROM users WHERE device_id LIKE 'seed-sim-%');
DELETE FROM reflection_snapshots WHERE user_id IN (SELECT id FROM users WHERE device_id LIKE 'seed-sim-%');
DELETE FROM claude_debug_traces WHERE user_id IN (SELECT id FROM users WHERE device_id LIKE 'seed-sim-%');
DELETE FROM users WHERE device_id LIKE 'seed-sim-%';

-- ── 10 Users ────────────────────────────────────────────────

INSERT INTO users (id, device_id, language) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'seed-sim-luna', 'en'),
  ('a0000001-0000-0000-0000-000000000002', 'seed-sim-kai', 'en'),
  ('a0000001-0000-0000-0000-000000000003', 'seed-sim-maya', 'en'),
  ('a0000001-0000-0000-0000-000000000004', 'seed-sim-ravi', 'en'),
  ('a0000001-0000-0000-0000-000000000005', 'seed-sim-celeste', 'en'),
  ('a0000001-0000-0000-0000-000000000006', 'seed-sim-dex', 'en'),
  ('a0000001-0000-0000-0000-000000000007', 'seed-sim-priya', 'en'),
  ('a0000001-0000-0000-0000-000000000008', 'seed-sim-soren', 'en'),
  ('a0000001-0000-0000-0000-000000000009', 'seed-sim-jade', 'en'),
  ('a0000001-0000-0000-0000-000000000010', 'seed-sim-nina', 'en');

-- Sessions not needed for matching pipeline (pipeline queries soulmate_profiles directly)

-- ── Generate 60 messages per user (30 user + 30 assistant) ──

CREATE OR REPLACE FUNCTION seed_sim_messages(p_user_id uuid) RETURNS void AS $$
DECLARE
  user_msgs text[] := ARRAY[
    'I think what I love most is when someone really listens, you know?',
    'My morning routine is sacred to me — coffee, journal, quiet.',
    'I tend to overthink things, especially in relationships.',
    'My love language is definitely quality time, no question.',
    'Conflict terrifies me honestly. I''d rather talk it through slowly.',
    'I dream about building something meaningful with someone.',
    'When I''m stressed I need space first, then I can talk.',
    'I value honesty above almost everything else.',
    'My friends say I''m the one who always remembers the little things.',
    'I think vulnerability is the bravest thing a person can do.',
    'Travel changed me. Living abroad taught me who I really am.',
    'I''m learning to set boundaries — it''s still hard sometimes.',
    'My ideal weekend? Farmer''s market, cooking together, long walk.',
    'I believe relationships should make both people better, not smaller.',
    'Music is how I process emotions. Always has been.',
    'I think the hardest thing in love is not knowing if you''re enough.',
    'My relationship with my parents shaped everything about how I love.',
    'I need someone who can sit with silence and not fill it.',
    'When I care about someone, I notice the tiny shifts in their mood.',
    'I used to think independence meant not needing anyone.',
    'The best conversations I''ve had lasted until 3am without noticing.',
    'I''m drawn to people who have a quiet strength about them.',
    'Forgiveness is something I''m still figuring out.',
    'I think home is a feeling, not a place.',
    'My therapist says I''m a recovering people-pleaser. She''s right.',
    'I want someone who chooses me every day, not just once.',
    'I''ve learned that being alone and being lonely are very different.',
    'Nature is where I go when the world gets too loud.',
    'I believe every person deserves to feel truly seen.',
    'The older I get, the more I realize kindness is the most attractive thing.'
  ];
  asst_msgs text[] := ARRAY[
    'That resonance with deep listening tells me a lot about you.',
    'Your morning ritual sounds grounding. What does the journaling look like?',
    'The overthinking — does it show up more in new relationships?',
    'Quality time as your primary language makes sense given what you shared.',
    'That desire to talk things through slowly — that is self-aware.',
    'When you say meaningful, what does that look like?',
    'Needing space before you can connect after stress — that is real.',
    'Honesty as a north star value. Has that ever cost you?',
    'Remembering the little things — that is such a gift.',
    'Vulnerability as bravery. Beautiful worldview.',
    'Living abroad as a crucible for identity — which version came back?',
    'Boundaries are a practice, not a destination.',
    'That ideal weekend paints a vivid picture of partnership.',
    'Making each other better, not smaller — powerful filter.',
    'Music as emotional processing — what genre finds you?',
    'That fear of not being enough — where does it live in your body?',
    'Family patterns in love — have you started rewriting any of them?',
    'Comfortable silence as a love language. That says so much.',
    'Reading someone''s micro-shifts — that is deep attunement.',
    'Independence as armor vs. independence as choice — which was it?',
    'Those 3am conversations — what makes them different from daytime ones?',
    'Quiet strength. Can you describe what that looks like to you?',
    'Forgiveness as a practice — who are you trying to forgive?',
    'Home as a feeling. Have you ever found it in another person?',
    'Recovering people-pleaser. What did the old version of you look like?',
    'Choosing every day — what does that look like in practice?',
    'Alone vs. lonely — when did you learn the difference?',
    'Nature as sanctuary. Which landscape speaks to you most?',
    'Being truly seen — have you experienced that before?',
    'Kindness as attraction. That is a sign of real maturity.'
  ];
  i int;
BEGIN
  FOR i IN 1..30 LOOP
    INSERT INTO soul_messages (user_id, role, content, created_at)
    VALUES (
      p_user_id, 'user', user_msgs[i],
      now() - interval '30 days' + (i * interval '1 hour')
    );
    INSERT INTO soul_messages (user_id, role, content, created_at)
    VALUES (
      p_user_id, 'assistant', asst_msgs[i],
      now() - interval '30 days' + (i * interval '1 hour') + interval '30 seconds'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT seed_sim_messages('a0000001-0000-0000-0000-000000000001');
SELECT seed_sim_messages('a0000001-0000-0000-0000-000000000002');
SELECT seed_sim_messages('a0000001-0000-0000-0000-000000000003');
SELECT seed_sim_messages('a0000001-0000-0000-0000-000000000004');
SELECT seed_sim_messages('a0000001-0000-0000-0000-000000000005');
SELECT seed_sim_messages('a0000001-0000-0000-0000-000000000006');
SELECT seed_sim_messages('a0000001-0000-0000-0000-000000000007');
SELECT seed_sim_messages('a0000001-0000-0000-0000-000000000008');
SELECT seed_sim_messages('a0000001-0000-0000-0000-000000000009');
SELECT seed_sim_messages('a0000001-0000-0000-0000-000000000010');

DROP FUNCTION seed_sim_messages;

-- ── Visible Soul Files (individual columns, 80%+ completeness) ──

-- Luna (Artist)
INSERT INTO visible_soul_files (
  user_id, version, status, completeness, portrait,
  how_you_light_up, how_you_show_up, how_you_love,
  how_you_weather_storms, what_youre_looking_for, your_growing_edges, your_warmth,
  crystallized_moments, open_threads, compass_scores,
  personality_spectrum, top_values, relational_style, attachment_style, love_signature
) VALUES (
  'a0000001-0000-0000-0000-000000000001', 1, 'ready', 0.85,
  'A luminous artist who sees beauty in broken things and finds words where others find silence.',
  'Through spontaneous creative bursts — painting at 2am, dancing in the kitchen, finding poetry in grocery lists.',
  'With full presence and fierce attention. When Luna is with you, she is WITH you.',
  'Through acts of creation — painting someone, writing them into a story, making their ordinary moments feel mythic.',
  'Retreats into art first, then emerges ready to talk. Needs space to process before she can articulate.',
  'Someone who finds her intensity beautiful, not overwhelming. Who can hold space for big feelings.',
  'Learning that not every silence is rejection. Working on asking for what she needs directly.',
  'Makes everyone feel like the most interesting person in the room. Remembers the small things that matter.',
  '[{"quote":"The night she painted through a thunderstorm and felt completely alive","reflection":"Art as survival"}]'::jsonb,
  '["How creativity and partnership coexist"]'::jsonb,
  '{"openness":92,"playfulness":85,"warmth":78,"emotional_depth":95,"devotion":70,"resilience":65,"independence":80,"passion":90}'::jsonb,
  '{"openness":{"position":92,"label":"Highly open","evidence":"Creative and exploratory"},"conscientiousness":{"position":45,"label":"Flexible","evidence":"Goes with the flow"},"extraversion":{"position":60,"label":"Ambivert","evidence":"Balanced social energy"},"agreeableness":{"position":75,"label":"Warm","evidence":"Empathetic and kind"},"emotionalSensitivity":{"position":88,"label":"Deeply feeling","evidence":"Strong emotional awareness"}}'::jsonb,
  '[{"value":"authenticity","description":"Being true to self"},{"value":"beauty","description":"Finding beauty in everything"},{"value":"connection","description":"Deep human bonds"}]'::jsonb,
  'Intense and devoted, needs creative space',
  'Anxious-secure',
  'The one who turns your ordinary into art'
);

-- Kai (Engineer)
INSERT INTO visible_soul_files (
  user_id, version, status, completeness, portrait,
  how_you_light_up, how_you_show_up, how_you_love,
  how_you_weather_storms, what_youre_looking_for, your_growing_edges, your_warmth,
  crystallized_moments, open_threads, compass_scores,
  personality_spectrum, top_values, relational_style, attachment_style, love_signature
) VALUES (
  'a0000001-0000-0000-0000-000000000002', 1, 'ready', 0.88,
  'A thoughtful engineer who builds bridges — in code and in conversation. Steady as bedrock, surprisingly funny.',
  'Through solving puzzles — system architecture or figuring out the perfect campsite.',
  'Reliable and calm. The person who remembers to charge the emergency flashlight and also asks how you really are.',
  'Through consistency and presence. Shows up every day. Remembers every preference. Builds a life that fits you both.',
  'Gets quiet, processes internally, then comes back with a clear head and a plan. Never raises his voice.',
  'Someone who matches his depth but brings spontaneity. Who can pull him out of his head and into the moment.',
  'Opening up faster. Learning that vulnerability is not inefficiency.',
  'The kind of warmth that is not loud but always there — like a pilot light.',
  '[{"quote":"Building a telescope with his nephew and watching his face when Saturn appeared","reflection":"Wonder shared is wonder doubled"}]'::jsonb,
  '["How to balance structure with spontaneity in love"]'::jsonb,
  '{"openness":70,"playfulness":55,"warmth":75,"emotional_depth":80,"devotion":95,"resilience":90,"independence":75,"passion":65}'::jsonb,
  '{"openness":{"position":70,"label":"Open","evidence":"Curious mind"},"conscientiousness":{"position":90,"label":"Very organized","evidence":"Structured approach"},"extraversion":{"position":35,"label":"Introvert","evidence":"Prefers depth over breadth"},"agreeableness":{"position":80,"label":"Kind","evidence":"Generous spirit"},"emotionalSensitivity":{"position":60,"label":"Balanced","evidence":"Even-keeled"}}'::jsonb,
  '[{"value":"reliability","description":"Being dependable"},{"value":"growth","description":"Continuous improvement"},{"value":"integrity","description":"Moral wholeness"}]'::jsonb,
  'Steady and devoted, slow to open but deeply loyal',
  'Secure',
  'The one who builds a world that fits you both'
);

-- Remaining 8 users: generic but complete profiles
INSERT INTO visible_soul_files (
  user_id, version, status, completeness, portrait,
  how_you_light_up, how_you_show_up, how_you_love,
  how_you_weather_storms, what_youre_looking_for, your_growing_edges, your_warmth,
  crystallized_moments, open_threads, compass_scores,
  personality_spectrum, top_values, relational_style, attachment_style, love_signature
)
SELECT
  u.id, 1, 'ready', 0.82,
  'A thoughtful person with depth and warmth who values genuine connection.',
  'Through genuine connection and shared discovery.',
  'With full presence and real attention.',
  'Through attention, care, and showing up consistently.',
  'With patience, honesty, and a willingness to sit with discomfort.',
  'Deep, authentic partnership built on mutual respect.',
  'Learning to be more vulnerable and ask for what they need.',
  'Quiet but steady warmth that makes people feel safe.',
  '[{"quote":"A moment of true connection that changed everything","reflection":"Connection as transformation"}]'::jsonb,
  '["Finding deeper intimacy and trust"]'::jsonb,
  '{"openness":75,"playfulness":70,"warmth":80,"emotional_depth":78,"devotion":82,"resilience":75,"independence":70,"passion":72}'::jsonb,
  '{"openness":{"position":75,"label":"Open","evidence":"Curious and receptive"},"conscientiousness":{"position":70,"label":"Organized","evidence":"Reliable and steady"},"extraversion":{"position":55,"label":"Ambivert","evidence":"Balanced"},"agreeableness":{"position":78,"label":"Warm","evidence":"Caring nature"},"emotionalSensitivity":{"position":72,"label":"Sensitive","evidence":"Emotionally attuned"}}'::jsonb,
  '[{"value":"honesty","description":"Truth in all things"},{"value":"growth","description":"Always evolving"},{"value":"kindness","description":"Compassion first"}]'::jsonb,
  'Warm and present',
  'Secure',
  'The one who truly sees you'
FROM users u
WHERE u.device_id LIKE 'seed-sim-%'
  AND u.id NOT IN ('a0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000002');

-- ── Hidden Soul Files ───────────────────────────────────────

INSERT INTO hidden_soul_files (
  user_id, version, status, confidence,
  expert_reflections, core_drivers, core_values, voice,
  depth_map, analyst_notes, honest_insights,
  attachment_assessment, conflict_profile
)
SELECT
  u.id, 1, 'ready', 'medium',
  '{"psychologist":["Shows secure attachment patterns"],"relationshipScientist":["Values consistency and depth"],"linguist":["Natural communicator"],"attachmentAnalyst":["Earned secure"]}'::jsonb,
  '[{"driver":"connection","strength":0.85,"inferred":true,"evidence":"Seeks deep bonds"},{"driver":"growth","strength":0.78,"inferred":true,"evidence":"Values personal development"}]'::jsonb,
  '["honesty","growth","kindness"]'::jsonb,
  '{"register":"casual","density":"moderate","humorStyle":"warm wit","conflictStyle":"collaborative","disclosureRate":"gradual","signaturePatterns":["uses metaphors","asks reflective questions"],"voiceExamples":[]}'::jsonb,
  '{"domainCoverage":[]}'::jsonb,
  '["Genuine and self-aware"]'::jsonb,
  '["Still learning to ask for needs directly"]'::jsonb,
  'Secure with some anxious tendencies under stress',
  'Collaborative, prefers talking through issues calmly'
FROM users u WHERE u.device_id LIKE 'seed-sim-%';

-- ── Soulmate Profiles ───────────────────────────────────────

INSERT INTO soulmate_profiles (user_id, display_name, age, gender, latitude, longitude, preferred_age_min, preferred_age_max, preferred_genders, active, bio) VALUES
('a0000001-0000-0000-0000-000000000001', 'Luna', 27, 'female', 37.7749, -122.4194, 25, 35, ARRAY['male', 'non_binary'], true, 'Artist. Paints feelings, dances through life.'),
('a0000001-0000-0000-0000-000000000002', 'Kai', 29, 'male', 37.7849, -122.4094, 24, 34, ARRAY['female', 'non_binary'], true, 'Engineer who builds bridges in code and conversation.'),
('a0000001-0000-0000-0000-000000000003', 'Maya', 31, 'female', 37.7649, -122.4294, 27, 37, ARRAY['male'], true, 'Teacher. Believes every person has a story worth hearing.'),
('a0000001-0000-0000-0000-000000000004', 'Ravi', 28, 'male', 37.7549, -122.4394, 24, 34, ARRAY['female', 'non_binary'], true, 'Chef. Love is the best ingredient.'),
('a0000001-0000-0000-0000-000000000005', 'Celeste', 26, 'female', 37.7949, -122.3994, 24, 33, ARRAY['male', 'non_binary'], true, 'Writer chasing the perfect sentence.'),
('a0000001-0000-0000-0000-000000000006', 'Dex', 30, 'male', 37.7449, -122.4494, 25, 36, ARRAY['female'], true, 'Musician. Writes songs about strangers on the train.'),
('a0000001-0000-0000-0000-000000000007', 'Priya', 33, 'female', 37.7349, -122.4594, 28, 38, ARRAY['male'], true, 'Doctor. Heals bodies, seeks someone who heals souls.'),
('a0000001-0000-0000-0000-000000000008', 'Soren', 25, 'male', 37.8049, -122.3894, 22, 32, ARRAY['female', 'non_binary'], true, 'Photographer. Sees the world in light and shadow.'),
('a0000001-0000-0000-0000-000000000009', 'Jade', 24, 'non_binary', 37.7149, -122.4694, 22, 32, ARRAY['male', 'female', 'non_binary'], true, 'Grad student. Studying what makes people tick.'),
('a0000001-0000-0000-0000-000000000010', 'Nina', 35, 'female', 37.7249, -122.4794, 30, 40, ARRAY['male'], true, 'Social worker. Believes in the goodness of people.');

-- ── Verify ──────────────────────────────────────────────────
SELECT
  sp.display_name,
  sp.age,
  sp.gender,
  (SELECT COUNT(*) FROM soul_messages WHERE user_id = u.id AND role = 'user') AS user_msgs,
  vsf.completeness,
  CASE WHEN hsf.user_id IS NOT NULL THEN 'yes' ELSE 'no' END AS has_hidden
FROM users u
JOIN soulmate_profiles sp ON sp.user_id = u.id
LEFT JOIN visible_soul_files vsf ON vsf.user_id = u.id AND vsf.status = 'ready'
LEFT JOIN hidden_soul_files hsf ON hsf.user_id = u.id AND hsf.status = 'ready'
WHERE u.device_id LIKE 'seed-sim-%'
ORDER BY sp.display_name;

COMMIT;
