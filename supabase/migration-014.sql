-- 014 · Reliability curves and minutes coverage.
-- Reliability answers the question that decides whether a number may be called xP: when the model
-- says 6.0, does 6.0 actually happen? Coverage answers whether the minutes scaling is reaching
-- players at all, because the scaling is the largest single source of accuracy in the scorer.
create table if not exists reliability_bins (
  id bigint generated always as identity primary key,
  run_at timestamptz default now(),
  held_out_season text not null,
  position text,                 -- null means all positions
  bin int,                       -- 1 is the lowest predicted quintile
  n int,
  mean_predicted numeric,
  mean_actual numeric,
  bias numeric,                  -- predicted minus actual; positive means over-predicting
  note text
);
create index if not exists reliability_bins_run_idx on reliability_bins (run_at desc);
alter table reliability_bins enable row level security;
drop policy if exists anon_read_reliability on reliability_bins;
create policy anon_read_reliability on reliability_bins for select using (true);

create table if not exists minutes_coverage (
  id bigint generated always as identity primary key,
  run_at timestamptz default now(),
  gw int,
  players_total int,
  players_with_forecast int,
  coverage numeric,              -- 0 to 1
  note text
);
alter table minutes_coverage enable row level security;
drop policy if exists anon_read_minutes_coverage on minutes_coverage;
create policy anon_read_minutes_coverage on minutes_coverage for select using (true);
