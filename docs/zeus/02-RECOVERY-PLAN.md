# ZEUS Recovery Plan

## Recovery principle

The repeated failures came from trying to restore product features, redesign UI, repair data pipelines, change xP logic, modify workflows, clean the repository, and validate production in one release.

The recovery must separate those systems.

## Phase 0: Repository cleanup

### Goal

Remove obsolete one-off workflows and stale generated release evidence without changing application behaviour.

### Current position

The supplied snapshot is substantially cleaner. It contains 18 workflows and no V1 to V4 release workflows.

### Remaining rule

Do not do additional broad cleanup while recovering the baseline. A file should be removed only when its purpose is understood and no current code or test depends on it.

## Phase 1: Restore the last proven deployable baseline

### Goal

Return ZEUS to the smallest version that is known to build, deploy, and load.

### Process

1. Inspect Git history and Actions history.
2. Identify the last SHA where normal CI passed.
3. Identify the last SHA where the production build passed.
4. Identify the last SHA deployed successfully by Vercel.
5. Confirm which SHA corresponds to the working GW1-only product described by the user.
6. Create a recovery branch from that SHA.
7. Run the untouched baseline locally or in Codex:

```bash
npm install --no-audit --no-fund
npm test
npm run build
```

8. Push the recovery branch.
9. Confirm Vercel preview deployment loads.
10. Check the main pages without running projection writes.

### Prohibited in Phase 1

- No gameweek-range redesign
- No Builder feature changes
- No xP formula changes
- No minutes changes
- No fixture fixes unless required merely to build or load the baseline
- No Supabase writes
- No release workflow changes
- No migrations
- No repository cleanup

### Exit condition

A specific commit is proven to:

- Pass normal CI
- Pass the full test command
- Pass the Next production build
- Deploy successfully
- Load the expected pages
- Read its existing data without destructive operations

## Phase 2: Reapply product and UI improvements

Apply one focused pull request at a time onto the proven baseline.

### PR 2A: Players range

- Add the shared FROM and TO gameweek control
- Sum xP over the selected range
- Use the same range for VALUE and sorting
- Keep fixture display independent where intended
- Do not change projection generation

### PR 2B: Builder controls and range

- Add the shared gameweek range
- Default to the current four-gameweek window
- Make `BUILD SQUAD`, `FILL GAPS`, `IMPROVE`, and `OPTIMISE XI` use the same selected range
- Add or restore `CLEAR`, `COPY PAYLOAD`, plan naming, `SAVE PLAN`, and budget-left display
- Preserve locks, exclusions, formation, and undo
- Do not change xP generation

### PR 2C: Squad optimiser

- Add `OPTIMISE GWn`
- Keep the same 15 players
- Select legal XI, formation, bench order, captain, and vice-captain
- Preserve gameweek state and undo
- Do not change xP generation

### PR 2D: Responsive and visual integration

- Match existing ZEUS tokens, colours, type, radii, and button states
- Prove the wide desktop, normal laptop, and narrower layouts
- Prevent toolbar clipping and pitch-panel overflow
- No model or database changes

### Exit condition for each UI PR

- Full tests pass
- Production build passes
- Vercel preview loads
- Screenshots prove the changed surface
- No unrelated files changed

## Phase 3: Repair the eight-gameweek data pipeline

This begins only after Phase 2 is stable.

### Stage 3A: Read-only production audit

Build one diagnostic job that reads but does not write.

It must collect all blocking issues in one run rather than stopping at the first:

- Null or invalid fixture teams
- Null or invalid gameweeks
- Duplicate fixture IDs
- Historical and current-season fixture separation
- Missing referenced teams
- Current-team mapping conflicts
- Duplicate player projections
- Mixed projection timestamps
- Missing players by gameweek
- Missing gameweeks
- Server pagination limits
- Stale generations

It must reproduce the fixture `1000005` issue and report every similar row.

### Stage 3B: In-memory eight-gameweek generation

- Select the current eight-gameweek horizon
- Exclude irrelevant malformed finished archive rows from live generation
- Still block malformed current or upcoming fixtures
- Generate all gameweeks in memory
- Prove fixture and player coverage before any write

### Stage 3C: Staging write

- Write to a staging table, isolated schema, or dry-run output
- Read everything back through pagination
- Verify exact counts and timestamps
- Do not delete production rows

### Stage 3D: Controlled production write

Only after the read-only audit and staging proof pass:

- Write each gameweek as an isolated batch
- Preserve the previous complete generation until the new one is verified
- Re-read all rows
- Remove stale rows only after exact completeness is proven
- Verify live APIs and UI

### Prohibited in Phase 3

- No football-weight tuning
- No hard-coded named-player outputs
- No UI redesign
- No repository cleanup

## Phase 4: xP football-model improvement

Work one model subsystem at a time:

1. Minutes and substitute probabilities
2. Current-team and role identity
3. Low-sample shrinkage
4. Team attack and defence strength
5. Player attacking allocation
6. Penalties and set pieces
7. Clean-sheet calibration
8. Defender roles and DefCon
9. Saves and goalkeeper events
10. BPS and bonus
11. On-pitch event timing
12. Historical holdout validation

Every change needs a before-and-after baseline, named regression panel, team-level conservation checks, full tests, build, and historical evidence.

## Rollback strategy

- Preserve current `main` in an archive branch before recovery
- Tag the chosen working baseline
- Use one branch per phase or pull request
- Never force-push the recovery baseline over current work
- Merge only after acceptance evidence is visible
- If a PR fails, revert that PR rather than creating another all-in-one repair
