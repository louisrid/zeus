-- 022 - Attack and defence ratings per club, which FPL publishes and we were discarding.
-- Needed for the Dashboard's ATTACK and DEFENCE fixture views: how favourable a run is for attackers
-- depends on the opponents' DEFENSIVE strength, and for defenders on their ATTACKING strength. One
-- overall number cannot answer both.
alter table teams add column if not exists strength_attack_home int;
alter table teams add column if not exists strength_attack_away int;
alter table teams add column if not exists strength_defence_home int;
alter table teams add column if not exists strength_defence_away int;
