# ZEUS xPTS Project State

Updated: 30 July 2026, Step 6.2 replacement-slot fix ready

## Authoritative status

**CURRENT STEP: STEP 6 IN PROGRESS**

**LAST COMPLETED STEP: STEP 5, penalties and role-aware assist allocation rebuilt**

**NEXT REQUIRED WORK: Upload the Step 6.2 replacement-slot patch. The existing live-validation workflow will rerun automatically, generate fresh projections, export the full player table and apply the release gate.**

**LAST ASSISTANT STATUS LINE:** `ZEUS STATUS: STEP 6 IN PROGRESS | NEXT: UPLOAD STEP 6.2 PATCH; LIVE VALIDATION RERUNS AUTOMATICALLY`

## Continuation protocol

At the start of every work session:

1. Read this file first.
2. Read the last visible assistant status line.
3. Confirm both identify the same current step.
4. If they conflict, use the newest dated tracker and state the mismatch.
5. Do not restart a completed step unless a newer repository or CSV invalidates it.
6. Work only on the current step until its acceptance checks pass or a documented external block remains.
7. Update this file before packaging each completed step.
8. End every ZEUS work message with exactly:

`ZEUS STATUS: STEP <number> <IN PROGRESS|COMPLETE> | NEXT: <specific next action>`

## Upload rule

- Same chat: the user only uploads the changed-files ZIP produced at the end of each step to GitHub.
- The user does not need to re-upload this tracker separately because it is included in every step ZIP.
- New chat or lost context: upload the newest `ZEUS_XPTS_STATE.md` plus the newest full repository ZIP or latest projection CSV.
- Never replace a newer tracker with an older one.

## Repository frozen for Step 1

- Source upload: `zeus-main.zip`
- SHA-256: `7366c27040e8f2191706f9a452f255a24af489d63d8c69e5151ac4181fce37d8`
- Files inspected: 227
- Current minutes patch is present.
- Repository archive contains no `.git` history, so the source ZIP hash is the exact local version identifier.

## Step map

### Step 0: Plan and evidence collection
Status: COMPLETE

### Step 1: Freeze code and build repeatable audit
Status: COMPLETE

Completed:
- Extracted and inspected the current full repository.
- Added `jobs/xpts_audit.mjs`, requiring no database or npm packages.
- Added `npm run audit:xpts -- <csv>`.
- Added `tests/xpts_audit.test.mjs`.
- Ran the audit against `Supabase Snippet Untitled query (7)(1).csv`.
- Confirmed the automated output matches the previously measured baseline.
- Recorded exact watch-player checks using player plus team identity, preventing the wrong Palmer from being selected.
- Ran all tests that the environment could load.

Baseline audit:
- Team start probabilities sum to 11: PASS
- Goalkeeper start probabilities sum to 1: PASS
- Unavailable players zeroed: PASS
- Team expected minutes sum to 990: FAIL
- Predicted starters at 100% start probability: FAIL
- Non-predicted players at 0% start probability: FAIL
- Positional-prior players: 276 of 564
- Established players with 20+ historical nineties on positional priors: 31

Named-player baseline:
- Haaland 6.189 xPTS, 79.0 xMins
- Watkins 4.452 xPTS, 84.6 xMins
- Palmer 3.043 xPTS, 73.2 xMins
- Neto 2.955 xPTS, 77.7 xMins
- Caicedo 3.597 xPTS, 79.5 xMins
- Saka 5.679 xPTS, 77.2 xMins
- Rice 5.636 xPTS, 83.5 xMins
- Virgil 1.798 xPTS, 32.2 xMins
- A.Becker 1.343 xPTS, 28.0 xMins
- Matheus N. 1.458 xPTS, 27.7 xMins
- Gabriel 6.669 xPTS, 81.9 xMins

Test baseline after adding the audit:
- 403 tests discovered
- 391 passed
- 12 failed
- 2 new audit tests passed
- Most failures are caused by `@supabase/supabase-js` being unavailable because npm installation is blocked by the execution environment's registry.
- Two pre-existing code/test contradictions are confirmed:
  1. The code reports `minutes-interim-2`, while an old test expects `minutes-interim-1`.
  2. Predicted starters are reduced below 100% during normalisation, failing the contract test and matching the live CSV issue.
- `npm install` and the Next.js production build could not complete because the environment's npm mirror returns 404 for Supabase and the public registry timed out. This is recorded as an external verification block, not reported as a pass.

Files added or changed in Step 1:
- `jobs/xpts_audit.mjs`
- `tests/xpts_audit.test.mjs`
- `package.json`
- `ZEUS_XPTS_STATE.md`

Step 1 command:

`npm run audit:xpts -- /path/to/supabase-export.csv --out-dir /tmp/zeus-audit`

### Step 2: Obvious structural fixes
Status: COMPLETE

Completed:
- Added `lib/projection_runtime.mjs`, shared by browser and server loaders.
- Both loaders now select one coherent latest timestamp generation per gameweek, independently of Supabase row order or reused model versions.
- Browser projection loading is paginated. The old three-gameweek query could exceed Supabase's 1,000-row cap and silently omit engine rows.
- Projection read failures now throw a visible `ProjectionReadError`; they cannot become an empty projection map.
- Current-gameweek engine coverage is mandatory for every active player whose team has a fixture. Missing rows throw `ProjectionCoverageError` with the affected players.
- The app-facing scorer is now `engineOnly`. Missing rows are never replaced by archive, Understat or positional final xPTS. Genuine blank gameweeks remain zero.
- The server loader and browser loader now use the same engine-only route and generation metadata.
- The Dashboard no longer catches a model failure and silently renders missing xPTS.
- `projection_integrity_v14` now reports every active player missing from a generation.
- `projections_run.mjs` runs the integrity gate before writing a successful heartbeat, so manual, scheduled and post-presser runs cannot succeed with incomplete or mixed projections.
- Fixed an existing server-loader runtime error: `lineupTrust` was used without being created.
- Corrected the server's goalkeeper-goal fallback default from 10 to the actual six points. This fallback is no longer used by the live ranking, but the rules path is now internally correct.

Step 2 acceptance gates:
- Deterministic newest generation in browser and server: PASS
- More than 1,000 projection rows loaded without truncation: PASS by paged-query contract test
- Projection query failure cannot silently become fallback xPTS: PASS
- Missing current engine rows reject the model/run: PASS
- App ranking cannot mix engine and separately calculated final fallback xPTS: PASS
- Projection workflow runs integrity before success: PASS

Verification:
- Step 2 focused suite: 39/39 passed.
- Full repository suite: 410 tests discovered, 398 passed, 12 failed.
- The 12 failures are unchanged from the Step 1 baseline: missing npm dependencies in this environment plus the two pre-existing Step 3 minutes contradictions.
- Seven new/updated Step 2 tests passed, while the failure count stayed at 12.
- Syntax checks passed for all changed JavaScript/MJS files.
- The frozen Supabase CSV audit is unchanged, as expected because Step 2 changes projection delivery rather than football formula outputs.
- `npm install` and `next build` remain externally blocked in this container by the unavailable npm registry/dependencies; no build pass is claimed.

Files added or changed in Step 2:
- `app/page.jsx`
- `jobs/projection_integrity_v14.mjs`
- `jobs/projections_run.mjs`
- `lib/projection_runtime.mjs`
- `lib/projections.js`
- `lib/server/load.mjs`
- `lib/solver/score.mjs`
- `tests/brief.test.mjs`
- `tests/projection_runtime.test.mjs`
- `tests/scoring.test.mjs`
- `ZEUS_XPTS_STATE.md`

### Step 3: GW1 lineup and minutes architecture
Status: COMPLETE

Completed:
- Scoped the supplied predicted lineups explicitly to GW1 so they cannot leak into later gameweeks.
- A successfully matched predicted starter now receives exactly 100% predicted start probability.
- Start certainty is separated from expected time on the pitch: each starter keeps his player-specific expected minutes if starting.
- Players outside a fully validated XI receive 0% predicted start probability while retaining only a player-specific substitute chance.
- Goalkeepers are handled separately and receive no normal cameo probability.
- Rebuilt team normalisation around locked predicted starters and free remaining slots.
- Reconciled every team to exactly 11 expected starters, one expected starting goalkeeper and 990 expected player-minutes.
- Added safe predicted-XI team overrides for players whose stored FPL team is stale after a transfer.
- Added cross-club duplicate protection so the same player cannot silently start for two clubs.
- Made the projection job, browser loader and server loader use the same lineup resolution, GW scope and minutes resolver.
- Bumped the minutes model and resolver versions so old rows cannot be mistaken for Step 3 output.

Real lineup validation:
- 20 supplied clubs checked against the frozen FPL player snapshot.
- 19 predicted XIs are fully valid.
- Chelsea is safely partial because Lacroix is also listed for Crystal Palace; the Palace occurrence is retained and Chelsea's duplicate is rejected.
- Rushworth is temporarily reassigned to Coventry and Trafford to Leeds for the engine because the frozen player snapshot still has their old clubs.
- Virgil, A.Becker, Matheus N., Palmer, Haaland and Saka are all confirmed as 100% predicted starters by the automated real-lineup test.

Step 3 acceptance gates:
- Predicted starters at 100% start probability: PASS
- Non-predicted players at 0% start probability for valid XIs: PASS
- Exactly 11 expected starters per team: PASS
- Exactly one expected starting goalkeeper per team: PASS
- Exactly 990 expected player-minutes per team: PASS
- Goalkeeper cameo probability zero: PASS
- Invalid multi-goalkeeper locked XI rejected: PASS
- Predicted lineups limited to GW1: PASS
- Engine, browser and server share the same minutes decision: PASS by contract tests

Verification:
- Step 3 focused suite: 130 tests discovered, 129 passed, 1 externally blocked by the unavailable `@supabase/supabase-js` package.
- Full repository suite: 413 tests discovered, 403 passed, 10 externally blocked by the same missing dependency.
- No Step 3 football-logic assertion failed.
- Syntax checks passed for all changed JavaScript and MJS files.
- npm installation and the production build remain blocked by the environment's unavailable registry dependency; no build pass is claimed.

Files added or changed in Step 3:
- `config/lineups.json`
- `jobs/projections_run.mjs`
- `lib/engine/layer3_minutes.mjs`
- `lib/lineups.mjs`
- `lib/minutes_resolved.mjs`
- `lib/projections.js`
- `lib/server/load.mjs`
- `tests/data.test.mjs`
- `tests/engine.test.mjs`
- `tests/gw1_lineup_minutes.test.mjs`
- `tests/lineup-matching.test.mjs`
- `tests/minutes_contract.test.mjs`
- `tests/xpts_minutes_integrity.test.mjs`
- `tests/xpts_overhaul_contract.test.mjs`
- `tests/xpts_v14_contract.test.mjs`
- `docs/xpts-step3-lineup-minutes-2026-07-30.md`
- `ZEUS_XPTS_STATE.md`

### Step 4: Player rates, identity matching and role-aware priors
Status: COMPLETE

Completed:
- Loaded and aggregated the full 2025-26 `history_player_gw` expected-metrics data inside every projection run.
- Matched current players to historical profiles using conservative names, initials, surnames, team aliases and transfer-team lists.
- Filled missing id-backed prior fields from the independent history table, without requiring a manual database migration.
- Repaired Understat and archive ingestion so future refreshes do not discard established players or create avoidable archive duplicates.
- Added data-derived roles for goalkeepers, defenders, midfielders and forwards.
- Derived role-specific npxG and xA priors from the prior-season population at run time.
- Wired the measured `k_pos=20` setting into the actual rate shrinkage path, replacing the hidden fallback of 12.
- Persisted the post-shrink rates actually used by the simulation and included the derived role in `rate_source`.
- Extended the automatic xPTS audit with role-aware coverage.
- Bumped the engine model version to `engine-interim-2`.

Step 4 acceptance gates:
- Established player expected metrics can come from full historical xG/xA when Understat or ids fail: PASS
- Actual goals or assists are never substituted for xG/xA: PASS
- Long names, club aliases and transferred-team strings match conservatively: PASS
- Creator and holding-midfielder profiles receive different data-derived roles: PASS
- Allocation uses measured `k_pos=20`: PASS
- Goal and assist shares continue to conserve to one per team: PASS
- Diagnostics store rates actually used after shrinkage: PASS

Verification:
- Full repository suite: 480/480 passed using a local Supabase import stub because the real package cannot be installed in this execution environment.
- New Step 4 tests: 6/6 passed.
- Syntax checks passed for every changed JavaScript and MJS file.
- No production projection run was requested. Step 5 will be completed first, then one combined live run will validate both major model changes.

Files added or changed in Step 4:
- `config/engine-2026-27.json`
- `jobs/archive_2526.mjs`
- `jobs/projections_run.mjs`
- `jobs/understat_pull.mjs`
- `jobs/xpts_audit.mjs`
- `lib/engine/config.mjs`
- `lib/engine/history_profiles.mjs`
- `lib/engine/layer2_allocation.mjs`
- `lib/engine/player_data_matcher.mjs`
- `lib/engine/player_roles.mjs`
- `tests/minutes_contract.test.mjs`
- `tests/player_rates_roles.test.mjs`
- `docs/xpts-step4-player-rates-2026-07-30.md`
- `ZEUS_XPTS_STATE.md`

### Step 5: Penalties, attacking allocation and premium separation
Status: COMPLETE

Completed:
- Replaced raw team penalty counts with team rates shrunk toward the league penalty environment.
- Prevented clubs with zero prior penalties and promoted clubs from automatically receiving zero penalty expectation when league evidence exists.
- Made penalty expectation fixture-specific using the same attacking lambda that prices the match, with bounded square-root scaling.
- Converted current penalty hierarchy into explicit player shares.
- A single named rank-one taker receives the full share; multiple ranked takers split the role using stored confidence and rank.
- Historical penalty attempts are used only where no current duty hierarchy exists.
- Kept sampled penalty-taker identity through conversion and goal credit.
- Added separate expected penalty goals to simulation summaries and embedded penalty diagnostics in the existing quantiles JSON, avoiding a manual Supabase migration.
- Added prior-season role-level assist calibration on top of player xA and Step 4 role rates.
- Bounded role assist calibration to protect against small-group noise.
- Bumped the engine model version to `engine-interim-3`.

Step 5 acceptance gates:
- Zero-penalty teams shrink toward a non-zero league rate when league evidence exists: PASS
- Extreme team penalty counts shrink back toward the league: PASS
- Strong attacking fixtures carry more penalty expectation within fixed bounds: PASS
- One clear taker receives 100% duty share: PASS
- Multiple takers support confidence-based splits such as 90/10: PASS
- Penalty goals remain part of the sampled team goal total rather than being added on top: PASS
- Taker xPTS and expected goals rise while team goal conservation remains intact: PASS
- Role-level assist calibration is data-derived and ignored for thin samples: PASS

Verification:
- New Step 5 tests: 6/6 passed.
- Full repository suite: 486/486 passed using the existing local Supabase import stub.
- Syntax checks passed for every changed JavaScript and MJS file.
- The production projection run is deliberately deferred to Step 6 so Steps 3, 4 and 5 require only one live run and one CSV export.

Files added or changed in Step 5:
- `config/engine-2026-27.json`
- `jobs/projections_run.mjs`
- `lib/engine/config.mjs`
- `lib/engine/history_profiles.mjs`
- `lib/engine/layer2_allocation.mjs`
- `lib/engine/layer4_sim.mjs`
- `tests/penalties_premium_separation.test.mjs`
- `docs/xpts-step5-penalties-premium-2026-07-30.md`
- `ZEUS_XPTS_STATE.md`

### Step 6: Automated live validation and evidence-led correction
Status: IN PROGRESS

Completed in code:
- Added a REST-based exporter that selects the newest coherent active-gameweek projection generation and writes the exact full-table CSV required by the xPTS audit.
- Added a hard release gate covering engine coverage, predicted lineups, team minutes, goalkeeper selection, unavailable players, probability coherence, team-goal conservation and zero-minute events.
- Added named-player regression gates for Virgil, Alisson, Matheus Nunes, Palmer versus Neto/Caicedo, Saka versus Rice and Haaland versus Watkins.
- Added transparent before-and-after comparisons against the frozen pre-repair Supabase baseline.
- Added an automatic GitHub workflow triggered by the Step 6 upload. It installs dependencies, runs the full suite, builds the production site, runs live projections with existing Supabase secrets, exports the newest generation, audits it, uploads the full evidence and commits a small public report.
- A failed projection run or failed release gate is recorded as FAIL rather than silently accepting old rows.
- The user no longer needs to manually run projections or export a CSV for Step 6.

Verification before the production run:
- New Step 6 tests: 3/3 passed.
- Full repository suite: 489/489 passed under the existing local Supabase import stub.
- Workflow YAML parsed successfully and its embedded shell script was inspected after YAML normalisation.
- The old Supabase export correctly fails the new gate for the known old defects, proving the gate catches the exact issues it was built for.
- The production build and live Supabase projection run are intentionally delegated to GitHub Actions because that environment has the real npm registry and project secrets.

Files added or changed in Step 6:
- `.github/workflows/xpts-live-validation.yml`
- `config/xpts-validation-baseline.json`
- `jobs/export_xpts_validation.mjs`
- `jobs/xpts_release_gate.mjs`
- `tests/xpts_live_validation.test.mjs`
- `package.json`
- `docs/xpts-step6-live-validation-2026-07-30.md`
- `ZEUS_XPTS_STATE.md`

Step 6 is complete only after the automatic live report is reviewed and all critical gates pass, or after any reported failure is fixed and rerun.

Step 6.1 live-run finding:
- The projection run reached the real Supabase data and failed inside `normaliseTeamStarts` with `not enough free outfield players`.
- Cause: a player named in a validated XI was now hard-unavailable. Every unnamed squad player had correctly been locked to 0% start probability, so there was no eligible replacement for the newly vacant place.

Step 6.2 correction:
- `resolveMinutes` now preserves each player's pre-lineup start forecast as an internal replacement weight.
- A complete available predicted XI remains locked exactly: starters at 100%, named bench at 0%.
- If a named starter becomes unavailable, only the vacated goalkeeper or outfield place is reopened.
- Replacement probabilities follow the pre-lineup forecast rather than being distributed arbitrarily.
- Hard-unavailable players remain exactly zero.
- Targeted minutes tests: 23/23 passed.
- Full repository suite: 493/493 passed.
- Syntax checks passed.
- A local Next.js build was not available because the local dependency installation lacks the `next` binary; the GitHub workflow's production build had already passed before reaching the projection error.

Files changed in Step 6.2:
- `lib/minutes_resolved.mjs`
- `lib/engine/layer3_minutes.mjs`
- `tests/xpts_minutes_integrity.test.mjs`
- `ZEUS_XPTS_STATE.md`

### Step 7: Final repository, website and integration release
Status: NOT STARTED

Required before the project is declared finished:
- Remove obsolete repair workflows, duplicate installers, retired files and other GitHub clutter without deleting anything still imported.
- Run the complete test suite and production build after cleanup.
- Confirm the Vercel `/players` page loads the newest engine-only generation and renders the full player table without silent fallbacks.
- Confirm the website data status, current projection generation and player-table links remain correct after deployment.
- Confirm the OpenWeb/Open WebUI brief endpoint still authenticates correctly, returns its expected response fields and consumes the same newest engine-only projections as the website.
- Test the public API and website end to end after the final Vercel deployment.
- Keep cleanup and integration changes separate from football-model tuning so a deployment issue cannot be mistaken for an xPTS issue.

## Non-negotiable validation rules

- Do not tune only to famous players.
- Run the whole-table audit after every projection change.
- Structural invariants must pass.
- Historical or unseen data must not worsen materially.
- Change one attributable system at a time where practical.
- Never claim tests or a build passed unless the command completed.
