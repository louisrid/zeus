-- 020 · Batch 3: point-in-time discipline, so the first serious backtest cannot leak.
-- 1. Every historical row carries when its facts were knowable. Backfilled from fixture kickoff.
alter table history_player_gw add column if not exists as_of timestamptz;
update history_player_gw h set as_of = f.kickoff
from (select season, gw, min(kickoff_utc) as kickoff from fixtures_archive group by season, gw) f
where h.season = f.season and h.gw = f.gw and h.as_of is null;

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
