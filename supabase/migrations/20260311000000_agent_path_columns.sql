-- Add path and move_speed columns for smooth client-side movement interpolation.
-- path: JSON array of {x, y} cell waypoints the agent will walk through.
-- move_speed: cells per second (default 1.8).
ALTER TABLE agent_positions
  ADD COLUMN IF NOT EXISTS path jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS move_speed double precision NOT NULL DEFAULT 1.8;
