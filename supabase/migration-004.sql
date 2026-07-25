-- Migration 004 · Package 3 THE BRAIN (run once in Supabase SQL Editor)

-- ── 1. The xP gate. BINDING: the UI reads this row and may not use the term xP while
--    passed = false. Flipped only when the walk-forward calibration run passes (ticket B-08).
create table if not exists model_gates (
  key text primary key,
  passed bool default false,
  upgrade_date date,
  note text,
  updated_at timestamptz default now()
);
insert into model_gates (key, passed, upgrade_date, note)
values ('xp_visible', false, '2026-08-07',
        'Projections render as INTERIM SCORE until walk-forward calibration + ablation pass.')
on conflict (key) do nothing;

-- ── 2. Interim parameter register: what a projection run treated as provisional, and when the
--    fitted value lands. Written by jobs/projections_run.mjs on every run.
create table if not exists engine_run_params (
  id bigint generated always as identity primary key,
  model_version text,
  param_key text,
  upgrade_date date,
  recorded_at timestamptz default now()
);

-- ── 3. Package 2 fix: jobs/bps_backtest.mjs writes columns (model, run_at) and metric names
--    (bps_mae, bonus_exact_rate, ...) that the v1 schema's CHECK constraint rejected, so that
--    job could not persist its results. Columns added and the constraint relaxed rather than
--    the shipped job being changed.
alter table calibration_metrics add column if not exists model text;
alter table calibration_metrics add column if not exists run_at timestamptz default now();
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'calibration_metrics'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%metric%';
  if c is not null then execute format('alter table calibration_metrics drop constraint %I', c); end if;
end $$;

-- ── 4. Projections columns the engine writes that v1 did not carry.
alter table projections add column if not exists e_goals numeric;
alter table projections add column if not exists e_assists numeric;
alter table projections add column if not exists odds_backed bool default false;
alter table minutes_forecasts add column if not exists p60_given_start numeric;

-- ── 5. Set-piece duty needs a stable upsert key for the presser pipeline.
create unique index if not exists set_piece_duty_unique
  on set_piece_duty (team_id, player_id, kind);

-- ── 6. Read paths the tool uses. Views inherit the anon read policy of their base tables.

-- Prior-season aggregate per player: one row each, so the browser never pulls 26k archive rows.
create or replace view player_prior_season as
  select pms.player_id,
         sum(pms.total_points)            as points,
         sum(pms.minutes)                 as minutes,
         round(sum(pms.minutes) / 90.0, 2) as nineties,
         sum(pms.goals)                   as goals,
         sum(pms.assists)                 as assists,
         count(*) filter (where pms.started)                                as starts,
         count(*) filter (where pms.started and pms.minutes >= 60)          as starts60,
         count(*) filter (where not pms.started and pms.minutes > 0)        as cameos,
         sum(case when pms.started then pms.minutes else 0 end)             as start_minutes,
         sum(case when not pms.started then pms.minutes else 0 end)         as cameo_minutes,
         sum(coalesce(pms.clearances_blocks_interceptions,0) + coalesce(pms.tackles,0)) as cbit,
         sum(coalesce(pms.recoveries,0))  as recoveries,
         sum(coalesce(pms.key_passes,0))  as key_passes,
         sum(coalesce(pms.saves,0))       as saves,
         sum(coalesce(pms.yellow,0))      as yellow,
         sum(coalesce(pms.red,0))         as red,
         sum(coalesce(pms.own_goals,0))   as own_goals,
         sum(coalesce(pms.pens_taken,0))  as pens_taken,
         sum(coalesce(pms.pens_scored,0)) as pens_scored,
         case when sum(pms.minutes) >= 90
              then round(sum(pms.total_points) / (sum(pms.minutes) / 90.0), 3)
              else null end as points_per_90
    from player_match_stats pms
    join fixtures f on f.id = pms.fixture_id
   where f.season = '2025-26'
   group by pms.player_id;

-- Latest market goal environment per fixture (Layer 0 output, most recent snapshot wins).
create or replace view fixture_goal_env as
  select f.id as fixture_id, f.gw, f.home_team, f.away_team, f.kickoff_utc,
         ig.lambda_home, ig.lambda_away, ig.fit_residual, ig.deoverround_method, ig.computed_at
    from fixtures f
    join lateral (
      select * from implied_goals i
       where i.fixture_id = f.id
       order by i.computed_at desc
       limit 1
    ) ig on true
   where f.season = '2026-27';
