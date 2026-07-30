# ZEUS xPTS Project State

Updated: 30 July 2026, Step 1 complete

## Authoritative status

**CURRENT STEP: STEP 2 NOT STARTED**

**LAST COMPLETED STEP: STEP 1, exact repository frozen and repeatable audit integrated**

**NEXT REQUIRED WORK: Step 2, fix projection-generation selection, silent loader failures and mixed final projection routes before changing football coefficients.**

**LAST ASSISTANT STATUS LINE:** `ZEUS STATUS: STEP 1 COMPLETE | NEXT: UPLOAD STEP 1 ZIP, THEN BEGIN STEP 2 STRUCTURAL FIXES`

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
Status: NOT STARTED

Confirmed targets:
- `lib/projections.js` loads all projection rows and does not use `currentGeneration()`.
- `lib/server/load.mjs` also allows raw row order to choose the player projection.
- The browser loader converts failed projection reads into an empty row set, which can silently produce fallback output.
- `score.mjs` still manufactures final fallback xPTS for players without engine rows.
- Engine coverage must become an enforced integrity condition, not only a label.

Acceptance gates:
- Browser and server loaders select the same newest coherent generation deterministically.
- Projection query failure is visible and cannot silently become fallback numbers.
- Every eligible player has an engine projection or the run is explicitly incomplete.
- No final player ranking mixes engine xPTS with separately calculated fallback xPTS.
- Audit and contract tests cover all changes.

### Step 3: GW1 lineup and minutes architecture
Status: NOT STARTED

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
