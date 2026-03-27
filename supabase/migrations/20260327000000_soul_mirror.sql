-- AARU Soul Mirror — complete schema
-- Single migration for a clean start

create extension if not exists "pgcrypto";

-- ── Users ────────────────────────────────────────────────────

create table public.users (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  display_name text not null default 'Wandering Soul',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Device Sessions ──────────────────────────────────────────

create table public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  device_id text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index device_sessions_user_id_idx on public.device_sessions(user_id);
create index device_sessions_device_id_idx on public.device_sessions(device_id);
create index device_sessions_expires_at_idx on public.device_sessions(expires_at);

-- ── Soul Sessions ────────────────────────────────────────────

create table public.soul_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_number int not null,
  status text not null default 'in_session'
    check (status in ('in_session', 'extracting', 'synthesizing', 'complete', 'failed')),
  exchange_count int default 0,
  reflection_notes jsonb default '[]'::jsonb,
  started_at timestamptz default now(),
  completed_at timestamptz,
  next_available_at timestamptz,
  extraction_error text,
  created_at timestamptz default now()
);

create index idx_soul_sessions_user_status on public.soul_sessions(user_id, status);

-- ── Soul Messages ────────────────────────────────────────────

create table public.soul_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.soul_sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

create index idx_soul_messages_session on public.soul_messages(session_id, created_at);

-- ── Visible Soul Files (user-facing, poetic) ────────────────

create table public.visible_soul_files (
  user_id uuid primary key references public.users(id) on delete cascade,
  version int not null default 1,
  last_updated timestamptz not null default now(),
  portrait text,
  how_you_move text default '',
  how_you_think text default '',
  how_you_connect text default '',
  what_you_carry text default '',
  what_lights_you_up text default '',
  your_contradictions text default '',
  your_voice text default '',
  crystallized_moments jsonb default '[]'::jsonb,
  open_threads jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- ── Hidden Soul Files (agent-facing, clinical) ───────────────

create table public.hidden_soul_files (
  user_id uuid primary key references public.users(id) on delete cascade,
  version int not null default 1,
  last_updated timestamptz not null default now(),
  confidence text not null default 'low'
    check (confidence in ('low', 'medium', 'high')),
  expert_reflections jsonb default '{}'::jsonb,
  core_drivers jsonb default '[]'::jsonb,
  core_values jsonb default '[]'::jsonb,
  voice jsonb default '{}'::jsonb,
  depth_map jsonb default '{}'::jsonb,
  analyst_notes jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- ── Triggers ─────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_touch_updated_at
before update on public.users
for each row execute function public.touch_updated_at();

-- ── Row Level Security ───────────────────────────────────────

alter table public.users enable row level security;
alter table public.device_sessions enable row level security;
alter table public.soul_sessions enable row level security;
alter table public.soul_messages enable row level security;
alter table public.visible_soul_files enable row level security;
alter table public.hidden_soul_files enable row level security;

create policy "service role full access users" on public.users
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access device_sessions" on public.device_sessions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access soul_sessions" on public.soul_sessions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access soul_messages" on public.soul_messages
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access visible_soul_files" on public.visible_soul_files
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access hidden_soul_files" on public.hidden_soul_files
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
