-- 009 · Aggregates over the ten-season training set, so the Analysis page reads a handful of rows
-- rather than pulling 253,900 player-gameweeks into a browser.

create or replace view history_position_season as
select
  season,
  position,
  count(*)                                                as player_gameweeks,
  count(*) filter (where minutes > 0)                     as appearances,
  count(*) filter (where started)                         as starts,
  sum(minutes)                                            as minutes,
  sum(total_points)                                       as points,
  case when sum(minutes) > 0
       then round((sum(total_points)::numeric * 90) / sum(minutes), 3) end as points_per_90,
  case when count(*) filter (where started) > 0
       then round(sum(total_points) filter (where started)::numeric
                  / count(*) filter (where started), 3) end as points_per_start
from history_player_gw
group by season, position;

-- Value bands: what each price bracket actually returned, per position, per season.
create or replace view history_value_band as
select
  season,
  position,
  case
    when price is null then 'unknown'
    when price < 5   then 'under 5.0'
    when price < 7   then '5.0 to 6.9'
    when price < 9   then '7.0 to 8.9'
    when price < 11  then '9.0 to 10.9'
    else '11.0 and over'
  end                                                     as band,
  count(*) filter (where minutes > 0)                     as appearances,
  sum(minutes)                                            as minutes,
  case when sum(minutes) > 0
       then round((sum(total_points)::numeric * 90) / sum(minutes), 3) end as points_per_90
from history_player_gw
group by season, position, band;

-- Per-season coverage, so the page can state which seasons support which evidence.
create or replace view history_coverage as
select
  season,
  count(*)                                              as rows,
  count(*) filter (where xg is not null)                as rows_with_xg,
  count(*) filter (where defcon is not null)            as rows_with_defcon,
  count(distinct team) filter (where team is not null)  as clubs
from history_player_gw
group by season;
