-- RETIRED, intentionally does nothing. This migration created ai_spend and analyst_memory for the
-- in-app Analyst, which was removed the same day. Safe to run: it makes no changes.
-- If you already ran the original and want the two empty tables gone, paste this instead:
--   drop table if exists ai_spend;
--   drop table if exists analyst_memory;
select 1;
