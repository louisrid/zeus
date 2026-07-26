-- 016 · Scorelines on fixtures. The archive job stored only one side of each historical match, which
-- is what broke every opponent tag in the app and made Dixon-Coles unfittable.
alter table fixtures add column if not exists home_goals int;
alter table fixtures add column if not exists away_goals int;
create index if not exists fixtures_finished_idx on fixtures (season, finished);
