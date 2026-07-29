-- Turn the engine on.
--
-- The engine has been writing full projections all along and the app has been ignoring them, because a flag
-- called xp_visible was set to false with a note saying it stays shut until the model is calibrated. Nobody
-- ever calibrated it, so every number on every screen came from the weak fallback instead: a single blended
-- season average scaled by a rough fixture factor.
--
-- Measured against last season, that fallback beats "just use the player's own average" by three per cent. It
-- cannot tell a defender who scores from one who keeps clean sheets, which is why a tuning sweep across five
-- values moved accuracy by almost nothing. The ingredient is wrong, not the seasoning.
--
-- The engine works differently: it simulates each fixture thousands of times and prices goals, assists, clean
-- sheets, saves and the bonus race separately, then adds them up. That is the structure the fallback lacks.
--
-- It is not yet validated, because it predicts matches that have not been played. From GW1 the backtest can
-- measure it properly. Until then this is the better of two unvalidated options rather than a proven one.

update model_gates
   set passed = true,
       upgrade_date = current_date,
       note = 'Opened 29 Jul 2026. The fallback was measured on 2025/26 and beat a naive per-player average by only 3%, with a tuning sweep across five settings moving accuracy by 0.002. The limit is the fallback structure, not its parameters. The engine prices each scoring component separately and is the better bet. Re-measure with jobs/backtest.mjs once GW1 is played, and close this again if it does not beat 3%.'
 where key = 'xp_visible';

-- If the row was never created, create it, so this is safe to run on a fresh database.
insert into model_gates (key, passed, upgrade_date, note)
select 'xp_visible', true, current_date,
       'Opened 29 Jul 2026. See migration 025.'
 where not exists (select 1 from model_gates where key = 'xp_visible');
