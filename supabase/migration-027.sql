-- Diagnostic inputs alongside every projection.
--
-- Nothing that decided a projection was ever stored, so tracing one number (Osula, GW1: engine 1.584,
-- displayed 5.3) meant rerunning the engine by hand to recover the team lambda, the rates used and the
-- shares. Every input that moves a projection is now written next to it, and the two version stamps let
-- staleness be decided by comparing inputs instead of by judging whether the answer looks too small.
alter table projections add column if not exists r_p_start numeric;
alter table projections add column if not exists r_p_cameo numeric;
alter table projections add column if not exists r_p60 numeric;
alter table projections add column if not exists r_exp_min_start numeric;
alter table projections add column if not exists r_exp_min_cameo numeric;
alter table projections add column if not exists r_exp_minutes numeric;
alter table projections add column if not exists minutes_source text;
alter table projections add column if not exists minutes_input_version text;
alter table projections add column if not exists lineup_version text;
alter table projections add column if not exists lambda_team numeric;
alter table projections add column if not exists lambda_opponent numeric;
alter table projections add column if not exists used_npxg90 numeric;
alter table projections add column if not exists used_xa90 numeric;
alter table projections add column if not exists rate_source text;
alter table projections add column if not exists goal_share numeric;
alter table projections add column if not exists assist_share numeric;
