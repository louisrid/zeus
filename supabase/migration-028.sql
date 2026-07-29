-- A predicted eleven is evidence, not a team sheet. Its provenance and the weight it was given are
-- stored so a projection can be judged against the quality of the lineup behind it.
alter table projections add column if not exists lineup_source text;
alter table projections add column if not exists lineup_captured text;
alter table projections add column if not exists lineup_confidence numeric;
