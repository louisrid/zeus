# ZEUS strict Bench Boost Letta contract

The final strict tools use primitive-only fields to avoid Letta/Pydantic wrapper failures.

## Comparison tool

Use `compare_and_save_benchboost_squads_strict` with:

- `bench_boost_gw_a = 1`
- `bench_boost_gw_b = 2`
- `excluded_player_names_text` as comma-, semicolon- or newline-separated names
- `minimum_bench_spend = 16.5`
- `budget = 100.0`
- `goalkeeper_max_price = 4.5`
- `minimum_goalkeepers_at_or_below_price = 1`

The tool internally constructs the direct ZEUS API payload and always sends:

- the canonical goalkeeper-first bench-order policy;
- no replacement suggestions;
- no save names;
- no delete IDs.

Every successful response is checked for exactly 15 unique players, exactly 2 GKP, 5 DEF,
5 MID and 3 FWD, the goalkeeper-price rule, exclusions, fixed weekly squads, legal benches,
exact HiGHS optimality and arithmetic proof. The backend `report_markdown` is then returned verbatim.

## Exclusions and natural-language routing

The strict comparison and single-squad tools expose `excluded_player_names_text` as an optional primitive string. No player is excluded by default. The Letta agent converts ordinary wording such as “exclude Player A and Player B” into that field for the current call only.

The wrapper sends the canonical backend `excluded_player_names` array internally. Requested exclusions are verified fail-closed. Internal backend fields are not exposed to chat and task-specific exclusions are never saved as tool defaults or durable memory.
