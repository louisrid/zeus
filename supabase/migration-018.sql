-- 018 · Fix the key added in 017. Postgres cannot use a PARTIAL unique index to infer an ON CONFLICT
-- target, and 017 created it with "where element is not null". The upsert therefore failed with
-- "no unique or exclusion constraint matching the ON CONFLICT specification".

-- Any row without an element cannot be keyed on one. There should be none; this makes it certain.
delete from history_player_gw where element is null;

drop index if exists history_player_gw_stable_key;

-- Plain, non-partial, so ON CONFLICT (season, gw, element) can infer it.
create unique index if not exists history_player_gw_stable_key
  on history_player_gw (season, gw, element);

-- Belt and braces: the duplicate cleanup from 017, in case that migration was applied before this fix.
delete from history_player_gw where player_name like '%\_%' escape '\';
