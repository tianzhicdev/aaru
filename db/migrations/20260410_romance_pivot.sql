-- Romance Pivot Migration
-- Wipes stale synthesis artifacts (messages stay — they're the source of truth)
-- Renames section columns to romance-oriented names
-- Adds new fields for attachment style, love signature, conflict profile

-- 1. Wipe stale synthesis artifacts
DELETE FROM visible_soul_files;
DELETE FROM hidden_soul_files;
DELETE FROM reflection_snapshots;

-- 2. Rename visible_soul_files section columns
ALTER TABLE visible_soul_files RENAME COLUMN how_you_move TO how_you_light_up;
ALTER TABLE visible_soul_files RENAME COLUMN how_you_think TO how_you_show_up;
ALTER TABLE visible_soul_files RENAME COLUMN how_you_connect TO how_you_love;
ALTER TABLE visible_soul_files RENAME COLUMN what_you_carry TO how_you_weather_storms;
ALTER TABLE visible_soul_files RENAME COLUMN what_lights_you_up TO what_youre_looking_for;
ALTER TABLE visible_soul_files RENAME COLUMN your_contradictions TO your_growing_edges;
ALTER TABLE visible_soul_files RENAME COLUMN your_voice TO your_warmth;

-- 3. Add new visible_soul_files fields
ALTER TABLE visible_soul_files ADD COLUMN IF NOT EXISTS attachment_style text;
ALTER TABLE visible_soul_files ADD COLUMN IF NOT EXISTS love_signature text;

-- 4. Add new hidden_soul_files fields
ALTER TABLE hidden_soul_files ADD COLUMN IF NOT EXISTS attachment_assessment text;
ALTER TABLE hidden_soul_files ADD COLUMN IF NOT EXISTS conflict_profile text;
