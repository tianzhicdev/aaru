-- Thumos Soul Mirror — current Neon Postgres schema
-- Matches the Cloudflare Workers runtime.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ────────────────────────────────────────────────────

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT 'Wandering Soul',
  model_profile_id text NOT NULL DEFAULT 'frontier_v1',
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Device Sessions ──────────────────────────────────────────

CREATE TABLE public.device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX device_sessions_user_id_idx ON public.device_sessions(user_id);
CREATE INDEX device_sessions_device_id_idx ON public.device_sessions(device_id);
CREATE INDEX device_sessions_expires_at_idx ON public.device_sessions(expires_at);

-- ── Soul Messages ────────────────────────────────────────────

CREATE TABLE public.soul_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_soul_messages_user_created ON public.soul_messages(user_id, created_at);

-- ── Reflection Snapshots (async running memory) ──────────────

CREATE TABLE public.reflection_snapshots (
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
  ADD PRIMARY KEY (user_id, version);

CREATE INDEX idx_reflection_snapshots_latest
  ON public.reflection_snapshots(user_id, version DESC);

-- ── Visible Soul Files (user-facing, poetic) ────────────────

CREATE TABLE public.visible_soul_files (
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
  ADD PRIMARY KEY (user_id, version);

CREATE INDEX idx_visible_soul_files_latest
  ON public.visible_soul_files(user_id, version DESC);

-- ── Hidden Soul Files (agent-facing, clinical) ───────────────

CREATE TABLE public.hidden_soul_files (
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
  ADD PRIMARY KEY (user_id, version);

CREATE INDEX idx_hidden_soul_files_latest
  ON public.hidden_soul_files(user_id, version DESC);

-- ── Claude Debug Traces ───────────────────────────────────────

CREATE TABLE public.claude_debug_traces (
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

CREATE INDEX claude_debug_traces_user_kind_created_idx
  ON public.claude_debug_traces(user_id, trace_kind, created_at DESC);

-- ── Triggers ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_touch_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER reflection_snapshots_touch_updated_at
BEFORE UPDATE ON public.reflection_snapshots
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
