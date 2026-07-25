-- 005 · Data integrity: archive rows must never reach the live UI, and bad rows must be visible.
-- Cause of the Burnley/£0.0 bug: archive_2526.mjs inserts last-season-only players with offset
-- fpl_ids and no price. `teams` had an archive flag; `players` did not, so nothing could filter them.

alter table players add column if not exists archive bool default false;

-- backfill: anything inserted by the archive job, or attached to an archive club
update players set archive = true where fpl_id >= 1000000;
update players set archive = true where team_id in (select id from teams where archive is true);

create index if not exists players_archive_idx on players (archive);

-- rows rejected at ingestion land here instead of vanishing silently
create table if not exists ingest_quarantine (
  id bigint generated always as identity primary key,
  job_name text,
  entity text,
  reason text,
  payload jsonb,
  seen_at timestamptz default now()
);
alter table ingest_quarantine enable row level security;
drop policy if exists anon_read_quarantine on ingest_quarantine;
create policy anon_read_quarantine on ingest_quarantine for select using (true);
