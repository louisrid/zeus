-- FPL Campaign schema v1 — mirrors docs/build/01-architecture-and-model.md §2
-- Run once in Supabase SQL Editor. Idempotent (IF NOT EXISTS throughout).

-- ═══ Reference / raw ═══
create table if not exists teams (
  id bigint generated always as identity primary key,
  fpl_id int unique not null,
  name text not null,
  short_name text not null
);

create table if not exists players (
  id bigint generated always as identity primary key,
  fpl_id int unique not null,
  team_id bigint references teams(id),
  position text check (position in ('GKP','DEF','MID','FWD')),
  name text not null,
  web_name text not null,
  price numeric(4,1),
  status text,
  chance_of_playing int,
  news text,
  selected_by_pct numeric,
  updated_at timestamptz default now()
);

create table if not exists gameweeks (
  id bigint generated always as identity primary key,
  gw int unique not null,
  deadline_utc timestamptz,
  finished bool default false,
  data_checked bool default false,
  is_blank bool default false,
  is_double bool default false
);

create table if not exists fixtures (
  id bigint generated always as identity primary key,
  fpl_id int unique not null,
  gw int,
  home_team bigint references teams(id),
  away_team bigint references teams(id),
  kickoff_utc timestamptz,
  finished bool default false,
  home_goals int,
  away_goals int
);

create table if not exists player_match_stats (
  player_id bigint references players(id),
  fixture_id bigint references fixtures(id),
  minutes int, goals int, assists int,
  xg numeric, xa numeric, shots int, shots_on_target int, key_passes int,
  saves int, goals_conceded int, clearances_blocks_interceptions int,
  tackles int, recoveries int, defcon_points int,
  yellow int, red int, own_goals int,
  pens_taken int, pens_scored int, pens_saved int,
  bps int, bonus int, total_points int,
  started bool, sub_on_min int, sub_off_min int,
  source text,
  primary key (player_id, fixture_id)
);

create table if not exists shots (
  id bigint generated always as identity primary key,
  player_id bigint references players(id),
  fixture_id bigint references fixtures(id),
  minute int, xg numeric, situation text, result text,
  is_penalty bool default false, is_big_chance bool default false,
  source text
);

create table if not exists managers (
  id bigint generated always as identity primary key,
  team_id bigint references teams(id),
  name text,
  appointed_date date
);

create or replace view player_gw_points as
  select pms.player_id, f.gw,
         sum(pms.total_points) as points,
         sum(pms.minutes) as minutes,
         sum(pms.goals) as goals,
         sum(pms.assists) as assists,
         sum(case when pms.goals_conceded = 0 and pms.minutes >= 60 then 1 else 0 end) as cs
  from player_match_stats pms join fixtures f on f.id = pms.fixture_id
  group by pms.player_id, f.gw;

-- ═══ Market / odds ═══
create table if not exists odds_snapshots (
  id bigint generated always as identity primary key,
  fixture_id bigint references fixtures(id),
  source text, fetched_at timestamptz default now(),
  h numeric, d numeric, a numeric, over25 numeric, under25 numeric,
  bookmaker text
);

create table if not exists implied_goals (
  id bigint generated always as identity primary key,
  fixture_id bigint references fixtures(id),
  odds_snapshot_id bigint references odds_snapshots(id),
  lambda_home numeric, lambda_away numeric,
  deoverround_method text, fit_residual numeric,
  computed_at timestamptz default now()
);

create table if not exists api_credits (
  id bigint generated always as identity primary key,
  source text, used int, remaining int, captured_at timestamptz default now()
);

-- ═══ Signals / forecasts ═══
create table if not exists presser_signals (
  id bigint generated always as identity primary key,
  player_id bigint references players(id),
  gw int, signal text check (signal in ('out','doubt','rested','confirmed')),
  confidence numeric, source_url text, summary text,
  captured_at timestamptz default now()
);

create table if not exists set_piece_duty (
  id bigint generated always as identity primary key,
  team_id bigint references teams(id),
  player_id bigint references players(id),
  kind text check (kind in ('pen','fk_direct','corner')),
  rank int, as_of timestamptz default now(),
  source text check (source in ('presser','observed'))
);

create table if not exists minutes_forecasts (
  player_id bigint references players(id),
  gw int, model_version text,
  p_start numeric, p_cameo numeric, p60 numeric,
  exp_min_start numeric, exp_min_cameo numeric,
  wc_load_flag bool default false,
  primary key (player_id, gw, model_version)
);

create table if not exists projections (
  player_id bigint references players(id),
  gw int, model_version text,
  ep_mean numeric, ep_sd numeric,
  p_goal numeric, p_assist numeric, p_cs numeric,
  e_bonus numeric, e_defcon numeric,
  quantiles jsonb, p_12plus numeric,
  ep_home numeric, ep_away numeric,
  prior_blend numeric default 0,
  computed_at timestamptz default now(),
  primary key (player_id, gw, model_version)
);

create table if not exists sim_artifacts (
  id bigint generated always as identity primary key,
  gw int, model_version text,
  fixture_id bigint references fixtures(id),
  payload_path text
);

create table if not exists team_covariances (
  gw int, model_version text,
  team_id bigint references teams(id),
  matrix jsonb,
  primary key (gw, model_version, team_id)
);

-- ═══ Prices / ownership / field ═══
create table if not exists transfer_velocity (
  id bigint generated always as identity primary key,
  player_id bigint references players(id),
  captured_at timestamptz default now(),
  transfers_in_event int, transfers_out_event int,
  net_rate_per_hr numeric,
  rise_risk text check (rise_risk in ('low','med','high'))
);

create table if not exists player_price_history (
  id bigint generated always as identity primary key,
  player_id bigint references players(id),
  date date, old_price numeric(4,1), new_price numeric(4,1)
);

create table if not exists eo_snapshots (
  gw int, scope text check (scope in ('overall','top10k_proxy','top1k_proxy')),
  player_id bigint references players(id),
  eo numeric, captured_at timestamptz default now(),
  primary key (gw, scope, player_id)
);

create table if not exists rival_squads (
  gw int, entry_id bigint,
  rank int, picks jsonb, chip text, captured_at timestamptz default now(),
  primary key (gw, entry_id)
);

create table if not exists my_squad (
  gw int primary key,
  entry_id bigint, picks jsonb, bank numeric, team_value numeric,
  chip text, captured_at timestamptz default now()
);

-- ═══ Decisions / ops ═══
create table if not exists strategy_findings (
  id bigint generated always as identity primary key,
  study_version text,
  section text check (section in ('structures','value_bands','premium_count','ownership','behaviour')),
  payload jsonb, computed_at timestamptz default now(), next_refresh_gw int
);

create table if not exists transfer_plans (
  id bigint generated always as identity primary key,
  moves jsonb, ft_banked_path jsonb, eval jsonb, conflict_flags jsonb,
  status text default 'active' check (status in ('active','done','abandoned')),
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists squad_drafts (
  id bigint generated always as identity primary key,
  name text, mode text check (mode in ('guided','free')),
  squad jsonb, eval_cache jsonb,
  is_plan_of_record bool default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists gw_picks (
  gw int primary key,
  entry_id bigint, picks jsonb, captain int, vice int, chip text,
  frozen_projections jsonb, predicted_total numeric, actual_total numeric,
  settled_at timestamptz, captured_at timestamptz default now()
);

create table if not exists analyst_memory (
  id bigint generated always as identity primary key,
  gw int,
  kind text check (kind in ('decision_outcome','pick_result','captaincy_outcome','component_miss','analyst_conclusion')),
  payload jsonb, refs jsonb,
  created_by text check (created_by in ('system','analyst')),
  created_at timestamptz default now()
);

create table if not exists analyst_calls (
  id bigint generated always as identity primary key,
  asked_at timestamptz default now(),
  screen text, question text,
  payload_tokens int, output_tokens int, cost_usd numeric,
  response text, memory_written bool default false
);

create table if not exists chip_plan (
  id bigint generated always as identity primary key,
  chip_set int check (chip_set in (1,2)), chip text, planned_gw int,
  status text check (status in ('skeleton','committed','played','expired')),
  updated_at timestamptz default now()
);

create table if not exists calibration_metrics (
  id bigint generated always as identity primary key,
  model_version text, component text,
  metric text check (metric in ('logloss','crps','reliability_bucket')),
  "window" text, value numeric, computed_at timestamptz default now()
);

create table if not exists pipeline_heartbeats (
  job_name text primary key,
  last_success_at timestamptz, last_run_at timestamptz,
  status text, message text
);

create table if not exists rulesets (
  version text primary key,
  verified_at timestamptz, payload jsonb, notes text
);

create table if not exists model_versions (
  version text primary key,
  created_at timestamptz default now(),
  git_sha text, data_snapshot_at timestamptz, ruleset_version text, notes text
);

-- ═══ RLS: anon = read-only everywhere; writes only via service key (bypasses RLS) ═══
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t.tablename);
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t.tablename and policyname = 'anon_read'
    ) then
      execute format('create policy anon_read on %I for select using (true)', t.tablename);
    end if;
  end loop;
end $$;
