-- 006 · Per-competition history. A player's record must be separable by season AND competition,
-- so a Championship or foreign-league season is its own dataset, never merged into a PL record.
-- Nothing scrapes non-PL competitions yet; this is the model the loader will write into.

alter table fixtures add column if not exists competition text default 'PL';
update fixtures set competition = 'PL' where competition is null;

alter table understat_player_season add column if not exists competition text default 'PL';
update understat_player_season set competition = 'PL' where competition is null;

-- primary key must include competition, or the same player-season in two leagues collides
alter table understat_player_season drop constraint if exists understat_player_season_pkey;
alter table understat_player_season
  add constraint understat_player_season_pkey primary key (player_id, season, competition);

-- One row per player per season per competition, aggregated from match rows. This is what the
-- profile history block and the promoted-player prior both read.
create or replace view player_season_by_competition as
select
  pms.player_id,
  f.season,
  coalesce(f.competition, 'PL')          as competition,
  count(*)                               as appearances,
  sum(case when pms.started then 1 else 0 end) as starts,
  sum(pms.minutes)                       as minutes,
  sum(pms.goals)                         as goals,
  sum(pms.assists)                       as assists,
  sum(pms.total_points)                  as points,
  round(sum(pms.xg)::numeric, 2)         as xg,
  round(sum(pms.xa)::numeric, 2)         as xa,
  case when sum(pms.minutes) > 0
       then round((sum(pms.total_points)::numeric * 90) / sum(pms.minutes), 3)
       else null end                     as points_per_90
from player_match_stats pms
join fixtures f on f.id = pms.fixture_id
group by pms.player_id, f.season, coalesce(f.competition, 'PL');

create index if not exists fixtures_competition_idx on fixtures (competition, season);
