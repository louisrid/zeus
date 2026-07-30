# Step 6.4: Live Gate Repair

The first complete live report proved the football improvements were active, but exposed four structural issues around them.

## Fixed

- Validation and future UI grouping now use the team actually used by the engine, not a stale `players.team_id` left behind after a transfer.
- A missing or unavailable predicted starter now promotes one concrete replacement at 100% rather than spreading start probability across the bench.
- All other non-predicted players remain at zero start probability and retain only a cameo chance.
- Team expected minutes reconcile exactly to 990, including sparse cameo-history cases.
- Data-free teams can no longer lose sampled goals because every scorer weight is zero.
- Penalty-event volume is recovered from Understat total xG minus non-penalty xG when explicit archive attempts are absent.
- Projection diagnostics now record `resolved_team_id`.
- Live validation is manual-only and no longer runs on every upload.

## Verification

- Full repository suite: 498/498 passed with the same local Supabase import stub used in earlier steps.
- Without the stub: 427/437 passed; all ten failures were missing local npm dependencies, not test failures.
- Targeted live validation, minutes, penalty and goal-conservation tests passed.
