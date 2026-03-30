CREATE TABLE IF NOT EXISTS public.reflection_snapshots (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  through_message_count int NOT NULL DEFAULT 0,
  through_last_message_created_at timestamptz,
  note jsonb,
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'pending', 'failed')),
  started_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users
  DROP COLUMN IF EXISTS reflection_note;

ALTER TABLE public.claude_debug_traces
  DROP CONSTRAINT IF EXISTS claude_debug_traces_trace_kind_check;

ALTER TABLE public.claude_debug_traces
  ADD CONSTRAINT claude_debug_traces_trace_kind_check
  CHECK (trace_kind IN ('conversation', 'synthesis', 'reflection'));

DROP TRIGGER IF EXISTS reflection_snapshots_touch_updated_at ON public.reflection_snapshots;

CREATE TRIGGER reflection_snapshots_touch_updated_at
BEFORE UPDATE ON public.reflection_snapshots
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
