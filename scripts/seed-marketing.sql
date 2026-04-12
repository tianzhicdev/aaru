-- Marketing screenshot seed data
-- Run: psql $DATABASE_URL -f scripts/seed-marketing.sql
-- Safe to re-run (deletes + re-inserts for clean state)

BEGIN;

-- ============================================================
-- 1. Users
-- ============================================================

INSERT INTO users (id, device_id, display_name, model_profile_id, language, last_active_at)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'mrk',         'Sophie',  'value_default', 'en', now()),
  ('a0000000-0000-0000-0000-000000000002', 'mrk-match',   'James',   'value_default', 'en', now()),
  ('a0000000-0000-0000-0000-000000000003', 'mrk-match-2', 'Kai',     'value_default', 'en', now()),
  ('a0000000-0000-0000-0000-000000000004', 'mrk-match-3', 'Priya',   'value_default', 'en', now()),
  ('a0000000-0000-0000-0000-000000000005', 'mrk-match-4', 'Mateo',   'value_default', 'en', now())
ON CONFLICT (device_id) DO NOTHING;

-- Resolve actual user IDs (may already exist from a prior run)
DO $$
DECLARE
  v_sophie uuid; v_james uuid; v_kai uuid; v_priya uuid; v_mateo uuid;
BEGIN
  SELECT id INTO v_sophie FROM users WHERE device_id = 'mrk';
  SELECT id INTO v_james  FROM users WHERE device_id = 'mrk-match';
  SELECT id INTO v_kai    FROM users WHERE device_id = 'mrk-match-2';
  SELECT id INTO v_priya  FROM users WHERE device_id = 'mrk-match-3';
  SELECT id INTO v_mateo  FROM users WHERE device_id = 'mrk-match-4';

  CREATE TEMP TABLE IF NOT EXISTS _mrk_ids (key text PRIMARY KEY, uid uuid);
  INSERT INTO _mrk_ids VALUES
    ('sophie', v_sophie), ('james', v_james), ('kai', v_kai),
    ('priya', v_priya), ('mateo', v_mateo)
  ON CONFLICT (key) DO UPDATE SET uid = EXCLUDED.uid;
END $$;

-- ============================================================
-- 2. Soul messages for Sophie (~30 messages, gen z voice)
-- ============================================================

DELETE FROM soul_messages WHERE user_id = (SELECT uid FROM _mrk_ids WHERE key = 'sophie');

INSERT INTO soul_messages (user_id, role, content, created_at)
SELECT uid, role, content, ts
FROM _mrk_ids, (VALUES
  ('assistant', 'Hey! I''m really glad you''re here. What''s something that made you smile recently — even something tiny?',
   now() - interval '7 days'),

  ('user', 'okay this is embarrassing but my neighbor''s cat finally sat on my lap yesterday?? he''s been giving me the cold shoulder for MONTHS so it genuinely felt like winning an oscar',
   now() - interval '7 days' + interval '2 minutes'),

  ('assistant', 'A months-long campaign to earn a cat''s respect — I love the dedication! What is it about that moment that hit so hard?',
   now() - interval '7 days' + interval '4 minutes'),

  ('user', 'i think because cats don''t fake it?? like a cat will literally ignore you forever if it''s not feeling you. so when it finally chooses you it''s the most honest thing. i lowkey wish all relationships had that energy',
   now() - interval '7 days' + interval '7 minutes'),

  ('assistant', 'Earned authenticity — that''s a powerful standard to hold. Has that always mattered this much to you, or is it something you grew into?',
   now() - interval '7 days' + interval '9 minutes'),

  ('user', 'grew into for sure. i come from this big loud family where everyone''s always kinda performing? like sunday dinners were a whole production. i was always the quiet one in the corner wanting someone to just. be real with me.',
   now() - interval '7 days' + interval '12 minutes'),

  ('assistant', 'The quiet observer in a loud room. I can picture that so clearly. What does your world look like these days?',
   now() - interval '6 days'),

  ('user', 'i''m a children''s book illustrator which is the most me job ever lol. my days are very cottagecore — watercolors, oat milk lattes, true crime podcasts. but every friday me and my best friend mia go to this tiny wine bar and just TALK for like four hours straight',
   now() - interval '6 days' + interval '3 minutes'),

  ('assistant', 'I love that Friday ritual with Mia. What kind of stuff do you two end up getting into?',
   now() - interval '6 days' + interval '5 minutes'),

  ('user', 'literally everything. last week we debated for two hours whether it''s braver to stay in a relationship that''s comfortable but mid, or to leave and risk being alone. we never agree and honestly that''s the best part',
   now() - interval '6 days' + interval '8 minutes'),

  ('assistant', 'What a question though. Where did you land?',
   now() - interval '5 days'),

  ('user', 'i used to be team "stay and make it work no matter what" but after my last relationship i realized sometimes leaving IS the brave thing. we were so comfortable we literally stopped growing. like we were just... roommates who kissed sometimes',
   now() - interval '5 days' + interval '2 minutes'),

  ('assistant', 'That takes real honesty to name. What did figuring yourself out look like after that?',
   now() - interval '5 days' + interval '4 minutes'),

  ('user', 'messy lol. got my own place for the first time, started painting for ME again not just for work, adopted a sourdough starter (yes i know), cried to phoebe bridgers a normal amount. but also?? i started figuring out what i actually WANT instead of just what i''ll tolerate',
   now() - interval '5 days' + interval '7 minutes'),

  ('assistant', 'That shift from "what I''ll tolerate" to "what I actually want" — that''s everything. So what did you figure out?',
   now() - interval '5 days' + interval '9 minutes'),

  ('user', 'someone who''s genuinely curious. not just about me but about EVERYTHING. i want 2am conversations that go somewhere weird. i want someone who''ll drag me to a museum about like... the history of buttons or something and be unironically excited about it',
   now() - interval '4 days'),

  ('assistant', 'You want someone who makes the world feel bigger, not smaller. That''s beautifully specific. Is it easy for you to open up to new people?',
   now() - interval '4 days' + interval '2 minutes'),

  ('user', 'haha no. i''m warm on the surface but i keep the real stuff locked down until i feel safe. my ex used to say i was like an onion — lots of layers and occasionally makes you cry 😂',
   now() - interval '4 days' + interval '5 minutes'),

  ('assistant', 'Okay that''s actually a great metaphor though! What does feeling safe enough to peel back those layers look like for you?',
   now() - interval '3 days'),

  ('user', 'consistency. like when someone remembers the random stuff — not grand gestures but like they bring you tea when you''re stressed without you having to ask. and they don''t get weird when you''re not at your best. that''s when i''m like okay. okay i can do this.',
   now() - interval '3 days' + interval '3 minutes'),

  ('assistant', 'Being seen in the mundane moments, not just the highlight reel. That connects right back to the cat thing — something that shows up genuinely, not because it was bribed with treats.',
   now() - interval '3 days' + interval '5 minutes'),

  ('user', 'WAIT. you just connected my cat story to my entire love language and i feel extremely called out rn. but yes. exactly that. exactly.',
   now() - interval '3 days' + interval '7 minutes'),

  ('assistant', 'I''m here for the loving call-outs! When things get tense in a relationship, what''s your style? Talk it out immediately, or do you need to process first?',
   now() - interval '2 days'),

  ('user', 'process first 100%. if i try to talk when i''m upset i either completely shut down or say something unhinged that i don''t mean. give me like an hour and then i''m ready to actually have the conversation. learned that one the hard way lol',
   now() - interval '2 days' + interval '2 minutes'),

  ('assistant', 'Knowing your own processing style and being able to name it clearly — that''s genuinely rare. What does a good resolution look like for you?',
   now() - interval '2 days' + interval '4 minutes'),

  ('user', 'i want to understand what the other person is actually FEELING not just what they''re saying. and i want that back. the worst thing is when someone just agrees to end the fight. like no!! i''d rather it take three hours and be real than five minutes and be fake',
   now() - interval '2 days' + interval '7 minutes'),

  ('assistant', 'Real resolution over fake peace. That tracks with everything about you. When you picture your life a few years from now — the version where things went really, really well — what does it look like?',
   now() - interval '1 day'),

  ('user', 'okay don''t judge me but. bright apartment, plants literally everywhere. someone who leaves little notes in my sketchbook. we cook together on sundays and argue about what to watch. a dog named after a literary character. more bookshelves than wall space. and i''m illustrating my OWN stories, not just other people''s.',
   now() - interval '1 day' + interval '3 minutes'),

  ('assistant', 'Notes in sketchbooks and Sunday cooking and a literary dog and your own stories — Sophie, that''s so vivid and specific. It tells me you already know what home feels like, even before you''ve built it. That''s rare and really beautiful.',
   now() - interval '1 day' + interval '5 minutes'),

  ('user', 'okay you''re gonna make me cry 🥲 no one has ever reflected that back to me before. thank you for that honestly',
   now() - interval '1 day' + interval '7 minutes')

) AS t(role, content, ts)
WHERE _mrk_ids.key = 'sophie';

-- ============================================================
-- 3. Visible soul file for Sophie
-- ============================================================

DELETE FROM visible_soul_files WHERE user_id = (SELECT uid FROM _mrk_ids WHERE key = 'sophie');

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
  'Sophie is a quiet force — a children''s book illustrator who paints tiny worlds by day and craves deep, no-bullshit connection in everything she does. Warm and sharp in equal measure, she carries the patience of someone who knows the best things are earned, not given. She leads with curiosity, holds space with disarming honesty, and loves with a specificity that makes the people around her feel genuinely known.',

  'You come alive in the small, vivid details — a cat finally trusting you, the perfect shade of watercolor, a Friday night conversation that goes completely sideways. Your curiosity isn''t performative; it''s the engine that runs everything. You light up when someone matches that energy, when a conversation lands somewhere neither of you expected.',

  'Warm on the surface, carefully layered underneath. You bring genuine kindness to every interaction but reserve your full self for people who''ve earned it through consistency. In groups, you''re the quiet one who notices what everyone else misses. One-on-one, you''re funny, disarmingly honest, and way more intense than people expect.',

  'You love through attention to what others overlook — remembering someone''s order, noticing when they''re off before they say it. Your love language lives in quiet, consistent gestures: notes left in sketchbooks, meals cooked on Sunday, tea brought without asking. You want love that''s earned and real, not performed.',

  'You need space to process before you can engage — not to avoid, but to show up honestly. You''ve learned this about yourself the hard way and you name it clearly now. When you''re ready, you want genuine understanding over quick resolution. You''d rather a hard conversation take three hours than settle for fake peace.',

  'Someone who makes the world feel bigger. A partner with relentless curiosity who''ll drag you to a museum about the history of buttons and be unironically excited. You want 2am conversations that go somewhere weird, and someone whose consistency proves their care — not through grand gestures, but through showing up when it''s boring.',

  'You''re still learning to let people in before they''ve fully "proven" themselves — your walls are protective but sometimes they screen out people who are genuine but just move at a different pace. You''re also on the journey from illustrating other people''s stories to telling your own.',

  'There''s a warmth in how you move through the world that puts people at ease before they realize it. You have a gift for making others feel seen — Mia, the neighbor''s cat, someday a partner who finds notes in their pocket. Your warmth isn''t loud, but it''s unmistakable.',

  '[
    {"quote": "a cat doesn''t fake it. when it finally chooses you it''s the most honest thing. i wish all relationships had that energy", "reflection": "Her deepest values surfaced in the simplest metaphor — authenticity isn''t something she hopes for, it''s a requirement."},
    {"quote": "i started figuring out what i actually WANT instead of just what i''ll tolerate", "reflection": "The moment she stopped settling marked a quiet revolution — one sentence that changed the whole trajectory."},
    {"quote": "bright apartment, plants everywhere. someone who leaves little notes in my sketchbook. a dog named after a literary character.", "reflection": "Her vision of love is specific and lived-in — not a fantasy but a home she can already feel the shape of."}
  ]'::jsonb,

  '["The transition from illustrating others'' stories to writing her own", "How her big loud family shaped her need for quiet authenticity", "What the sourdough era taught her about patience with herself"]'::jsonb,

  '{"openness": 82, "playfulness": 75, "warmth": 91, "emotional_depth": 87, "devotion": 78, "resilience": 72, "independence": 74, "passion": 76}'::jsonb,

  '{
    "openness": {"position": 84, "label": "Imaginative Explorer", "evidence": "Creates worlds through illustration and actively seeks conversations that go somewhere unexpected"},
    "conscientiousness": {"position": 58, "label": "Flexible Ritualist", "evidence": "Maintains sacred rituals like Friday wine bar but stays open to chaos"},
    "extraversion": {"position": 38, "label": "Selective Connector", "evidence": "Quiet in groups but comes alive with the right person — then good luck shutting her up"},
    "agreeableness": {"position": 82, "label": "Warm but Direct", "evidence": "Leads with kindness but will call you out lovingly if needed"},
    "emotionalSensitivity": {"position": 79, "label": "Deeply Attuned", "evidence": "Reads emotional undercurrents others miss entirely and processes them with real intention"}
  }'::jsonb,

  '[
    {"value": "Authenticity", "description": "She''d rather wait for something real than settle for something that only looks right from the outside."},
    {"value": "Curiosity", "description": "The spark that drives her art, her friendships, and her vision of love — she wants a life that keeps surprising her."},
    {"value": "Quiet Devotion", "description": "Love expressed in tea brought without asking, notes left in sketchbooks, and showing up when it''s mundane."}
  ]'::jsonb,

  'Slow-building and deeply loyal. Sophie connects through shared curiosity and consistent presence, creating bonds that deepen over time rather than burning fast.',

  'Secure-leaning with a thoughtful pace — she takes time to trust but loves fully once she does. Post-breakup growth gave her a clear sense of her own needs.',

  'The Quiet Noticing — Sophie loves by paying attention to what others overlook, creating a feeling of being truly known in the everyday moments.',

  0.88,
  'ready'
FROM _mrk_ids WHERE key = 'sophie';

-- ============================================================
-- 4. Visible soul files for match partners
-- ============================================================

-- Clean up all match partner soul files
DELETE FROM visible_soul_files WHERE user_id IN (SELECT uid FROM _mrk_ids WHERE key IN ('james', 'kai', 'priya', 'mateo'));

-- James (architect, steady and warm)
INSERT INTO visible_soul_files (
  user_id, version, portrait, how_you_light_up, how_you_show_up, how_you_love, what_youre_looking_for,
  compass_scores, personality_spectrum, top_values,
  relational_style, attachment_style, love_signature, completeness, status
)
SELECT uid, 1,
  'James is a thoughtful architect who finds beauty in how things fit together — buildings, ideas, people. Calm confidence, deep curiosity, the kind of person who makes everyone around him feel a little more grounded.',
  'You light up when you find the hidden logic in something — a building''s structural poetry, a friend''s unspoken need, a conversation that reveals something true.',
  'Steady, warm, and quietly confident. The person people lean on without being asked.',
  'You love through presence and problem-solving — fixes the leaky faucet before it''s mentioned, stays up late to talk through what''s really wrong.',
  'Someone creative who sees the world differently. A partner who pulls you out of your analytical head and into your heart.',
  '{"openness": 75, "playfulness": 64, "warmth": 83, "emotional_depth": 79, "devotion": 85, "resilience": 81, "independence": 70, "passion": 72}'::jsonb,
  '{"openness": {"position": 73, "label": "Curious Thinker", "evidence": "Drawn to how things work"}, "conscientiousness": {"position": 82, "label": "Dedicated Builder", "evidence": "Approaches everything with intention"}, "extraversion": {"position": 52, "label": "Balanced Connector", "evidence": "Comfortable socially, recharges quietly"}, "agreeableness": {"position": 76, "label": "Steady Supporter", "evidence": "Reliable and considerate"}, "emotionalSensitivity": {"position": 68, "label": "Quietly Perceptive", "evidence": "Notices undercurrents, processes internally"}}'::jsonb,
  '[{"value": "Integrity", "description": "Builds things meant to last."}, {"value": "Curiosity", "description": "Learning together is his love language."}, {"value": "Steadfastness", "description": "Shows up especially when things get hard."}]'::jsonb,
  'Patient and intentional. Builds trust through actions, not words.',
  'Secure and grounded — creates safety naturally.',
  'The Steady Architect — loves by building a life around someone, piece by piece.',
  0.75, 'ready'
FROM _mrk_ids WHERE key = 'james';

-- Kai (musician/producer, chaotic creative energy)
INSERT INTO visible_soul_files (
  user_id, version, portrait, how_you_light_up, how_you_show_up, how_you_love, what_youre_looking_for,
  compass_scores, personality_spectrum, top_values,
  relational_style, attachment_style, love_signature, completeness, status
)
SELECT uid, 1,
  'Kai is all restless creative energy wrapped in unexpected tenderness. A music producer who thinks in syncopation and speaks in tangents, but drops everything to really listen when it matters.',
  'You light up at 3am when a beat finally clicks, in bookstores you weren''t planning to enter, in conversations that take seven unexpected turns.',
  'Chaotic on the surface, deeply attentive underneath. People think you''re scattered until they realize you remember everything they''ve ever told you.',
  'You love through spontaneity and attention — the partner who writes a song about something you said in passing, who plans adventures on a Tuesday because why wait for the weekend.',
  'Someone grounded enough to be your anchor but curious enough to get pulled into the current with you.',
  '{"openness": 94, "playfulness": 88, "warmth": 76, "emotional_depth": 82, "devotion": 71, "resilience": 65, "independence": 86, "passion": 92}'::jsonb,
  '{"openness": {"position": 95, "label": "Perpetual Explorer", "evidence": "Follows every creative rabbit hole"}, "conscientiousness": {"position": 32, "label": "Beautiful Chaos", "evidence": "Thrives in disorder, loses his keys daily"}, "extraversion": {"position": 78, "label": "Magnetic Energy", "evidence": "The person everyone gravitates toward at parties"}, "agreeableness": {"position": 65, "label": "Honest Over Nice", "evidence": "Will tell you the truth even when it''s uncomfortable"}, "emotionalSensitivity": {"position": 85, "label": "Intensely Present", "evidence": "Feels everything at full volume"}}'::jsonb,
  '[{"value": "Freedom", "description": "Not from people, but to be fully himself with them."}, {"value": "Presence", "description": "Would rather have one real hour than a whole performative day."}, {"value": "Creative Honesty", "description": "Everything he makes is an attempt to say something true."}]'::jsonb,
  'Fast-moving and intuition-led. Connects through shared creative energy and moments of unexpected depth.',
  'Anxious-leaning but self-aware about it — working on trusting that people who leave the room are coming back.',
  'The Spontaneous Depth — Kai loves by turning ordinary moments into something memorable, making you feel like the most interesting person in any room.',
  0.78, 'ready'
FROM _mrk_ids WHERE key = 'kai';

-- Priya (writer/journalist, sharp and warm)
INSERT INTO visible_soul_files (
  user_id, version, portrait, how_you_light_up, how_you_show_up, how_you_love, what_youre_looking_for,
  compass_scores, personality_spectrum, top_values,
  relational_style, attachment_style, love_signature, completeness, status
)
SELECT uid, 1,
  'Priya is sharp edges and soft center — a journalist who asks the hard questions at work and the real questions at home. She thinks fast, loves hard, and has zero patience for surface-level anything.',
  'You light up when someone surprises you with a perspective you hadn''t considered, in the hour after a deadline when the adrenaline settles, in any conversation that gets real within the first five minutes.',
  'Direct, funny, and a little intimidating until people realize the intensity comes from caring too much, not too little.',
  'You love through deep attention and challenge — the partner who remembers the throwaway thing you said three months ago, who pushes you to be braver than you think you are.',
  'Someone who can keep up intellectually but also knows when to stop analyzing and just feel things.',
  '{"openness": 85, "playfulness": 72, "warmth": 78, "emotional_depth": 90, "devotion": 82, "resilience": 88, "independence": 84, "passion": 86}'::jsonb,
  '{"openness": {"position": 87, "label": "Voracious Mind", "evidence": "Reads everything, questions everything"}, "conscientiousness": {"position": 78, "label": "Driven Creator", "evidence": "Deadline-powered and purpose-driven"}, "extraversion": {"position": 68, "label": "Selectively Social", "evidence": "Electrifying in small groups, drained by crowds"}, "agreeableness": {"position": 55, "label": "Lovingly Blunt", "evidence": "Says what others are thinking, but with warmth"}, "emotionalSensitivity": {"position": 82, "label": "Fierce Feeler", "evidence": "Processes through writing, cries at documentaries"}}'::jsonb,
  '[{"value": "Truth", "description": "In her work, her relationships, and especially with herself."}, {"value": "Depth", "description": "Would rather know one person completely than twenty people at surface level."}, {"value": "Courage", "description": "Believes the scariest conversations are always the most important ones."}]'::jsonb,
  'Intense and loyal. Connects through intellectual sparring and emotional honesty — once she''s in, she''s all in.',
  'Secure with a fierce independent streak — needs a partner who has their own thing going on.',
  'The Loving Challenge — Priya loves by seeing who you really are and refusing to let you be less.',
  0.80, 'ready'
FROM _mrk_ids WHERE key = 'priya';

-- Mateo (chef, sensory and grounded)
INSERT INTO visible_soul_files (
  user_id, version, portrait, how_you_light_up, how_you_show_up, how_you_love, what_youre_looking_for,
  compass_scores, personality_spectrum, top_values,
  relational_style, attachment_style, love_signature, completeness, status
)
SELECT uid, 1,
  'Mateo is warmth made physical — a chef who speaks through flavor and shows up for people the way he shows up for a dish: with full attention, no shortcuts, and real care about how it lands.',
  'You light up when someone closes their eyes after the first bite, at farmers markets at 6am, in the quiet moment after a long service when the kitchen is finally still.',
  'Present and unhurried. You make people feel like the most important person in the room because in that moment, they are.',
  'You love through nourishment in every sense — the partner who learns your comfort food and makes it when you''re sad, who creates space for you to fall apart without trying to fix it.',
  'Someone with their own fire — a partner who brings a different kind of intensity to the table and makes him see the world from a new angle.',
  '{"openness": 73, "playfulness": 78, "warmth": 93, "emotional_depth": 76, "devotion": 90, "resilience": 85, "independence": 68, "passion": 88}'::jsonb,
  '{"openness": {"position": 71, "label": "Grounded Explorer", "evidence": "Travels through cuisine, open to new tastes and traditions"}, "conscientiousness": {"position": 86, "label": "Disciplined Creative", "evidence": "Kitchen precision meets artistic intuition"}, "extraversion": {"position": 72, "label": "Warm Host", "evidence": "Energized by feeding people, recharges in solitude"}, "agreeableness": {"position": 88, "label": "Generous Spirit", "evidence": "Instinctively gives more than he takes"}, "emotionalSensitivity": {"position": 74, "label": "Steady Feeler", "evidence": "Processes emotion through doing rather than talking"}}'::jsonb,
  '[{"value": "Presence", "description": "Believes the best things happen when you stop multitasking and just show up."}, {"value": "Generosity", "description": "His default setting is giving — time, food, attention, energy."}, {"value": "Craft", "description": "Doing something with your hands and your full attention is a form of love."}]'::jsonb,
  'All-in and present. Connects through shared experiences and acts of care — less about talking and more about being there.',
  'Secure and nurturing — naturally creates a sense of home wherever he goes.',
  'The Nourisher — Mateo loves by paying attention to what you need before you know you need it, turning care into something you can taste.',
  0.76, 'ready'
FROM _mrk_ids WHERE key = 'mateo';

-- ============================================================
-- 5. Soulmate profiles
-- ============================================================

INSERT INTO soulmate_profiles (user_id, display_name, age, gender, latitude, longitude, preferred_age_min, preferred_age_max, preferred_genders, active)
SELECT uid, name, age, gender, lat, lng, age_min, age_max, prefs, true
FROM _mrk_ids
JOIN (VALUES
  ('sophie', 'Sophie', 27, 'female', 37.7749, -122.4194, 25, 35, ARRAY['male']),
  ('james',  'James',  30, 'male',   37.7849, -122.4094, 24, 34, ARRAY['female']),
  ('kai',    'Kai',    26, 'male',   37.7649, -122.4294, 23, 32, ARRAY['female','non_binary']),
  ('priya',  'Priya',  28, 'female', 37.7549, -122.3994, 25, 35, ARRAY['male','female']),
  ('mateo',  'Mateo',  29, 'male',   37.7949, -122.4394, 24, 33, ARRAY['female'])
) AS t(k, name, age, gender, lat, lng, age_min, age_max, prefs) ON _mrk_ids.key = t.k
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- 6. Matches (enforce user_a_id < user_b_id)
-- ============================================================

-- Delete existing matches for Sophie
DELETE FROM matches WHERE user_a_id = (SELECT uid FROM _mrk_ids WHERE key = 'sophie')
                      OR user_b_id = (SELECT uid FROM _mrk_ids WHERE key = 'sophie');

-- Sophie + James (0.92)
INSERT INTO matches (user_a_id, user_b_id, a_soul_version, b_soul_version, result, score, reasoning)
SELECT LEAST(s.uid, j.uid), GREATEST(s.uid, j.uid), 1, 1, 'match', 0.92,
  'There''s something almost poetic here — Sophie''s quiet creativity and James''s steady warmth speak the same language without trying. They both crave authenticity over performance and believe the best love is built in the boring moments, not the grand ones. Where she brings imagination and emotional depth, he offers grounding and follow-through — exactly the patient, showing-up love she described wanting. Their shared curiosity could fuel the kind of 2am conversations they both light up for.'
FROM _mrk_ids s, _mrk_ids j WHERE s.key = 'sophie' AND j.key = 'james';

-- Sophie + Kai (0.85)
INSERT INTO matches (user_a_id, user_b_id, a_soul_version, b_soul_version, result, score, reasoning)
SELECT LEAST(s.uid, k.uid), GREATEST(s.uid, k.uid), 1, 1, 'match', 0.85,
  'This is the pairing that surprises on paper but makes instant sense in person. Sophie''s grounded creativity and Kai''s restless energy create a charge — she''s the anchor he didn''t know he needed, and he''s the chaos she secretly craves. They both value authenticity over polish and depth over small talk. His spontaneity could pull her out of her comfort zone in exactly the way she described wanting, and her steadiness could be the safe landing he''s been looking for.'
FROM _mrk_ids s, _mrk_ids k WHERE s.key = 'sophie' AND k.key = 'kai';

-- Sophie + Priya (0.88)
INSERT INTO matches (user_a_id, user_b_id, a_soul_version, b_soul_version, result, score, reasoning)
SELECT LEAST(s.uid, p.uid), GREATEST(s.uid, p.uid), 1, 1, 'match', 0.88,
  'Two people who are absolutely done with surface-level anything. Sophie''s quiet observation and Priya''s direct intensity are different expressions of the same hunger — they both want conversations that actually go somewhere. Priya''s challenge-as-love-language could be exactly the push Sophie needs to stop holding back, and Sophie''s warmth could be the soft place Priya didn''t know she was looking for. The intellectual connection here could be electric.'
FROM _mrk_ids s, _mrk_ids p WHERE s.key = 'sophie' AND p.key = 'priya';

-- Sophie + Mateo (0.90)
INSERT INTO matches (user_a_id, user_b_id, a_soul_version, b_soul_version, result, score, reasoning)
SELECT LEAST(s.uid, m.uid), GREATEST(s.uid, m.uid), 1, 1, 'match', 0.90,
  'This match runs on the same frequency — both Sophie and Mateo believe love lives in the details, not the declarations. Her notes-in-sketchbooks energy meets his cooking-your-comfort-food energy and it just clicks. They both process the world through making things, and Mateo''s warmth could create exactly the kind of safe, consistent presence that lets Sophie peel back her layers. The Sunday cooking she imagined? He''d make it extraordinary.'
FROM _mrk_ids s, _mrk_ids m WHERE s.key = 'sophie' AND m.key = 'mateo';

-- ============================================================
-- 7. Match messages (personality-forward, gen z energy)
-- ============================================================

-- Clean up all match messages involving Sophie
DELETE FROM match_messages
WHERE sender_id = (SELECT uid FROM _mrk_ids WHERE key = 'sophie')
   OR receiver_id = (SELECT uid FROM _mrk_ids WHERE key = 'sophie');

-- Helper: insert match messages
-- Sophie + James (warm, nerdy, mutual respect energy)
INSERT INTO match_messages (sender_id, receiver_id, content, created_at)
SELECT
  CASE WHEN sender = 'james' THEN j.uid ELSE s.uid END,
  CASE WHEN sender = 'james' THEN s.uid ELSE j.uid END,
  content, ts
FROM _mrk_ids s, _mrk_ids j, (VALUES
  ('james',  'okay i read your "how you connect" thing and the part about wanting someone who''d be unironically excited at a button museum?? i need you to know i once spent 4 hours at a tile museum in lisbon and it was a top 5 life experience',
   now() - interval '2 days'),
  ('sophie', 'WAIT a tile museum??? please tell me you took pictures. i have a very specific weakness for people who get passionate about niche things',
   now() - interval '2 days' + interval '8 minutes'),
  ('james',  'i have 47 photos of portuguese azulejos and exactly zero shame about it. also — children''s book illustrator?? that might be the coolest job i''ve ever heard of. what are you working on?',
   now() - interval '2 days' + interval '20 minutes'),
  ('sophie', 'a story about a fox who builds a library in the woods and honestly that tells you everything about my personality 📚 what are you building rn?',
   now() - interval '1 day' - interval '10 hours'),
  ('james',  'community center in the mission. lots of natural light, reading nooks everywhere. your fox would lose his mind',
   now() - interval '1 day' - interval '9 hours'),
  ('sophie', 'reading nooks!! okay james you might actually be too perfect. do you have a favorite one you''ve designed?',
   now() - interval '1 day' - interval '5 hours'),
  ('james',  'window seat from my last project — overlooks a courtyard garden. i keep thinking it''s the ideal spot to drink tea and watch it rain. very specific i know.',
   now() - interval '1 day'),
  ('sophie', 'very specific is my love language. that sounds genuinely dreamy ☕',
   now() - interval '20 hours'),
  ('james',  'okay i have to ask. the friday wine bar tradition — is that a sacred thing or could a tile-museum-loving architect occasionally attend',
   now() - interval '14 hours'),
  ('sophie', 'mia would need to vet you first and she is VERY intense about it. but honestly? the tile museum thing would probably win her over. coffee this week first tho?',
   now() - interval '12 hours')
) AS t(sender, content, ts) WHERE s.key = 'sophie' AND j.key = 'james';

-- Sophie + Kai (chaotic, flirty, creative sparks)
INSERT INTO match_messages (sender_id, receiver_id, content, created_at)
SELECT
  CASE WHEN sender = 'kai' THEN k.uid ELSE s.uid END,
  CASE WHEN sender = 'kai' THEN s.uid ELSE k.uid END,
  content, ts
FROM _mrk_ids s, _mrk_ids k, (VALUES
  ('kai',    'hi so i don''t usually lead with this but i literally just made a beat inspired by your soul compass scores and i feel like that''s either very romantic or deeply unhinged',
   now() - interval '1 day' - interval '6 hours'),
  ('sophie', 'that is OBJECTIVELY unhinged and also the best opening message i''ve ever received?? what did my compass scores sound like',
   now() - interval '1 day' - interval '5 hours'),
  ('kai',    'your warmth was this low synth pad, playfulness was these staccato keys, and emotional depth was the bass that sneaks up on you. it goes hard actually. i can send it if that''s not too much for message 3',
   now() - interval '1 day' - interval '4 hours'),
  ('sophie', 'kai. SEND IT. i''m an illustrator, i fully understand the impulse to create something because a person made you feel a thing',
   now() - interval '1 day' - interval '3 hours'),
  ('kai',    'okay see this is why we matched. most people would''ve said "lol that''s crazy" and changed the subject. you just GOT it immediately',
   now() - interval '1 day'),
  ('sophie', 'i once spent three weeks painting a watercolor because my friend mia said something about how rain sounds different in every city and it wouldn''t leave my brain. we are the same kind of unwell',
   now() - interval '22 hours'),
  ('kai',    'the same kind of unwell 😭 that''s going on my tombstone. okay but seriously — what''s your take on spontaneous tuesday adventures? asking for research purposes',
   now() - interval '18 hours'),
  ('sophie', 'that depends. are we talking like "let''s go get ramen at that place i heard about" tuesday or "let''s drive to half moon bay right now" tuesday',
   now() - interval '16 hours'),
  ('kai',    'the second one but we stop for ramen on the way',
   now() - interval '14 hours'),
  ('sophie', 'you''re dangerous and i''m in. when''s the next tuesday',
   now() - interval '12 hours')
) AS t(sender, content, ts) WHERE s.key = 'sophie' AND k.key = 'kai';

-- Sophie + Priya (sharp, intellectual, real talk)
INSERT INTO match_messages (sender_id, receiver_id, content, created_at)
SELECT
  CASE WHEN sender = 'priya' THEN p.uid ELSE s.uid END,
  CASE WHEN sender = 'priya' THEN s.uid ELSE p.uid END,
  content, ts
FROM _mrk_ids s, _mrk_ids p, (VALUES
  ('priya',  'your profile said you''d rather have a three-hour hard conversation than five minutes of fake peace and honestly i think i just fell in love a little bit',
   now() - interval '1 day' - interval '2 hours'),
  ('sophie', 'omg hi priya. and yes that''s maybe my most non-negotiable thing. fake peace is just delayed conflict with interest',
   now() - interval '1 day' - interval '1 hour'),
  ('priya',  '"delayed conflict with interest" — i''m a journalist and even i couldn''t have said it better. okay i already like you. what''s the last thing that made you feel something real?',
   now() - interval '1 day'),
  ('sophie', 'honestly? i was illustrating this scene of two characters meeting for the first time and i started crying because i got the expressions right and it felt more true than most things in my actual life. is that weird.',
   now() - interval '22 hours'),
  ('priya',  'that''s not weird that''s the most beautiful thing. i get that with writing — sometimes a sentence hits and you realize you didn''t know you felt that way until you wrote it down',
   now() - interval '20 hours'),
  ('sophie', 'YES. like the art knows before you do. okay what about you — what was the last real thing',
   now() - interval '18 hours'),
  ('priya',  'i interviewed this 86-year-old woman last week about her late wife and she said "love isn''t the fireworks, it''s the person you want to tell about the fireworks" and i had to pretend i wasn''t crying in a professional setting',
   now() - interval '16 hours'),
  ('sophie', 'i am now also crying. that woman understood everything. also i just need to say — talking to you feels like when a conversation finally gets past the small talk and into the real stuff and you can feel yourself relax',
   now() - interval '14 hours'),
  ('priya',  'sophie i swear i was thinking the exact same thing. do you want to get coffee and have inappropriate levels of emotional depth for a first meeting?',
   now() - interval '12 hours'),
  ('sophie', 'that is literally my ideal first meeting. name the place and i''ll bring my sketchbook',
   now() - interval '10 hours')
) AS t(sender, content, ts) WHERE s.key = 'sophie' AND p.key = 'priya';

-- Sophie + Mateo (warm, sensory, sweet)
INSERT INTO match_messages (sender_id, receiver_id, content, created_at)
SELECT
  CASE WHEN sender = 'mateo' THEN m.uid ELSE s.uid END,
  CASE WHEN sender = 'mateo' THEN s.uid ELSE m.uid END,
  content, ts
FROM _mrk_ids s, _mrk_ids m, (VALUES
  ('mateo',  'hey sophie. so your soul file mentioned sunday cooking together and i need you to know i''m a chef so this feels like the universe being extremely on the nose',
   now() - interval '3 days'),
  ('sophie', 'STOP. you''re a chef?? okay the universe is definitely trolling us because i literally described my dream life as "cooking together on sundays" before i knew you existed',
   now() - interval '3 days' + interval '30 minutes'),
  ('mateo',  'i love that it was specifically sundays. there''s something about a slow sunday meal — no rush, good music, maybe too much wine. it''s kind of my whole philosophy',
   now() - interval '2 days' - interval '8 hours'),
  ('sophie', 'your whole philosophy is basically my whole personality. what would you cook if you were trying to, i don''t know, show someone who you are through food',
   now() - interval '2 days' - interval '4 hours'),
  ('mateo',  'my grandmother''s sopa de lima. it''s not fancy at all but every ingredient has a memory attached to it. the coriander she grew on her windowsill, the way she''d squeeze the lime with her whole hand. food should make you feel something, not just look good on a plate',
   now() - interval '2 days'),
  ('sophie', 'mateo that''s exactly how i feel about illustration. like anyone can draw something technically perfect but if it doesn''t make you FEEL something what''s even the point. we''re the same person in different art forms',
   now() - interval '1 day' - interval '16 hours'),
  ('mateo',  '"the same person in different art forms" — okay i''m saving that. also i looked up your illustration style (hope that''s not creepy?) and the warmth in your watercolors is exactly what i try to do with food. comfort that sneaks up on you',
   now() - interval '1 day' - interval '8 hours'),
  ('sophie', 'not creepy at all, i''m flattered!! and "comfort that sneaks up on you" is maybe the best description of what i''m going for that anyone has ever said. you get it',
   now() - interval '1 day'),
  ('mateo',  'okay hear me out. what if instead of a normal first date we just... cook together. you can illustrate while i prep and we put on something good and see what happens',
   now() - interval '16 hours'),
  ('sophie', 'that might be the most thoughtful first date anyone has ever proposed to me. yes. absolutely yes. bring the sopa de lima recipe 🍋',
   now() - interval '14 hours')
) AS t(sender, content, ts) WHERE s.key = 'sophie' AND m.key = 'mateo';

-- ============================================================
-- Cleanup
-- ============================================================

DROP TABLE IF EXISTS _mrk_ids;

COMMIT;
