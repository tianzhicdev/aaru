-- Phase 2 Step 1: Functional soulmate feature
-- Adds display_name to profiles, reasoning to matches, and match_messages table

-- Display name on soulmate profiles (user-chosen name shown to matches)
ALTER TABLE soulmate_profiles ADD COLUMN IF NOT EXISTS display_name text;

-- Match reasoning (LLM-generated explanation of why they matched)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS reasoning text;

-- Direct messages between matched users (sender + receiver, no match_id FK)
CREATE TABLE IF NOT EXISTS match_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_match_messages_pair
  ON match_messages(LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id), created_at);
