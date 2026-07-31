# ZEUS Current State

Updated: 31 July 2026

## Evidence basis

This file describes the repository snapshot supplied as `zeus-main (1)(1).zip` after the repository tidy work.

The ZIP does not include `.git`, so it cannot prove commit history, the last green commit, or the exact Vercel deployment SHA. Codex must inspect the connected GitHub repository for those facts.

## Repository inventory

The supplied snapshot contains:

- 9 page routes
- 9 API routes
- 18 GitHub Actions workflows
- 41 `*.test.mjs` test files
- 24 numbered Supabase migrations
- 28 job scripts
- 18 top-level shared components
- No committed `package-lock.json`

## Current page and feature code

The current repository already contains much of the newer product work:

- Shared `components/GameweekRange.jsx`
- Players FROM and TO gameweek state
- Players xP summing across the selected range
- Builder four-gameweek initialisation after model load
- Builder `BUILD SQUAD`, `FILL GAPS`, `IMPROVE`, `OPTIMISE XI`, `CLEAR`, `COPY PAYLOAD`, and `SAVE PLAN`
- Builder selected-range evaluation
- Squad `OPTIMISE GWn`
- Responsive Builder toolbar and workspace rules in `app/globals.css`
- Projection-generation and horizon integrity helpers
- Current-team resolution, minutes-resolution, and low-sample protections

These are present in source. They are not all proven working in a successful end-to-end production release.

## Current workflow set

The cleaned snapshot contains these 18 workflows:

- `archive-2526.yml`
- `backtest-engine.yml`
- `backtest.yml`
- `baseline-gate.yml`
- `ci.yml`
- `component-attribution.yml`
- `fpl-pull.yml`
- `history-load.yml`
- `minutes-scorecard.yml`
- `odds-pull.yml`
- `penalty-duty.yml`
- `presser-pull.yml`
- `projections-run.yml`
- `reliability.yml`
- `rival-pull.yml`
- `sweep.yml`
- `understat-pull.yml`
- `zeus-release-check-v5.yml`

Old V1 to V4 restoration and release workflows are no longer present in the supplied snapshot.

## What is known to have worked previously

The user reports a previous deployed version that:

- Built and deployed successfully
- Displayed real GW1 data
- Had an operational core website
- Did not yet have the correct future-gameweek data
- Did not have the final feature controls, layout, or corrected projection behaviour

The exact commit must be identified from GitHub history. Do not infer it from old assistant messages.

## What is not currently proven

The current snapshot is not proven to be a safe, runnable final release.

The latest real manual release attempt passed far enough to run live projection generation, then failed against production Supabase data.

The exact observed blocker was:

```text
invalid away team for fixture 1000005: null
```

The failure occurs because `jobs/projections_run.mjs` converts and validates every fixture row immediately after reading the fixtures table. It validates historical archive rows before selecting the current live eight-gameweek horizon.

Fixture `1000005` is an offset 2025/26 archive fixture with a null `away_team`. That irrelevant historical row aborts current-season generation.

The supplied snapshot still contains this failure path:

- `jobs/projections_run.mjs` validates `home_team` and `away_team` for every fetched fixture before horizon selection
- `jobs/archive_2526.mjs` inserts new archive fixtures but skips existing fixture IDs rather than repairing damaged existing rows
- The proposed `lib/fixture_rows.mjs` runtime repair is not present

Therefore, running `ZEUS Release Check V5` against the same production data is expected to fail again unless the data or code has changed.

## Release workflow state

The current `zeus-release-check-v5.yml` includes several later corrections:

- Manual-only trigger
- `cancel-in-progress: false`
- Full tests and Next build before live data work
- Eight-gameweek configuration
- Isolated release evidence
- Post-write integrity and cleanup stages

However, the complete workflow has never produced a successful end-to-end live release on the current repository and current database.

Do not treat its presence as proof that it is correct.

## Documentation state

Several existing files overstate the current status:

- `STATUS.md`
- `ZEUS_XPTS_STATE.md`
- Old core-restoration documents
- Old verification reports

For example, they describe V5 as ready or locally verified even though the real live run later failed on archive data.

These files are historical evidence, not current truth.

## Known good work that may be reusable

The current source appears to contain useful implementations that should be preserved through selective cherry-picking or manual reapplication after baseline recovery:

- Gameweek range component
- Players range calculations
- Builder toolbar and selected-range logic
- Squad gameweek optimiser
- Responsive layout rules
- Coherent generation-selection logic
- Paginated projection reads
- Current-team resolution
- Predicted-lineup minutes architecture
- Historical player-rate matching
- Penalty allocation work
- Projection integrity tests

Each item must be tested independently against the restored baseline. Do not carry the entire current branch forward as one block.

## Unknowns Codex must resolve from GitHub

1. Exact current `main` SHA
2. Exact last normal CI-green SHA
3. Exact last successful Next build SHA
4. Exact last successful Vercel deployment SHA
5. Whether the known working GW1 baseline is one of those SHAs
6. Complete diff between that baseline and current `main`
7. Which current UI commits can be cleanly cherry-picked
8. Whether normal CI is currently green on `main`
9. Which migrations are actually applied in Supabase
10. Whether fixture `1000005` is still malformed in production

## Current safe instruction

Do not run V5, projection writes, cleanup, or migrations during the baseline audit.
