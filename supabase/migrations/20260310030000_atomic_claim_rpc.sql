create or replace function public.claim_world_instance(
  p_instance_id uuid,
  p_owner text,
  p_lease_until timestamptz
)
returns boolean
language sql
security definer
as $$
  with updated as (
    update public.world_instances
    set
      processing_owner = p_owner,
      processing_expires_at = p_lease_until
    where id = p_instance_id
      and (processing_owner is null or processing_expires_at <= now())
    returning 1
  )
  select exists(select 1 from updated);
$$;

create or replace function public.claim_due_world_instances(
  p_owner text,
  p_lease_until timestamptz,
  p_due_before timestamptz,
  p_limit integer default 5
)
returns setof public.world_instances
language sql
security definer
as $$
  with due as (
    select id
    from public.world_instances
    where is_online = true
      and next_tick_at <= p_due_before
      and (processing_owner is null or processing_expires_at <= p_due_before)
    order by next_tick_at asc
    limit p_limit
    for update skip locked
  ),
  updated as (
    update public.world_instances wi
    set
      processing_owner = p_owner,
      processing_expires_at = p_lease_until
    from due
    where wi.id = due.id
    returning wi.*
  )
  select * from updated;
$$;

create or replace function public.claim_conversation(
  p_conversation_id uuid,
  p_owner text,
  p_lease_until timestamptz,
  p_due_before timestamptz
)
returns boolean
language sql
security definer
as $$
  with updated as (
    update public.conversations
    set
      processing_owner = p_owner,
      processing_expires_at = p_lease_until
    where id = p_conversation_id
      and status = 'active'
      and next_turn_at <= p_due_before
      and (processing_owner is null or processing_expires_at <= p_due_before)
    returning 1
  )
  select exists(select 1 from updated);
$$;

create or replace function public.claim_due_conversations(
  p_owner text,
  p_lease_until timestamptz,
  p_due_before timestamptz,
  p_limit integer default 20
)
returns setof public.conversations
language sql
security definer
as $$
  with due as (
    select id
    from public.conversations
    where status = 'active'
      and next_turn_at <= p_due_before
      and (processing_owner is null or processing_expires_at <= p_due_before)
    order by next_turn_at asc
    limit p_limit
    for update skip locked
  ),
  updated as (
    update public.conversations c
    set
      processing_owner = p_owner,
      processing_expires_at = p_lease_until
    from due
    where c.id = due.id
    returning c.*
  )
  select * from updated;
$$;
