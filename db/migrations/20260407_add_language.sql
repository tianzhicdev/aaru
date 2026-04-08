-- Add language preference to users
-- Defaults to 'en' (English). Supported: 'en', 'zh-CN'.
ALTER TABLE users ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
