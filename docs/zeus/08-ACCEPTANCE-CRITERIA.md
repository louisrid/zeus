# ZEUS Acceptance Criteria

## General evidence required for every PR

- Branch name
- Base SHA
- Final SHA
- Clean `git status`
- Exact changed-file list
- Full `npm test` result
- `npm run build` result
- Relevant focused tests
- Preview deployment result when UI or runtime behaviour changes
- No unrelated file changes
- Explicit list of anything not verified

## Phase 1: Baseline recovery

### Required

- Current `main` archived safely
- Last green baseline identified from GitHub evidence
- Baseline SHA recorded
- Baseline branch created from that SHA
- Dependency installation succeeds
- Full test suite succeeds without deleting or weakening tests
- Next production build succeeds
- Vercel preview deployment succeeds
- Dashboard loads
- Players loads
- Builder loads
- Squad loads
- Health endpoint returns successfully
- Existing data can be read
- No projection write, migration, or cleanup action was run

### Failure conditions

- Choosing a baseline from documentation rather than Git history
- Carrying current V5 workflow changes into the baseline without proof
- Fixing UI or xP during baseline identification
- Suppressing a failing test

## Phase 2A: Players range

- FROM and TO controls render
- FROM cannot exceed TO
- Range is limited to available gameweeks
- xP equals the sum of direct rows in the selected range
- VALUE uses the same xP total
- Sorting uses the same xP total
- Reset returns to current gameweek
- No projection-generation code changed
- Wide and normal laptop screenshots supplied

## Phase 2B: Builder

- Default range is current GW through current GW plus three where available
- 1, 4, and 8 GW presets work
- BUILD SQUAD uses selected range
- FILL GAPS uses selected range
- IMPROVE uses selected range
- OPTIMISE XI uses selected range
- Locks and exclusions are respected
- Legal 15-player structure
- Budget and maximum-three-per-club rules hold
- Save, clear, undo, and payload work
- No projection-generation code changed

## Phase 2C: Squad optimiser

- Keeps the same 15 players
- Produces legal XI and formation
- Orders bench legally
- Selects captain and vice-captain
- Applies atomically
- Undo restores the previous state
- Works independently for the selected gameweek

## Phase 2D: UI integration

- No toolbar clipping at target desktop and laptop widths
- No horizontal overflow caused by Builder workspace
- Pitch and player panel stack before collision
- Buttons use ZEUS tokens and states
- No new font, colour system, or generic component style
- Existing pages remain visually consistent

## Phase 3A: Read-only data audit

- No database writes
- Reads all fixture rows through pagination
- Reports all null home teams
- Reports all null away teams
- Reports all null or invalid gameweeks
- Reports duplicate fixture identity
- Separates current and historical seasons
- Reports unresolved team references
- Reports player-team conflicts
- Reports mixed and duplicate projection generations
- Reports every missing target gameweek
- Reports every missing expected player
- Reproduces fixture `1000005`
- Produces one complete machine-readable and human-readable report

## Phase 3B: In-memory horizon

- Exactly the target eight gameweeks selected
- Every selected current fixture receives a valid goal environment
- No selected current fixture is silently skipped
- Malformed finished historical fixtures do not abort the live horizon
- Malformed current or future fixtures block
- Expected player coverage proven before writes
- No production write

## Phase 3C: Staging persistence

- Each gameweek written separately
- Every row has one run timestamp and model version
- Full read-back through pagination
- Exact counts per gameweek
- No stale or duplicate rows in staging
- No production cleanup

## Phase 3D: Production persistence

- Previous complete generation remains available until new generation is proven
- All eight gameweeks written
- Full read-back succeeds
- Exact active-player count per gameweek
- One coherent timestamp
- Stale rows removed only after proof
- Second read confirms current rows remain and stale rows are gone
- APIs serve all eight gameweeks
- Vercel serves the exact deployed SHA

## Phase 4: Model changes

For each model subsystem:

- One subsystem changed
- Named regression panel recorded before and after
- Team expected goals conserve
- Team expected assists reconcile
- Starter probabilities and minutes reconcile
- No player-specific hard-coding
- Historical holdout improves or the change is rejected
- Full tests and build pass
- Component output explains the changed player totals

## Release gate language

A task is:

- **Implemented** when code exists
- **Locally passing** when required local commands pass
- **CI passing** when GitHub checks pass on the exact SHA
- **Preview proven** when Vercel preview and manual surface checks pass
- **Production proven** only after the exact production deployment and runtime checks pass

Do not collapse these states into "done".
