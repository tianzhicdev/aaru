-- Add behavior state machine fields for directional wander + idle system.
-- behavior: current behavior mode (wander or idle).
-- behavior_ticks_remaining: ticks until next behavior re-evaluation.
-- heading: compass direction 0-7 (N, NE, E, SE, S, SW, W, NW).

ALTER TABLE agent_positions
  ADD COLUMN IF NOT EXISTS behavior text DEFAULT 'wander',
  ADD COLUMN IF NOT EXISTS behavior_ticks_remaining integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heading integer DEFAULT 0;

-- Add 'idle' to the agent_state enum if it doesn't already exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'idle' AND enumtypid = 'agent_state'::regtype) THEN
    ALTER TYPE agent_state ADD VALUE 'idle';
  END IF;
END
$$;
