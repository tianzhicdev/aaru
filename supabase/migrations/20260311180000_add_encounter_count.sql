-- Add encounter_count to impression_edges for pair cooldown decay
ALTER TABLE impression_edges
  ADD COLUMN IF NOT EXISTS encounter_count integer NOT NULL DEFAULT 0;
