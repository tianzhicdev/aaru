create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  device_id text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists device_sessions_user_id_idx on public.device_sessions(user_id);
create index if not exists device_sessions_device_id_idx on public.device_sessions(device_id);
create index if not exists device_sessions_expires_at_idx on public.device_sessions(expires_at);

alter table public.device_sessions enable row level security;

drop policy if exists "service role full access device_sessions" on public.device_sessions;
create policy "service role full access device_sessions"
on public.device_sessions
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

do $$
begin
  alter publication supabase_realtime add table public.agent_positions;
exception when duplicate_object then
  null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then
  null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then
  null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.compatibility_edges;
exception when duplicate_object then
  null;
end
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'aaru-advance-worlds') then
    perform cron.unschedule('aaru-advance-worlds');
  end if;
exception when undefined_table then
  null;
end
$$;

do $$
begin
  perform cron.schedule(
    'aaru-advance-worlds',
    '* * * * *',
    $cron$
      select
        net.http_post(
          url := 'https://uuggqsywcpqmbqzwxdga.supabase.co/functions/v1/advance-worlds',
          headers := '{"Content-Type":"application/json"}'::jsonb,
          body := '{"source":"pg_cron"}'::jsonb
        );
    $cron$
  );
exception when undefined_function then
  null;
end
$$;
