-- 011 · Baseline gate results. calibration_metrics was shaped for distribution metrics; the gate
-- needs point-error metrics per position per model, plus a verdict, so it gets its own table.
create table if not exists baseline_gate (
  id bigint generated always as identity primary key,
  run_at timestamptz default now(),
  held_out_season text not null,
  model text not null,           -- 'blend', 'prior_season_ppg', 'position_mean', 'zero'
  position text,                 -- null means all positions together
  n int,                         -- player-gameweeks scored
  mae numeric,
  rmse numeric,
  spearman numeric,             -- mean rank correlation per gameweek; THIS decides the verdict
  gameweeks int,
  beats_best_baseline bool,      -- true only when this model's MAE is lower than every baseline
  note text
);
create index if not exists baseline_gate_run_idx on baseline_gate (run_at desc);
alter table baseline_gate enable row level security;
drop policy if exists anon_read_baseline on baseline_gate;
create policy anon_read_baseline on baseline_gate for select using (true);
