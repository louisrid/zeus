-- 007 · Multi-season training set and fitted parameters.
-- history_player_gw holds raw player-gameweeks from the open FPL dataset, 2016/17 onward.
-- It deliberately has no foreign key to players: most of these people are not in the current
-- squad list, and the model fits on the rows, not on today's roster.

create table if not exists history_player_gw (
  id bigint generated always as identity primary key,
  season text not null,
  competition text not null default 'PL',
  gw int not null,
  element int,
  player_name text not null,
  position text check (position in ('GKP','DEF','MID','FWD')),
  team text,
  opponent_team int,
  was_home bool,
  minutes int,
  started bool,
  total_points int,
  goals int, assists int,
  clean_sheets int, goals_conceded int, saves int,
  yellow int, red int, own_goals int,
  pens_missed int, pens_saved int,
  bps int, bonus int,
  xg numeric, xa numeric,
  defcon int,
  price numeric(4,1),
  kickoff_utc timestamptz,
  unique (season, gw, player_name, element)
);
create index if not exists hpg_season_idx on history_player_gw (season, gw);
create index if not exists hpg_position_idx on history_player_gw (position);
create index if not exists hpg_team_idx on history_player_gw (season, team);

alter table history_player_gw enable row level security;
drop policy if exists anon_read_history on history_player_gw;
create policy anon_read_history on history_player_gw for select using (true);

-- Fitted parameters, with the fit recorded so no value in the app is ever hand-picked.
create table if not exists fitted_params (
  key text primary key,
  value jsonb not null,
  fitted_on text,
  method text,
  metric text,
  fitted_at timestamptz default now()
);
alter table fitted_params enable row level security;
drop policy if exists anon_read_fitted on fitted_params;
create policy anon_read_fitted on fitted_params for select using (true);
