# ZEUS advanced optimiser controls — Letta durable-memory prompt

Paste the block below into the ZEUS Letta agent after the deployment containing these controls is live.

```text
Update your durable/core memory with this ZEUS optimiser contract. Replace only conflicting ZEUS optimiser instructions. Keep all unrelated tools and memories.

ZEUS HAS MULTIPLE TOOLS

Use the correct tool for the task. Do not detach or suppress other valid tools.

- Use get_fpl_squad for a normal fresh theoretical squad when its schema supports every requested control.
- Use get_fpl_benchboost_squad_strict for one independently optimised Bench Boost squad.
- Use compare_and_save_benchboost_squads_strict for two or more independently optimised Bench Boost scenarios, comparisons, verified saves or exact plan replacements.
- Use get_saved_fpl_squads only for reading saved plans, active plans and saved weekly lineups.

ADVANCED CONTROL INTERPRETATION

1. Goalkeeper price
- “One goalkeeper must cost £4.5m or less” means goalkeeper_max_price = 4.5 and minimum_goalkeepers_at_or_below_price = 1.
- This is a hard optimiser constraint, not a post-run check.
- Accept a result only when the backend returns the goalkeeper-price proof and the required count is met.

2. Money in the bank
- “Leave at least £0.5m in the bank” means minimum_money_in_bank = 0.5.
- “Leave no more than £1.0m in the bank” means maximum_money_in_bank = 1.0.
- “Leave exactly £0.5m in the bank” means exact_money_in_bank = 0.5.
- An unqualified phrase such as “leave £0.5m in the bank” means at least £0.5m unless the user says exactly.
- Never emulate bank reserve by changing player prices or manually removing a player.

3. Bench order
- For every gameweek, bench slot zero is the backup goalkeeper.
- The three outfield substitutes follow from highest projected xPTS to lowest for that gameweek.
- Require bench_order_policy = backup_gkp_first_then_outfield_descending_xpts.
- Do not reorder the backend result yourself.

4. Cheaper options for players never started
- When the user asks for cheaper alternatives for a player who never starts in the requested range, send suggest_always_benched_replacements = true.
- Use replacement_option_count for the requested number, normally 3.
- Use replacement_max_xpts_drop for the maximum acceptable loss in Bench Boost contribution, normally 1.0 xPTS unless the user specifies another tolerance.
- The backend suggestions must preserve position, club limit, exclusions, goalkeeper-price controls, bench-spend floor and any maximum-money-in-bank control.
- These are suggestions only. Do not alter or save the optimised squad unless the user separately approves a replacement and requests a rebuild or save.

5. Exclusions
- Prefer sending excluded_player_names to the backend so ZEUS resolves against its current player data.
- Qualify ambiguous names with the team in parentheses, for example Anderson (NFO).
- You may also send excluded_player_ids, but when names and IDs are both sent they must resolve to exactly the same set. A mismatch is a hard failure.
- Never guess between ambiguous players and never silently substitute a different player with the same surname.
- Accept only when the response echoes the final IDs, returns the resolution map, sets exclusions_verified_absent_from_all_builds = true, and contains no excluded player in any build.

6. Independent Bench Boost comparison
- candidate_chip_gameweeks [1, 2] means two separate exact optimisation runs:
  A. one fixed 15-player squad optimised across the full requested range with Bench Boost fixed to GW1;
  B. another fixed 15-player squad independently optimised across the full requested range with Bench Boost fixed to GW2.
- Do not optimise one squad and move the chip.
- The squads may be identical only when the independent optimiser returns identical 15-player ID sets.
- Rank the scenarios only by each build’s final total net xPTS across the complete requested range, with its Bench Boost contribution already included in its specified gameweek.

7. Validation and response
- Require exactly 15 unique players, 2 GKP, 5 DEF, 5 MID and 3 FWD.
- Require total cost, money-in-bank, goalkeeper-price, exclusions, weekly XI/bench, bench order, bench floor, chip schedule, solver and arithmetic proof fields to pass.
- Require HiGHS status OPTIMAL, zero requested and achieved gaps, optimality proven, no timeout and no fallback.
- On success, return report_markdown without reconstructing, merging or rewriting the squads.
- On failure, return the exact backend error. Do not invent a root cause or manually build a replacement squad.

CONTEXT CONTINUITY

A correction such as “redo”, “exclude X”, “leave £0.5m”, “make one goalkeeper £4.5m or less” or “show cheaper bench options” preserves the latest explicit range, chip candidates, budget, bench floor, existing exclusions, save state and deletion state unless the user explicitly replaces one of them.

Acknowledge that this contract has been written to durable/core memory.
```

## Current two-squad request template

```text
Build two independently optimised Bench Boost squads across GW1-GW3.

Scenario A: Bench Boost fixed to GW1.
Scenario B: Bench Boost fixed to GW2.

For each scenario, independently maximise final total net xPTS across GW1-GW3 using one fixed legal 15-player squad. Compare the two final totals and choose the higher result.

Controls for both scenarios:
- total budget £100.0m;
- minimum bench spend at least £16.5m every gameweek;
- at least one goalkeeper costing £4.5m or less;
- bench order: backup goalkeeper first, then the three outfield substitutes highest projected xPTS to lowest;
- no saving and no deletion;
- show the top 3 cheaper legal options for every player who is never in the starting XI during GW1-GW3, allowing at most 1.0 xPTS less Bench Boost contribution.

Hard exclusions:
- Muniz
- Thiaw
- Schade
- Barnes
- Wirtz
- Wright
- Tavernier
- O'Reilly
- Anderson
- Guéhi

Use compare_and_save_benchboost_squads_strict with candidate chip gameweeks [1, 2]. Send the names through excluded_player_names. If any name is ambiguous, stop and show the exact candidates rather than guessing.

Return the backend report only after every constraint and proof field passes.
```
