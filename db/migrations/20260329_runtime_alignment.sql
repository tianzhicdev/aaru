-- Align the live Neon schema with the Cloudflare Workers runtime.
-- Safe to re-run.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

UPDATE public.users
SET last_active_at = COALESCE(last_active_at, updated_at, created_at, now())
WHERE last_active_at IS NULL;

ALTER TABLE public.users
  ALTER COLUMN last_active_at SET DEFAULT now();

ALTER TABLE public.users
  ALTER COLUMN last_active_at SET NOT NULL;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS reflection_note;

ALTER TABLE public.soul_messages
  DROP CONSTRAINT IF EXISTS soul_messages_session_id_fkey;

ALTER TABLE public.soul_messages
  DROP COLUMN IF EXISTS session_id;

CREATE INDEX IF NOT EXISTS idx_soul_messages_user_created
  ON public.soul_messages(user_id, created_at);

DROP TABLE IF EXISTS public.soul_sessions;
