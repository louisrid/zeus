# ZEUS xPTS Project State

Updated: 30 July 2026, Step 3 complete

## Authoritative status

**CURRENT STEP: STEP 4 NOT STARTED**

**LAST COMPLETED STEP: STEP 3, GW1 predicted lineups and team minutes rebuilt**

**NEXT REQUIRED WORK: Step 4, repair player-rate coverage and introduce role-aware attacking priors.**

**LAST ASSISTANT STATUS LINE:** `ZEUS STATUS: STEP 3 COMPLETE | NEXT: UPLOAD STEP 3 ZIP, THEN BEGIN STEP 4 PLAYER RATES AND ROLE-AWARE PRIORS`

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
Status: NOT STARTED

### Step 5: Penalties, attacking allocation and premium separation
Status: NOT STARTED

### Step 6: Full validation and final package
Status: NOT STARTED

## Non-negotiable validation rules

- Do not tune only to famous players.
- Run the whole-table audit after every projection change.
- Structural invariants must pass.
- Historical or unseen data must not worsen materially.
- Change one attributable system at a time where practical.
- Never claim tests or a build passed unless the command completed.
