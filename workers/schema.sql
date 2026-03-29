-- Thumos Soul Mirror — Neon Postgres schema
-- Stripped of Supabase RLS policies (no auth.role() in Neon)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ────────────────────────────────────────────────────

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT 'Wandering Soul',
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

-- ── Soul Sessions ────────────────────────────────────────────

CREATE TABLE public.soul_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_number int NOT NULL,
  status text NOT NULL DEFAULT 'in_session'
    CHECK (status IN ('in_session', 'extracting', 'synthesizing', 'complete', 'failed')),
  exchange_count int DEFAULT 0,
  reflection_notes jsonb DEFAULT '[]'::jsonb,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  next_available_at timestamptz,
  extraction_error text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_soul_sessions_user_status ON public.soul_sessions(user_id, status);

-- ── Soul Messages ────────────────────────────────────────────

CREATE TABLE public.soul_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.soul_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_soul_messages_session ON public.soul_messages(session_id, created_at);

-- ── Visible Soul Files (user-facing, poetic) ────────────────

CREATE TABLE public.visible_soul_files (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
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
  created_at timestamptz DEFAULT now()
);

-- ── Hidden Soul Files (agent-facing, clinical) ───────────────

CREATE TABLE public.hidden_soul_files (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
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
  created_at timestamptz DEFAULT now()
);

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
