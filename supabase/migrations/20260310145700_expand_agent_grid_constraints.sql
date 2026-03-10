alter table public.agent_positions
  drop constraint if exists agent_positions_cell_x_check,
  drop constraint if exists agent_positions_cell_y_check,
  drop constraint if exists agent_positions_target_cell_x_check,
  drop constraint if exists agent_positions_target_cell_y_check;

alter table public.agent_positions
  add constraint agent_positions_cell_x_check check (cell_x >= 0 and cell_x < 50),
  add constraint agent_positions_cell_y_check check (cell_y >= 0 and cell_y < 50),
  add constraint agent_positions_target_cell_x_check check (target_cell_x >= 0 and target_cell_x < 50),
  add constraint agent_positions_target_cell_y_check check (target_cell_y >= 0 and target_cell_y < 50);
