-- 024 - Read access for predicted_lineups, and a smaller key.
--
-- Two faults in migration 023, both of which would have left the page empty even after a successful pull:
--
-- 1. Every other table in this project enables row level security and grants an anonymous read. This one
--    did neither, so the browser holds a read-only anon key and would have seen nothing.
-- 2. The unique key was the club name as text. The first live run failed with
--    "index row size 6648 exceeds btree maximum 2704" because a parsing fault produced a huge name. The
--    parser is fixed, but the key should not be able to fail that way at all, so it is bounded.

alter table predicted_lineups enable row level security;
drop policy if exists anon_read_predicted_lineups on predicted_lineups;
create policy anon_read_predicted_lineups on predicted_lineups for select using (true);

-- A club name cannot legitimately be long. Bounding the column makes the index failure impossible rather
-- than merely unlikely.
alter table predicted_lineups alter column club type varchar(40);
