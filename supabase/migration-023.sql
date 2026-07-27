-- 023 - Predicted line-ups from Fantasy Football Pundit.
-- Our minutes model answers "how likely is this player to start", which is a different question from
-- "who does this manager actually pick". The second is reporting, and a published source that follows
-- press conferences and team leaks does it better than a model can.
create table if not exists predicted_lineups (
  id bigint generated always as identity primary key,
  club text not null,              -- the club name as the source writes it
  fpl_team_id int,                 -- resolved against our teams table where possible
  formation text,                  -- derived from the source's detailed positions, e.g. 5-2-3
  fixture text,                     -- as published, e.g. "Coventry (H)"
  source_updated text,             -- the source's own "Lineup Last Updated" line
  starters jsonb not null default '[]'::jsonb,   -- [{ name, pos, fpl_id }]
  bench jsonb not null default '[]'::jsonb,      -- potential starters, same shape
  fetched_at timestamptz not null default now(),
  unique (club)
);
