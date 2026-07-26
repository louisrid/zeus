-- 019 · The Analyst. Two tables: a spend ledger so the monthly cap is enforced server-side against
-- real usage rather than hope, and a season memory the Analyst reads so it knows what has already
-- been decided.
create table if not exists ai_spend (
  id bigint generated always as identity primary key,
  month text not null,                -- '2026-08'
  usd numeric not null,
  tokens_in int,
  tokens_out int,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists ai_spend_month_idx on ai_spend (month);

create table if not exists analyst_memory (
  id bigint generated always as identity primary key,
  gw int,
  note text not null,
  created_at timestamptz not null default now()
);
