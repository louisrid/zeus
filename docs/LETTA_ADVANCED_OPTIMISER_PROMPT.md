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

    ## Exclusion forwarding guarantee

    The strict comparison and single-squad tools expose `excluded_player_names_text` as a
    primitive string. The wrapper parses that value and sends the canonical backend field
    `excluded_player_names`. The backend also accepts `excluded_player_names_text` as a safe
    alias. A strict tool call now fails rather than returning a report when any requested
    exclusion is dropped, unresolved or absent from the exclusion proof.

    Current default exclusions:

    - Muniz (FUL)
- Thiaw (NEW)
- Schade (BRE)
- Barnes (NEW)
- Wirtz (LIV)
- Wright (COV)
- Tavernier (BOU)
- O'Reilly (MCI)
- Anderson (MCI)
- Guéhi (MCI)
- Solanke (TOT)
- Mykolenko (EVE)
