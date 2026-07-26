-- 010 · Correct the calibration gate's upgrade date. The schedule changed on 26 Jul 2026:
-- working MVP 26 Jul, complete project 28 Jul 22:00. Migration 004 wrote the old date.
-- config/schedule.js is the binding source; this brings the database into line with it.
update model_gates
   set upgrade_date = date '2026-07-28',
       note = 'Projections render as INTERIM SCORE until walk-forward calibration and ablation pass. Target 28 Jul 2026.',
       updated_at = now()
 where key = 'xp_visible';
