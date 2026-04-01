-- Thumos baseline schema as of 2026-03-31.
-- Safe to apply to a fresh database and to the current dev/prod databases.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Remove legacy objects from pre-launch iterations.
ALTER TABLE IF EXISTS public.users
  DROP COLUMN IF EXISTS reflection_note;

ALTER TABLE IF EXISTS public.soul_messages
  DROP CONSTRAINT IF EXISTS soul_messages_session_id_fkey;

ALTER TABLE IF EXISTS public.soul_messages
  DROP COLUMN IF EXISTS session_id;

DROP TABLE IF EXISTS public.soul_sessions;

-- Users
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT 'Wandering Soul',
  model_profile_id text NOT NULL DEFAULT 'frontier_v1',
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT 'Wandering Soul',
  ADD COLUMN IF NOT EXISTS model_profile_id text DEFAULT 'frontier_v1',
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.users
SET model_profile_id = COALESCE(model_profile_id, 'frontier_v1'),
    last_active_at = COALESCE(last_active_at, now()),
    created_at = COALESCE(created_at, now()),
    updated_at = COALESCE(updated_at, now());

ALTER TABLE public.users
  ALTER COLUMN display_name SET DEFAULT 'Wandering Soul',
  ALTER COLUMN model_profile_id SET DEFAULT 'frontier_v1',
  ALTER COLUMN model_profile_id SET NOT NULL,
  ALTER COLUMN last_active_at SET DEFAULT now(),
  ALTER COLUMN last_active_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

-- Device sessions
CREATE TABLE IF NOT EXISTS public.device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.device_sessions
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE public.device_sessions
SET last_seen_at = COALESCE(last_seen_at, now()),
    created_at = COALESCE(created_at, now());

ALTER TABLE public.device_sessions
  ALTER COLUMN last_seen_at SET DEFAULT now(),
  ALTER COLUMN last_seen_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS device_sessions_user_id_idx
  ON public.device_sessions(user_id);

CREATE INDEX IF NOT EXISTS device_sessions_device_id_idx
  ON public.device_sessions(device_id);

CREATE INDEX IF NOT EXISTS device_sessions_expires_at_idx
  ON public.device_sessions(expires_at);

-- Soul messages
CREATE TABLE IF NOT EXISTS public.soul_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.soul_messages
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_soul_messages_user_created
  ON public.soul_messages(user_id, created_at);

-- Reflection snapshots
CREATE TABLE IF NOT EXISTS public.reflection_snapshots (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
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

ALTER TABLE public.reflection_snapshots
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS through_message_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS through_last_message_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS note jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.reflection_snapshots
SET created_at = COALESCE(created_at, now()),
    updated_at = COALESCE(updated_at, now());

ALTER TABLE public.reflection_snapshots
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.reflection_snapshots
  DROP CONSTRAINT IF EXISTS reflection_snapshots_pkey;

ALTER TABLE public.reflection_snapshots
  ADD PRIMARY KEY (user_id, version);

CREATE INDEX IF NOT EXISTS idx_reflection_snapshots_latest
  ON public.reflection_snapshots(user_id, version DESC);

-- Visible soul files
CREATE TABLE IF NOT EXISTS public.visible_soul_files (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  last_updated timestamptz NOT NULL DEFAULT now(),
  portrait text,
  how_you_move text DEFAULT '',
  how_you_think text DEFAULT '',
  how_you_connect text DEFAULT '',
  what_you_carry text DEFAULT '',
  what_lights_you_up text DEFAULT '',
  your_contradictions text DEFAULT '',
  your_voice text DEFAULT '',
  crystallized_moments jsonb DEFAULT '[]'::jsonb,
  open_threads jsonb DEFAULT '[]'::jsonb,
  compass_scores jsonb DEFAULT '{}'::jsonb,
  personality_spectrum jsonb DEFAULT '{}'::jsonb,
  top_values jsonb DEFAULT '[]'::jsonb,
  relational_style text DEFAULT NULL,
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'pending', 'failed')),
  synthesis_started_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.visible_soul_files
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_updated timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS portrait text,
  ADD COLUMN IF NOT EXISTS how_you_move text DEFAULT '',
  ADD COLUMN IF NOT EXISTS how_you_think text DEFAULT '',
  ADD COLUMN IF NOT EXISTS how_you_connect text DEFAULT '',
  ADD COLUMN IF NOT EXISTS what_you_carry text DEFAULT '',
  ADD COLUMN IF NOT EXISTS what_lights_you_up text DEFAULT '',
  ADD COLUMN IF NOT EXISTS your_contradictions text DEFAULT '',
  ADD COLUMN IF NOT EXISTS your_voice text DEFAULT '',
  ADD COLUMN IF NOT EXISTS crystallized_moments jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS open_threads jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compass_scores jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS personality_spectrum jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS top_values jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS relational_style text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS synthesis_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE public.visible_soul_files
SET last_updated = COALESCE(last_updated, now()),
    created_at = COALESCE(created_at, now());

ALTER TABLE public.visible_soul_files
  ALTER COLUMN last_updated SET DEFAULT now(),
  ALTER COLUMN last_updated SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.visible_soul_files
  DROP CONSTRAINT IF EXISTS visible_soul_files_pkey;

ALTER TABLE public.visible_soul_files
  ADD PRIMARY KEY (user_id, version);

CREATE INDEX IF NOT EXISTS idx_visible_soul_files_latest
  ON public.visible_soul_files(user_id, version DESC);

-- Hidden soul files
CREATE TABLE IF NOT EXISTS public.hidden_soul_files (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  last_updated timestamptz NOT NULL DEFAULT now(),
  confidence text NOT NULL DEFAULT 'low'
    CHECK (confidence IN ('low', 'medium', 'high')),
  expert_reflections jsonb DEFAULT '{}'::jsonb,
  core_drivers jsonb DEFAULT '[]'::jsonb,
  core_values jsonb DEFAULT '[]'::jsonb,
  voice jsonb DEFAULT '{}'::jsonb,
  depth_map jsonb DEFAULT '{}'::jsonb,
  analyst_notes jsonb DEFAULT '[]'::jsonb,
  honest_insights jsonb DEFAULT '[]'::jsonb,
  big_five_scores jsonb DEFAULT '{}'::jsonb,
  schwartz_profile jsonb DEFAULT '[]'::jsonb,
  attachment_scores jsonb DEFAULT '{}'::jsonb,
  moral_foundations jsonb DEFAULT '{}'::jsonb,
  meaning_orientation text DEFAULT NULL,
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'pending', 'failed')),
  synthesis_started_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.hidden_soul_files
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_updated timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS expert_reflections jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS core_drivers jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS core_values jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS voice jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS depth_map jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analyst_notes jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS honest_insights jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS big_five_scores jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS schwartz_profile jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachment_scores jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS moral_foundations jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS meaning_orientation text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS synthesis_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE public.hidden_soul_files
SET last_updated = COALESCE(last_updated, now()),
    created_at = COALESCE(created_at, now());

ALTER TABLE public.hidden_soul_files
  ALTER COLUMN last_updated SET DEFAULT now(),
  ALTER COLUMN last_updated SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.hidden_soul_files
  DROP CONSTRAINT IF EXISTS hidden_soul_files_pkey;

ALTER TABLE public.hidden_soul_files
  ADD PRIMARY KEY (user_id, version);

CREATE INDEX IF NOT EXISTS idx_hidden_soul_files_latest
  ON public.hidden_soul_files(user_id, version DESC);

-- Debug traces
CREATE TABLE IF NOT EXISTS public.claude_debug_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trace_kind text NOT NULL CHECK (trace_kind IN ('conversation', 'synthesis', 'reflection')),
  model text NOT NULL,
  system_prompt text NOT NULL,
  input_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_response text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.claude_debug_traces
  ADD COLUMN IF NOT EXISTS system_prompt text,
  ADD COLUMN IF NOT EXISTS input_messages jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_response text,
  ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE public.claude_debug_traces
SET created_at = COALESCE(created_at, now()),
    input_messages = COALESCE(input_messages, '[]'::jsonb),
    meta = COALESCE(meta, '{}'::jsonb);

ALTER TABLE public.claude_debug_traces
  ALTER COLUMN input_messages SET DEFAULT '[]'::jsonb,
  ALTER COLUMN input_messages SET NOT NULL,
  ALTER COLUMN meta SET DEFAULT '{}'::jsonb,
  ALTER COLUMN meta SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.claude_debug_traces
  DROP CONSTRAINT IF EXISTS claude_debug_traces_trace_kind_check;

ALTER TABLE public.claude_debug_traces
  ADD CONSTRAINT claude_debug_traces_trace_kind_check
  CHECK (trace_kind IN ('conversation', 'synthesis', 'reflection'));

CREATE INDEX IF NOT EXISTS claude_debug_traces_user_kind_created_idx
  ON public.claude_debug_traces(user_id, trace_kind, created_at DESC);

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_touch_updated_at ON public.users;
CREATE TRIGGER users_touch_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS reflection_snapshots_touch_updated_at ON public.reflection_snapshots;
CREATE TRIGGER reflection_snapshots_touch_updated_at
BEFORE UPDATE ON public.reflection_snapshots
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
