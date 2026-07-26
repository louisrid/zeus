-- 013 · Component attribution. Every projection miss must be traceable to one component, otherwise
-- the baseline gate tells you the model is wrong without telling you which part.
create table if not exists component_attribution (
  id bigint generated always as identity primary key,
  run_at timestamptz default now(),
  held_out_season text not null,
  position text,                    -- null means all positions
  component text not null,          -- appearance, goals, assists, clean_sheet, bonus, saves, negatives
  total_points numeric,             -- points this component contributed across the season
  share_of_movement numeric,        -- share of all absolute point movement, 0 to 1
  n int,
  note text
);
create index if not exists component_attribution_run_idx on component_attribution (run_at desc);
alter table component_attribution enable row level security;
drop policy if exists anon_read_component_attribution on component_attribution;
create policy anon_read_component_attribution on component_attribution for select using (true);
