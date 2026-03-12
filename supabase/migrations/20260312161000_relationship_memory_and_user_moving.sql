DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'user_moving'
      AND enumtypid = 'agent_state'::regtype
  ) THEN
    ALTER TYPE public.agent_state ADD VALUE 'user_moving';
  END IF;
END $$;

ALTER TABLE public.impression_edges
  ADD COLUMN IF NOT EXISTS memory_summary text,
  ADD COLUMN IF NOT EXISTS values_alignment numeric,
  ADD COLUMN IF NOT EXISTS interest_overlap numeric,
  ADD COLUMN IF NOT EXISTS novelty numeric;
