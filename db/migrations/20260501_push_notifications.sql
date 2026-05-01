-- Push notification tokens (APNs)
CREATE TABLE IF NOT EXISTS device_push_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user
  ON device_push_tokens(user_id);

-- Source of soul messages — distinguishes admin-sent from regular conversation.
-- 'user_chat' = ordinary user/assistant turns. 'admin_message' = sent via /admin/send-message.
ALTER TABLE soul_messages
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user_chat';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'soul_messages_source_chk'
  ) THEN
    ALTER TABLE soul_messages
      ADD CONSTRAINT soul_messages_source_chk
      CHECK (source IN ('user_chat', 'admin_message'));
  END IF;
END $$;
