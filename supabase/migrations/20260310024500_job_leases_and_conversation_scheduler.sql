alter table public.world_instances
  add column if not exists next_tick_at timestamptz not null default now(),
  add column if not exists processing_owner text,
  add column if not exists processing_expires_at timestamptz;

alter table public.conversations
  add column if not exists turn_count integer not null default 0 check (turn_count >= 0),
  add column if not exists last_turn_at timestamptz,
  add column if not exists next_turn_at timestamptz,
  add column if not exists processing_owner text,
  add column if not exists processing_expires_at timestamptz;

create index if not exists world_instances_next_tick_at_idx on public.world_instances(next_tick_at);
create index if not exists world_instances_processing_expires_at_idx on public.world_instances(processing_expires_at);
create index if not exists conversations_next_turn_at_idx on public.conversations(next_turn_at) where status = 'active';
create index if not exists conversations_processing_expires_at_idx on public.conversations(processing_expires_at);

update public.world_instances
set next_tick_at = coalesce(next_tick_at, now())
where next_tick_at is null;

update public.conversations
set
  turn_count = (
    select count(*)::integer
    from public.messages
    where messages.conversation_id = conversations.id
  ),
  last_turn_at = (
    select max(messages.created_at)
    from public.messages
    where messages.conversation_id = conversations.id
  ),
  next_turn_at = case
    when status = 'active' then coalesce((
      select max(messages.created_at)
      from public.messages
      where messages.conversation_id = conversations.id
    ), started_at)
    else null
  end
where true;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'aaru-advance-conversations') then
    perform cron.unschedule('aaru-advance-conversations');
  end if;
exception when undefined_table then
  null;
end
$$;

do $$
begin
  perform cron.schedule(
    'aaru-advance-conversations',
    '* * * * *',
    $cron$
      select
        net.http_post(
          url := 'https://uuggqsywcpqmbqzwxdga.supabase.co/functions/v1/advance-conversations',
          headers := '{
            "Content-Type":"application/json",
            "Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Z2dxc3l3Y3BxbWJxend4ZGdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODk3NjIsImV4cCI6MjA4ODY2NTc2Mn0.zRFOTxQiwF7NJXhKTsnU0G1Zv9E8l_zByb8EZ04OWJ0",
            "apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Z2dxc3l3Y3BxbWJxend4ZGdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODk3NjIsImV4cCI6MjA4ODY2NTc2Mn0.zRFOTxQiwF7NJXhKTsnU0G1Zv9E8l_zByb8EZ04OWJ0"
          }'::jsonb,
          body := '{"source":"pg_cron"}'::jsonb
        );
    $cron$
  );
exception when undefined_function then
  null;
end
$$;
