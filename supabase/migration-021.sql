-- 021 · Multi-gameweek plans. A plan is a base fifteen plus a per-gameweek diff, so free transfers,
-- hits and "what changed this week" are derived rather than tracked separately.
--
-- Slot one is reserved for the live team permanently. It holds no fake players: before the first
-- deadline it is simply a row with entry_id and no base, and the pull fills it once the API returns
-- picks.
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'plan' check (kind in ('plan', 'live')),  -- 'live' is the reserved slot
  entry_id int,                       -- FPL team id, for the live slot
  is_active bool not null default false,
  structure text not null default '3-5-2',
  captain int, vice int,
  base jsonb not null default '[]'::jsonb,      -- the fifteen, each with purchase price
  weeks jsonb not null default '{}'::jsonb,      -- { "2": { transfers: [...], captain, chip, benchOrder } }
  ignores jsonb not null default '[]'::jsonb,
  maybe_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exactly one live slot, and at most one active plan.
create unique index if not exists plans_one_live on plans (kind) where kind = 'live';
create unique index if not exists plans_one_active on plans (is_active) where is_active = true;

-- Existing drafts become single-gameweek plans, so nothing already saved is lost.
insert into plans (name, structure, captain, vice, base, ignores, maybe_ids, created_at)
select
  coalesce(d.name, 'Draft'),
  coalesce(d.squad->>'structure', '3-5-2'),
  nullif(d.squad->>'captain', '')::int,
  nullif(d.squad->>'vice', '')::int,
  coalesce(d.squad->'picks', '[]'::jsonb),
  coalesce(d.squad->'ignores', '[]'::jsonb),
  coalesce(d.squad->'maybeIds', '[]'::jsonb),
  d.created_at
from drafts d
where not exists (select 1 from plans p where p.name = coalesce(d.name, 'Draft'));

-- The reserved live slot for team 4812. No players until the API has some.
insert into plans (name, kind, entry_id)
select 'My team', 'live', 4812
where not exists (select 1 from plans where kind = 'live');
