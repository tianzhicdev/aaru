create extension if not exists "pgcrypto";

create type public.agent_state as enum ('wandering', 'approaching', 'chatting', 'cooldown');
create type public.message_type as enum ('ka_generated', 'human_typed');

create table public.users (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  display_name text not null default 'Wandering Soul',
  instance_id uuid,
  is_npc boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.soul_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  personality text not null,
  interests text[] not null default '{}',
  values text[] not null default '{}',
  avoid_topics text[] not null default '{}',
  raw_input text not null default '',
  guessed_fields text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.avatars (
  user_id uuid primary key references public.users(id) on delete cascade,
  body_shape text not null,
  skin_tone text not null,
  hair_style text not null,
  hair_color text not null,
  eyes text not null,
  outfit_top text not null,
  outfit_bottom text not null,
  accessory text,
  aura_color text not null default '#d4af37',
  updated_at timestamptz not null default now()
);

create table public.world_instances (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  capacity integer not null default 100 check (capacity > 0),
  min_population integer not null default 30 check (min_population >= 0),
  is_online boolean not null default true,
  last_tick_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.agent_positions (
  user_id uuid primary key references public.users(id) on delete cascade,
  instance_id uuid not null references public.world_instances(id) on delete cascade,
  x double precision not null check (x >= 0 and x <= 1),
  y double precision not null check (y >= 0 and y <= 1),
  target_x double precision not null check (target_x >= 0 and target_x <= 1),
  target_y double precision not null check (target_y >= 0 and target_y <= 1),
  state public.agent_state not null default 'wandering',
  active_message text,
  conversation_id uuid,
  cooldown_until timestamptz,
  updated_at timestamptz not null default now()
);

create index agent_positions_instance_id_idx on public.agent_positions(instance_id);
create index agent_positions_state_idx on public.agent_positions(state);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.world_instances(id) on delete cascade,
  user_a_id uuid not null references public.users(id) on delete cascade,
  user_b_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'active',
  compatibility_score integer not null default 0 check (compatibility_score >= 0 and compatibility_score <= 100),
  compatibility_summary text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (user_a_id, user_b_id, started_at)
);

create index conversations_pair_idx on public.conversations(user_a_id, user_b_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  type public.message_type not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages(conversation_id, created_at);

create table public.compatibility_edges (
  user_id uuid not null references public.users(id) on delete cascade,
  target_user_id uuid not null references public.users(id) on delete cascade,
  score integer not null default 0 check (score >= 0 and score <= 100),
  summary text,
  ba_unlocked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, target_user_id)
);

create table public.news_items (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  headline text not null,
  summary text not null,
  source_url text,
  fetched_at timestamptz not null default now()
);

create index news_items_topic_idx on public.news_items(topic, fetched_at desc);

create table public.push_tokens (
  user_id uuid primary key references public.users(id) on delete cascade,
  apns_token text not null,
  updated_at timestamptz not null default now()
);

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

create trigger soul_profiles_touch_updated_at
before update on public.soul_profiles
for each row execute function public.touch_updated_at();

create trigger avatars_touch_updated_at
before update on public.avatars
for each row execute function public.touch_updated_at();

create trigger agent_positions_touch_updated_at
before update on public.agent_positions
for each row execute function public.touch_updated_at();

create trigger compatibility_edges_touch_updated_at
before update on public.compatibility_edges
for each row execute function public.touch_updated_at();

create trigger push_tokens_touch_updated_at
before update on public.push_tokens
for each row execute function public.touch_updated_at();

alter table public.users enable row level security;
alter table public.soul_profiles enable row level security;
alter table public.avatars enable row level security;
alter table public.agent_positions enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.compatibility_edges enable row level security;
alter table public.news_items enable row level security;
alter table public.push_tokens enable row level security;

create policy "service role full access users" on public.users for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access soul_profiles" on public.soul_profiles for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access avatars" on public.avatars for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access agent_positions" on public.agent_positions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access conversations" on public.conversations for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access messages" on public.messages for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access compatibility_edges" on public.compatibility_edges for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access news_items" on public.news_items for select using (true);
create policy "service role mutate news_items" on public.news_items for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service role full access push_tokens" on public.push_tokens for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

insert into public.world_instances (name, slug, capacity, min_population)
values ('Sunset Beach', 'sunset-beach', 100, 30);
