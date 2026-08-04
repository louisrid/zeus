# GitHub workflow inventory

This inventory was generated after the complete ZEUS implementation was verified live.

## Cleanup policy

- Permanent operational workflows are protected.
- The two proven superseded workflows were removed by exact path and blob hash.
- Remaining one-off-looking workflows are audit candidates only and were not deleted automatically.
- Manual review is required before any further deletion.

## KEEP

| Path | Name | Triggers | References | Last commit |
|---|---|---|---|---|
| `.github/workflows/archive-2526.yml` | archive-2526 | unresolved | none | 5aabf90 2026-07-25 Create archive-2526.yml |
| `.github/workflows/backtest-engine.yml` | backtest-engine | workflow_dispatch, inputs, season, from_gw, to_gw, n_sims | tests/engine.test.mjs | 792d91f 2026-07-29 Create backtest-engine.yml |
| `.github/workflows/backtest.yml` | backtest | workflow_dispatch, inputs, tune_seasons, test_season, season, from_gw | tests/scoring.test.mjs | 1488e33 2026-07-29 Update backtest.yml |
| `.github/workflows/baseline-gate.yml` | baseline-gate | unresolved | none | 26e7696 2026-07-26 Create baseline-gate.yml |
| `.github/workflows/ci.yml` | ci | push, paths-ignore, pull_request | docs/DECISIONS.md | 06b2321 2026-07-27 Update ci.yml |
| `.github/workflows/component-attribution.yml` | component-attribution | unresolved | none | 86df737 2026-07-26 Create component-attribution.yml |
| `.github/workflows/fpl-pull.yml` | fpl-pull | schedule | jobs/fpl_bootstrap.mjs | 80f36a6 2026-07-24 Update fpl-pull.yml |
| `.github/workflows/history-load.yml` | history-load | unresolved | none | dfd4c5f 2026-07-25 Create history-load.yml |
| `.github/workflows/minutes-scorecard.yml` | minutes-scorecard | unresolved | none | 231346c 2026-07-26 Create minutes-scorecard.yml |
| `.github/workflows/odds-pull.yml` | odds-pull | schedule | none | 4f13713 2026-07-25 Create odds-pull.yml |
| `.github/workflows/penalty-duty.yml` | penalty-duty | unresolved | none | d5e4840 2026-07-26 Create penalty-duty.yml |
| `.github/workflows/presser-pull.yml` | presser-pull | schedule | .github/workflows/zeus-external-xpts-switch-v2.yml, .github/workflows/zeus-external-xpts-switch-v3.yml, .github/workflows/zeus-external-xpts-switch-v4.yml, .github/workflows/zeus-external-xpts-switch.yml, .github/workflows/zeus-release-check-v5.yml, jobs/core_restoration_preflight.mjs, jobs/prepare_permanent_projection_workflows.mjs, tests/final_release.test.mjs | a41289b 2026-08-02 Add full-season fixtures and projections |
| `.github/workflows/projections-run.yml` | projections-run | schedule | .github/workflows/zeus-external-xpts-switch-v2.yml, .github/workflows/zeus-external-xpts-switch-v3.yml, .github/workflows/zeus-external-xpts-switch-v4.yml, .github/workflows/zeus-external-xpts-switch.yml, .github/workflows/zeus-release-check-v5.yml, jobs/core_restoration_preflight.mjs, jobs/prepare_permanent_projection_workflows.mjs, tests/final_release.test.mjs, tests/fpl2-final-acceptance.test.mjs, tests/full-season-api.test.mjs | 4657149 2026-08-02 Fix projection workflow preflight commands |
| `.github/workflows/reliability.yml` | reliability | unresolved | none | 2eb3eec 2026-07-26 Create reliability.yml |
| `.github/workflows/rival-pull.yml` | rival-pull | schedule | none | d269a0d 2026-07-26 Create rival-pull.yml |
| `.github/workflows/sweep.yml` | sweep | workflow_dispatch, inputs, random_tries, descent_passes, confidence, bootstrap_draws | none | a90820d 2026-07-29 Update sweep.yml |
| `.github/workflows/understat-pull.yml` | understat-pull | schedule | none | 6843a10 2026-07-25 Update understat-pull.yml |
| `.github/workflows/zeus-release-check-v5.yml` | ZEUS Release Check V5 | unresolved | .github/workflows/zeus-external-xpts-switch-v2.yml, .github/workflows/zeus-external-xpts-switch-v3.yml, .github/workflows/zeus-external-xpts-switch-v4.yml, .github/workflows/zeus-external-xpts-switch.yml, STATUS.md, ZEUS_XPTS_STATE.md, config/release-workflow.json, tests/final_release.test.mjs | 5af340b 2026-08-02 Make V5 cleanup read-only |

## DELETE CANDIDATE

| Path | Name | Triggers | References | Last commit |
|---|---|---|---|---|
| None |  |  |  |  |

## MANUAL REVIEW

| Path | Name | Triggers | References | Last commit |
|---|---|---|---|---|
| `.github/workflows/zeus-external-xpts-switch-v2.yml` | Apply External xPTS Switch V2 | unresolved | none | 6eb05d8 2026-08-03 Add files via upload |
| `.github/workflows/zeus-external-xpts-switch-v3.yml` | Apply External xPTS Switch V3 | unresolved | none | 0a3f8b1 2026-08-03 Add files via upload |
| `.github/workflows/zeus-external-xpts-switch-v4.yml` | Apply External xPTS Switch V4 | unresolved | none | 902b5df 2026-08-03 Add files via upload |
| `.github/workflows/zeus-external-xpts-switch.yml` | Apply External xPTS Switch | unresolved | none | 5e1b6d7 2026-08-03 Add files via upload |
| `.github/workflows/zeus-final-ui-consistency-fix-v2.yml` | Apply Final ZEUS UI Consistency Fix V2 | unresolved | none | 56be31b 2026-08-03 Add files via upload |
| `.github/workflows/zeus-final-ui-consistency-fix-v3.yml` | Apply Final ZEUS UI Consistency Fix V3 | unresolved | none | 591ef2e 2026-08-03 Add files via upload |
| `.github/workflows/zeus-final-ui-consistency-fix-v4.yml` | Apply Final ZEUS UI Consistency Fix V4 | unresolved | none | fddcdef 2026-08-03 Add files via upload |
| `.github/workflows/zeus-final-ui-consistency-fix-v5.yml` | Apply Final ZEUS UI Consistency Fix V5 | unresolved | none | 5f1a6c6 2026-08-03 Add files via upload |
| `.github/workflows/zeus-final-ui-consistency-fix-v6.yml` | Apply Final ZEUS UI Consistency Fix V6 | unresolved | none | fe12c9f 2026-08-03 Add files via upload |
| `.github/workflows/zeus-final-ui-consistency-fix.yml` | Apply Final ZEUS UI Consistency Fix | unresolved | none | 5cb851d 2026-08-03 Add files via upload |
| `.github/workflows/zeus-lineups-chips-letta-squads-v10.yml` | Verify ZEUS Lineups, Chips and Letta Squads V10 | unresolved | none | fa669b7 2026-08-03 Add files via upload |
| `.github/workflows/zeus-lineups-chips-letta-squads-v2.yml` | Deploy ZEUS Lineups, Chips and Letta Squads V2 | unresolved | none | b6bdc46 2026-08-03 Add files via upload |
| `.github/workflows/zeus-lineups-chips-letta-squads-v3.yml` | Deploy ZEUS Lineups, Chips and Letta Squads V3 | unresolved | none | e2957ea 2026-08-03 Add files via upload |
| `.github/workflows/zeus-lineups-chips-letta-squads-v4.yml` | Deploy ZEUS Lineups, Chips and Letta Squads V4 | unresolved | none | 644145d 2026-08-03 Add files via upload |
| `.github/workflows/zeus-lineups-chips-letta-squads-v5.yml` | Deploy ZEUS Lineups, Chips and Letta Squads V5 | unresolved | none | 9a43d61 2026-08-03 Add files via upload |
| `.github/workflows/zeus-lineups-chips-letta-squads-v6.yml` | Deploy ZEUS Lineups, Chips and Letta Squads V6 | unresolved | none | 611054f 2026-08-03 Add files via upload |
| `.github/workflows/zeus-lineups-chips-letta-squads-v7.yml` | Deploy ZEUS Lineups, Chips and Letta Squads V7 | unresolved | none | 0db9f3c 2026-08-03 Add files via upload |
| `.github/workflows/zeus-lineups-chips-letta-squads-v8.yml` | Deploy ZEUS Lineups, Chips and Letta Squads V8 | unresolved | none | c6d5f77 2026-08-03 Add files via upload |
| `.github/workflows/zeus-lineups-chips-letta-squads-v9.yml` | Deploy ZEUS Lineups, Chips and Letta Squads V9 | unresolved | none | 9ccbfc5 2026-08-03 Add files via upload |
| `.github/workflows/zeus-lineups-chips-letta-squads.yml` | Deploy ZEUS Lineups, Chips and Letta Squads | unresolved | none | 10db0e5 2026-08-03 Add files via upload |

## Root YAML files

- None.
