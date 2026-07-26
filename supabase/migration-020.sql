-- 020 · Batch 3: point-in-time discipline, so the first serious backtest cannot leak.

-- 1. Every historical row carries when its facts became knowable. There is no archived kickoff table,
-- so backfill uses the honest approximation available in the row itself: kickoff_utc where the
-- archive carries it, otherwise null. Null means "timing unknown", which is true, and the leakage
-- guard protects everything written from today onward regardless.
alter table history_player_gw add column if not exists as_of timestamptz;
update history_player_gw set as_of = kickoff_utc where as_of is null and kickoff_utc is not null;

-- 2. Daily snapshots of the mutable player fields the FPL API overwrites in place.
create table if not exists player_snapshots (
  id bigint generated always as identity primary key,
  fpl_id int not null,
  snapshot_date date not null default current_date,
  price numeric, status text, chance_of_playing int,
  total_points int, form numeric, ppg numeric, minutes int,
  selected_by_pct numeric,
  created_at timestamptz not null default now(),
  unique (fpl_id, snapshot_date)
);
