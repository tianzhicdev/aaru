-- Presence tracking columns on users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS presence TEXT NOT NULL DEFAULT 'offline'
    CHECK (presence IN ('online', 'background', 'offline')),
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS daily_offline_convos INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_offline_convos_reset_at DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS last_notification_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_presence_heartbeat_idx
  ON public.users(presence, last_heartbeat_at);

-- Fix push_tokens: rename apns_token → device_token, add platform + is_active
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'push_tokens' AND column_name = 'apns_token'
  ) THEN
    ALTER TABLE public.push_tokens RENAME COLUMN apns_token TO device_token;
  END IF;
END $$;

ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'ios',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- RPC: update_heartbeat — sets presence='online', bumps last_heartbeat_at, resets daily counter if date rolled
CREATE OR REPLACE FUNCTION public.update_heartbeat(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.users
  SET
    presence = 'online',
    last_heartbeat_at = now(),
    daily_offline_convos = CASE
      WHEN daily_offline_convos_reset_at < CURRENT_DATE THEN 0
      ELSE daily_offline_convos
    END,
    daily_offline_convos_reset_at = CURRENT_DATE
  WHERE id = p_user_id;
END;
$$;

-- RPC: transition_stale_presence — online→background (30s), background→offline (15min)
CREATE OR REPLACE FUNCTION public.transition_stale_presence()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected INT := 0;
  cnt INT;
BEGIN
  -- online → background after 30s without heartbeat
  UPDATE public.users
  SET presence = 'background'
  WHERE presence = 'online'
    AND last_heartbeat_at < now() - INTERVAL '30 seconds';
  GET DIAGNOSTICS cnt = ROW_COUNT;
  affected := affected + cnt;

  -- background → offline after 15 min without heartbeat
  UPDATE public.users
  SET presence = 'offline'
  WHERE presence = 'background'
    AND last_heartbeat_at < now() - INTERVAL '15 minutes';
  GET DIAGNOSTICS cnt = ROW_COUNT;
  affected := affected + cnt;

  RETURN affected;
END;
$$;

-- RPC: increment_offline_convo — atomic daily counter increment with date rollover
CREATE OR REPLACE FUNCTION public.increment_offline_convo(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count INT;
BEGIN
  UPDATE public.users
  SET
    daily_offline_convos = CASE
      WHEN daily_offline_convos_reset_at < CURRENT_DATE THEN 1
      ELSE daily_offline_convos + 1
    END,
    daily_offline_convos_reset_at = CURRENT_DATE
  WHERE id = p_user_id
  RETURNING daily_offline_convos INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$;
