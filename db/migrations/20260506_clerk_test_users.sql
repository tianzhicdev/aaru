-- Add test user flag and Clerk integration columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_test_user BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id) WHERE clerk_user_id IS NOT NULL;
