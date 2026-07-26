-- 015 · Penalty duty derived from history, and availability history captured over time.

-- A missed penalty is proof of duty. Scored penalties are not separable in the open dataset, so this
-- identifies takers with certainty and under-counts them. Confidence records that honestly.
alter table set_piece_duty add column if not exists evidence text;
alter table set_piece_duty add column if not exists confidence numeric;
alter table set_piece_duty add column if not exists derived_from text;
alter table set_piece_duty add column if not exists updated_at timestamptz default now();

create table if not exists availability_history (
  id bigint generated always as identity primary key,
  player_id bigint references players(id),
  seen_at timestamptz default now(),
  status text,
  chance_of_playing int,
  news text,
  unique (player_id, status, chance_of_playing, news)
);
create index if not exists availability_history_player_idx on availability_history (player_id, seen_at desc);
alter table availability_history enable row level security;
drop policy if exists anon_read_availability on availability_history;
create policy anon_read_availability on availability_history for select using (true);
