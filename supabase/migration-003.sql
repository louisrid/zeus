-- Migration 003 · Package 2 THE FUEL (run once in Supabase SQL Editor)
alter table players add column if not exists total_points int;
alter table players add column if not exists form numeric;
alter table players add column if not exists ppg numeric;
alter table players add column if not exists minutes int;
alter table players add column if not exists transfers_in_event int;
alter table players add column if not exists transfers_out_event int;
alter table players add column if not exists xg_fpl numeric;
alter table players add column if not exists xa_fpl numeric;
alter table teams add column if not exists xg_for numeric;
alter table teams add column if not exists xg_against numeric;
alter table teams add column if not exists understat_updated timestamptz;
alter table teams add column if not exists archive bool default false;
alter table fixtures add column if not exists season text default '2026-27';
create table if not exists understat_player_season (
  player_id bigint references players(id),
  season text,
  games int, minutes int,
  xg numeric, xa numeric, npxg numeric,
  shots int, key_passes int,
  updated_at timestamptz default now(),
  primary key (player_id, season)
);
alter table understat_player_season enable row level security;
drop policy if exists anon_read_understat on understat_player_season;
create policy anon_read_understat on understat_player_season for select using (true);
alter table player_match_stats add column if not exists pens_missed int;
