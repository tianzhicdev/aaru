alter table public.avatars
  add column if not exists sprite_id text;

alter table public.avatars
  alter column sprite_id set default 'm01_explorer';

update public.avatars
set sprite_id = 'm01_explorer'
where sprite_id is null;

alter table public.avatars
  alter column sprite_id set not null;
