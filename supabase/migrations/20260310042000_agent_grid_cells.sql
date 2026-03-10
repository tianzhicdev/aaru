alter table public.agent_positions
  add column if not exists cell_x integer,
  add column if not exists cell_y integer,
  add column if not exists target_cell_x integer,
  add column if not exists target_cell_y integer;

update public.agent_positions
set
  cell_x = least(9, greatest(0, floor(x * 10)::integer)),
  cell_y = least(13, greatest(0, floor(y * 14)::integer)),
  target_cell_x = least(9, greatest(0, floor(target_x * 10)::integer)),
  target_cell_y = least(13, greatest(0, floor(target_y * 14)::integer))
where cell_x is null
   or cell_y is null
   or target_cell_x is null
   or target_cell_y is null;

alter table public.agent_positions
  alter column cell_x set not null,
  alter column cell_y set not null,
  alter column target_cell_x set not null,
  alter column target_cell_y set not null;

alter table public.agent_positions
  add constraint agent_positions_cell_x_check check (cell_x >= 0 and cell_x < 10),
  add constraint agent_positions_cell_y_check check (cell_y >= 0 and cell_y < 14),
  add constraint agent_positions_target_cell_x_check check (target_cell_x >= 0 and target_cell_x < 10),
  add constraint agent_positions_target_cell_y_check check (target_cell_y >= 0 and target_cell_y < 14);
