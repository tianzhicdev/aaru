CREATE TABLE IF NOT EXISTS public.claude_debug_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trace_kind text NOT NULL CHECK (trace_kind IN ('conversation', 'synthesis')),
  model text NOT NULL,
  system_prompt text NOT NULL,
  input_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_response text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claude_debug_traces_user_kind_created_idx
  ON public.claude_debug_traces(user_id, trace_kind, created_at DESC);
