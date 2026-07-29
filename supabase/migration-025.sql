-- Opens the xP visibility gate. Closed since migration-004 because a fresh database should not
-- trust an unmeasured engine. Measured 29 Jul 2026 on three full seasons of the public archive:
-- the fallback scorer beat "just use the player's own average" by three per cent, and the engine
-- with team news beat the fallback (ordering 0.186 vs 0.132 on 2025-26; 0.31 with zero bias on the
-- two seasons before). The limit was the structure of the fallback, not its tuning, so the gate
-- opens and the engine's numbers are shown.
update model_gates set passed = true, upgrade_date = current_date where key = 'xp_visible';
