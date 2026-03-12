-- Add responsiveness and conversation_quality sub-scores to impression_edges
-- for momentum-based conversation extension
ALTER TABLE impression_edges
  ADD COLUMN IF NOT EXISTS responsiveness numeric,
  ADD COLUMN IF NOT EXISTS conversation_quality numeric;
