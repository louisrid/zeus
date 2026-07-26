-- 017 · Two faults the readiness board found.
--
-- 1. THE TRAINING SET IS DUPLICATED. The natural key was (season, gw, player_name, element), and
--    player_name changed when name normalisation was added: "Aaron_Cresswell_376" became
--    "Aaron Cresswell". The second load therefore inserted new rows instead of updating. The source
--    files hold 253,900 player-gameweeks; the table held 333,087. Every diagnostic that reads this
--    table has been computing on duplicated data.
--
--    Fix: delete the un-normalised rows, then key on (season, gw, element), which never changes.
delete from history_player_gw
 where player_name like '%\_%' escape '\';

-- element is the FPL id within a season, so this key is stable regardless of how a name is written.
create unique index if not exists history_player_gw_stable_key
  on history_player_gw (season, gw, element)
  where element is not null;

-- 2. THE CALIBRATION GATE ROW IS MISSING. Without it the app falls back to hiding xP, which is the
--    safe direction, but the gate is meant to be an explicit record rather than an absence.
insert into model_gates (key, passed, upgrade_date, note)
values ('xp_visible', false, date '2026-07-28',
        'Projections render as INTERIM SCORE until walk-forward calibration and ablation pass. Target 28 Jul 2026.')
on conflict (key) do update
  set upgrade_date = excluded.upgrade_date,
      note = excluded.note,
      updated_at = now();
