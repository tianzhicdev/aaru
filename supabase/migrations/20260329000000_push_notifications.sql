-- Add last_active_at for analytics (updated by soul-converse on each interaction)
ALTER TABLE users ADD COLUMN last_active_at timestamptz DEFAULT now();
