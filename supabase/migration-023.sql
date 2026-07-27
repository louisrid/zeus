-- RETIRED, no longer used by anything.
--
-- These created and secured a predicted_lineups table for a scrape that never worked: the source
-- challenges automated requests. Predicted line-ups are now a checked-in file, config/lineups.json, so no
-- table is involved. The table can be dropped whenever convenient; leaving it costs nothing.
--
--   drop table if exists predicted_lineups;
select 1;
