-- Add reflection_note column to users table for rolling memory
ALTER TABLE users ADD COLUMN IF NOT EXISTS reflection_note JSONB DEFAULT NULL;
