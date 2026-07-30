# ZEUS xPTS Step 5: Penalties, Assists and Premium Separation

Date: 30 July 2026
Status: Complete in code, awaiting the combined Step 4 and Step 5 production projection run.

## What changed

- Team penalty rates are no longer raw copies of last season's count.
- Every club is shrunk toward the league penalty rate, so zero penalties last season does not mean zero future penalty expectation.
- Penalty expectation changes by fixture using the same team-goal lambda that drives the match simulation.
- Current penalty hierarchy becomes explicit player shares.
- One clear rank-one taker receives the full role; multiple ranked takers split it using stored confidence.
- Historical attempts are used only when current duty evidence is absent.
- Penalty conversions retain the sampled taker's identity and are exposed separately as expected penalty goals in projection diagnostics.
- Assist allocation receives a role-level calibration derived from the prior-season population, on top of player xA and the role-aware rates introduced in Step 4.
- No price, fame or manual player boost is used.

## Why this matters

The old model could understate premium attackers in three ways: a team with few penalties last season inherited a near-zero future penalty rate, strong fixtures did not increase penalty expectation, and the simulation knew only penalty rank rather than a player share. The repair concentrates the existing team goal total onto the correct taker without adding goals to the fixture.

## Verification

- Targeted Step 5 tests: 6/6 passed.
- Full repository suite: 486/486 passed under the existing local Supabase import stub.
- Synthetic premium test confirmed that explicit penalty shares increase the taker's expected goals and xPTS while preserving the team's total expected goals.
- Strong fixtures increase penalty expectation within configured safety bounds.
- Role assist calibration is ignored for thin samples and bounded between 0.6 and 1.5.

## Live validation still required

The production rerun must confirm the actual duty table identifies the intended takers and show the combined effect of Steps 3, 4 and 5 on Haaland, Palmer, Saka, Virgil, Alisson, Matheus Nunes and the full player pool.
