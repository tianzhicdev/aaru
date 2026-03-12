-- Soul Profile V2: structured values + narrative identity

-- Convert values from text[] to jsonb
alter table public.soul_profiles
  add column values_v2 jsonb not null default '{"self_transcendence":0.5,"self_enhancement":0.5,"openness_to_change":0.5,"conservation":0.5,"expressed":[]}';

alter table public.soul_profiles
  add column narrative jsonb not null default '{"formative_stories":[],"self_defining_memories":[],"narrative_themes":[]}';

-- Drop old values column, rename new one
alter table public.soul_profiles drop column "values";
alter table public.soul_profiles rename column values_v2 to "values";

-- Add encounter tracking to impression edges
alter table public.impression_edges
  add column encounter_count integer not null default 0;
