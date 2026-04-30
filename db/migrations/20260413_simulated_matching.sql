-- Simulated conversation matching: new columns + index

-- matches: store simulation results per-user
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS connection_zones jsonb,
  ADD COLUMN IF NOT EXISTS raw_evaluation jsonb,
  ADD COLUMN IF NOT EXISTS reasoning_a text,
  ADD COLUMN IF NOT EXISTS reasoning_b text;

-- soulmate_profiles: selfie + bio
ALTER TABLE soulmate_profiles
  ADD COLUMN IF NOT EXISTS selfie_url text,
  ADD COLUMN IF NOT EXISTS bio text;

-- Speed up user message count queries for eligibility
CREATE INDEX IF NOT EXISTS idx_soul_messages_user_id_role
  ON soul_messages(user_id, role);
