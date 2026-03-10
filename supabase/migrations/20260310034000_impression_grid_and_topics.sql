alter table public.conversations
  add column if not exists impression_score integer not null default 0 check (impression_score >= 0 and impression_score <= 100),
  add column if not exists impression_summary text,
  add column if not exists topic_seed text[] not null default '{}';

create table if not exists public.impression_edges (
  user_id uuid not null references public.users(id) on delete cascade,
  target_user_id uuid not null references public.users(id) on delete cascade,
  score integer not null default 0 check (score >= 0 and score <= 100),
  summary text,
  ba_unlocked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, target_user_id)
);

drop trigger if exists impression_edges_touch_updated_at on public.impression_edges;
create trigger impression_edges_touch_updated_at
before update on public.impression_edges
for each row execute function public.touch_updated_at();

alter table public.impression_edges enable row level security;

drop policy if exists "service role full access impression_edges" on public.impression_edges;
create policy "service role full access impression_edges"
on public.impression_edges
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

insert into public.impression_edges (user_id, target_user_id, score, summary, ba_unlocked)
select user_id, target_user_id, score, summary, ba_unlocked
from public.compatibility_edges
on conflict (user_id, target_user_id) do update
set
  score = excluded.score,
  summary = excluded.summary,
  ba_unlocked = excluded.ba_unlocked,
  updated_at = now();

update public.conversations
set
  impression_score = compatibility_score,
  impression_summary = compatibility_summary
where impression_score = 0
  and compatibility_score > 0;
