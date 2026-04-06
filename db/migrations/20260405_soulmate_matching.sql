-- Soulmate profiles (demographics + preferences)
CREATE TABLE soulmate_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  age int NOT NULL CHECK (age >= 18),
  gender text NOT NULL CHECK (gender IN ('male', 'female', 'non_binary')),
  latitude float NOT NULL,
  longitude float NOT NULL,
  preferred_age_min int NOT NULL CHECK (preferred_age_min >= 18),
  preferred_age_max int NOT NULL,
  preferred_genders text[] NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- All match attempts (the golden table)
CREATE TABLE matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  a_soul_version int NOT NULL,
  b_soul_version int NOT NULL,
  result text NOT NULL CHECK (result IN ('match', 'no_match', 'error')),
  score float,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matches_ordered CHECK (user_a_id < user_b_id),
  UNIQUE (user_a_id, user_b_id, a_soul_version, b_soul_version)
);
CREATE INDEX idx_matches_user_a ON matches(user_a_id);
CREATE INDEX idx_matches_user_b ON matches(user_b_id);

-- Completeness on visible soul files (part of the soul file itself)
ALTER TABLE visible_soul_files ADD COLUMN IF NOT EXISTS completeness float DEFAULT 0;
