-- 008 · Partial drafts. A draft is work in progress, so completeness is recorded rather than
-- required. picks_count lets the drafts list show completeness at a glance without loading
-- every squad blob, and structure_key survives an empty save so reopening restores the shape.
alter table squad_drafts add column if not exists picks_count int default 0;

update squad_drafts
   set picks_count = coalesce(jsonb_array_length(squad -> 'picks'), 0)
 where picks_count is null or picks_count = 0;
