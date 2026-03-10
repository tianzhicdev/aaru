-- Ba conversations: independent human-to-human threads unlocked by impression score

create table if not exists ba_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references users(id) on delete cascade,
  user_b_id uuid not null references users(id) on delete cascade,
  source_conversation_id uuid references conversations(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ba_conversations_pair_unique unique (user_a_id, user_b_id),
  constraint ba_conversations_pair_order check (user_a_id < user_b_id)
);

create table if not exists ba_messages (
  id uuid primary key default gen_random_uuid(),
  ba_conversation_id uuid not null references ba_conversations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ba_messages_conversation on ba_messages(ba_conversation_id, created_at);

-- RLS: service_role bypasses RLS, but enable it for safety
alter table ba_conversations enable row level security;
alter table ba_messages enable row level security;

create policy "service_role_ba_conversations" on ba_conversations
  for all using (true) with check (true);

create policy "service_role_ba_messages" on ba_messages
  for all using (true) with check (true);

-- Add to realtime publication
alter publication supabase_realtime add table ba_messages;
