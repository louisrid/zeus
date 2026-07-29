-- history_player_gw predates the defensive-stats fix: the loader has been producing cbit and
-- recoveries per row since then, but the table never had the columns, so the values were dropped
-- on insert and the first query to ask for them killed the projection run outright.
alter table history_player_gw add column if not exists cbit int;
alter table history_player_gw add column if not exists recoveries int;
