-- Remove soul_sessions table and session_id from soul_messages
-- Sessions were thin containers for message grouping — no longer needed.

ALTER TABLE soul_messages DROP CONSTRAINT IF EXISTS soul_messages_session_id_fkey;
DROP INDEX IF EXISTS idx_soul_messages_session;
ALTER TABLE soul_messages DROP COLUMN session_id;
CREATE INDEX IF NOT EXISTS idx_soul_messages_user_created ON soul_messages(user_id, created_at);
DROP TABLE IF EXISTS soul_sessions;
