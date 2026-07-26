-- 012 · Minutes scorecard. Minutes multiply every other component, and they are far less noisy than
-- points, so error there is measurable and fixable. This gets its own scorecard rather than being
-- folded into the points gate.
create table if not exists minutes_scorecard (
  id bigint generated always as identity primary key,
  run_at timestamptz default now(),
  held_out_season text not null,
  bucket text not null,            -- 'ALL', 'settled', 'rotation-heavy', 'unknown'
  n int,
  brier_start numeric,             -- lower is better; the constant base rate is the benchmark
  brier_60 numeric,
  mae_minutes numeric,
  start_accuracy numeric,
  baseline_brier_start numeric,    -- always predicting the league base rate
  beats_baseline bool,
  note text
);
create index if not exists minutes_scorecard_run_idx on minutes_scorecard (run_at desc);
alter table minutes_scorecard enable row level security;
drop policy if exists anon_read_minutes_scorecard on minutes_scorecard;
create policy anon_read_minutes_scorecard on minutes_scorecard for select using (true);
