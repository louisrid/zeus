# ZEUS Baseline Audit

Audit date: 31 July 2026
Repository: `https://github.com/louisrid/zeus.git`
Mode: read-only baseline audit

## Executive finding

The exact remote `main` commit is:

```text
50a243a2e7cd65491dcde1865d4577727a239f2c
```

The evidence identifies `be3663102a834d730ef20e3ffdb1fbfa194d53e8` as the last directly runtime-verified GW1-only ZEUS commit and therefore the proposed recovery baseline.

That proposal is intentionally narrower than a claim that Phase 1 is already proven. The historical evidence for `be366310…` is strong, but it has two gaps against the current acceptance criteria:

- normal `ci` ran successfully on its immediate parent `d15b481…`, not on `be366310…` itself;
- the live verification proved `/`, `/players`, and `/api/health`, but did not explicitly request `/builder` or `/squad`.

The successful release job did remove only obsolete workflow/install files before testing, building, committing, and deploying `be366310…`. There was no difference in `app/`, `components/`, `lib/`, `jobs/`, `config/`, or `package.json` between `d15b481…` and `be366310…`. The exact post-cleanup tree that became `be366310…` passed 510 tests and a complete Next.js production build inside that job, then Vercel served the exact SHA with 564 real GW1 projections. This is sufficient to select it as the recovery candidate, but the next task must re-prove all current Phase 1 gates before calling the recovered branch working.

## Selected SHAs and evidence

| Question | Selected SHA | Evidence |
|---|---|---|
| Exact current `main` | `50a243a2e7cd65491dcde1865d4577727a239f2c` | Local `HEAD`, `origin/main`, and `git ls-remote origin refs/heads/main` all returned the same SHA after a fresh fetch. |
| Last commit where normal CI passed | `769b9327c5f2d9f099184932f7d3798408d4abfd` | GitHub Actions workflow `ci`, run **30638259117**, run number 200, succeeded. Tests job **91181320797** and build job **91181320590** both succeeded. The GitHub API returns no Action runs for later commits `e684eed…` or `50a243a…`. |
| Last commit where an explicit complete Next.js production build passed in GitHub Actions | `769b9327c5f2d9f099184932f7d3798408d4abfd` | Run **30638259117**, build job **91181320590**, step `Run npx next build`, succeeded. The current application/runtime/test/config tree is identical between `769b932…` and `50a243a…`; only workflows and documentation changed afterward. The exact current SHA nevertheless did not receive its own normal CI run. |
| Last commit successfully deployed by Vercel | `50a243a2e7cd65491dcde1865d4577727a239f2c` | GitHub deployment **5693567472**, status **16190152000**, environment `Production`, state `success`, description `Deployment has completed`. GitHub combined status context `Vercel` is `success`, targeting Vercel deployment `3FGL1YgYUyUhJPFRSSkT9LBhoVVd`. Deployment URL recorded by GitHub: `https://zeus-dokkj5i58-louisrids-projects.vercel.app`. This proves deployment completion, not live ZEUS data correctness. |
| Last directly runtime-verified GW1-only commit | `be3663102a834d730ef20e3ffdb1fbfa194d53e8` | Successful workflow `zeus-final-release`, run **30580328019**, job **90998684769**. It checked out `d15b481…`, deleted only obsolete workflow/install files, passed 510 tests, passed `npx next build` with 11 static pages generated, committed those deletions as `be366310…`, pushed it, waited for Vercel, and verified that the live SHA was exactly `be366310…`. Runtime checks returned HTTP 200 for Home, Players, and Health, found 564 current projections, zero stale rows, a complete OpenWeb response, and GW1 model `engine-interim-3+2026.27.0-prelaunch`. Artifact **8774376629** preserves the generated evidence. Vercel deployment **5682035396** has successful statuses **16157082754** and **16157304126**. |

Evidence links:

- CI run 200: `https://github.com/louisrid/zeus/actions/runs/30638259117`
- Baseline parent CI run 178: `https://github.com/louisrid/zeus/actions/runs/30580208965`
- Successful final release/runtime verification: `https://github.com/louisrid/zeus/actions/runs/30580328019`
- Final release artifact: `https://github.com/louisrid/zeus/actions/runs/30580328019/artifacts/8774376629`
- Failed V5 run: `https://github.com/louisrid/zeus/actions/runs/30635251387`

### Why `be366310…` is the proposed baseline

The normal CI run on `d15b481b42871e6719d2429f6d3f083185336213` was green:

- workflow `ci`, run **30580208965**, run number 178;
- tests job **90998274448** succeeded;
- build job **90998274396** succeeded, including `npx next build`.

The subsequent successful release run checked out `d15b481…`, removed eleven obsolete workflow/install paths, and then ran the full tests and production build before committing the deletion-only tree as `be366310…`. Git confirms that `d15b481…` to `be366310…` changed only:

- six obsolete `.github/workflows/` files;
- five obsolete `workflows-to-add/` files.

There were no application, component, library, job, configuration, package, or test changes between those two SHAs. The release job then proved Vercel was serving `be366310…`, not merely its parent.

Its live report recorded:

```text
Homepage: HTTP 200, 20173 bytes
Players: HTTP 200, 14389 bytes
Health: HTTP 200; ok
Current projections: 564
Stale rows reaching API: 0
Gameweek: 1
Live deployed SHA: be3663102a83
```

No later release-style run produced equivalent successful live evidence. Later xPTS validation, core-restoration, release-check, V4, and V5 attempts failed. Later normal CI and Vercel deployment successes prove code compilation/deployment, but not the live data and page checks above.

### Strict proof caveat

`be366310…` should be called the **proposed working baseline SHA**, not a completed recovered baseline. A new untouched recovery branch must still prove:

- normal CI on the exact branch SHA;
- full tests and complete Next production build;
- Vercel preview deployment of the exact SHA;
- HTTP/page availability for Dashboard, Players, Builder, Squad, and Health;
- existing read-only data access;
- no projection, cleanup, migration, or Supabase write.

## Proposed branch names

- Archive branch for current `main`: `archive/main-50a243a-2026-07-31`
- Recovery branch from the proposed baseline: `recovery/gw1-baseline-be36631`

Neither branch was created during this audit.

## Current GitHub Actions inventory

The current tree contains 18 workflow files:

```text
archive-2526.yml
backtest-engine.yml
backtest.yml
baseline-gate.yml
ci.yml
component-attribution.yml
fpl-pull.yml
history-load.yml
minutes-scorecard.yml
odds-pull.yml
penalty-duty.yml
presser-pull.yml
projections-run.yml
reliability.yml
rival-pull.yml
sweep.yml
understat-pull.yml
zeus-release-check-v5.yml
```

No workflow was dispatched or rerun in this audit. `ZEUS Release Check V5` was inspected only through its historical run, job, artifact, and source evidence.

## Deterministic fixture 1000005 failure

The current repository still validates the historical row before selecting the live horizon.

Current `jobs/projections_run.mjs` does this in order:

1. reads every row from `fixtures`;
2. maps every row through `numericId` for `id`, `fpl_id`, `home_team`, and `away_team` at lines 115-122;
3. only after that mapping calls `selectProjectionHorizon(...)` at lines 123-128.

Therefore an irrelevant finished historical fixture with `away_team = null` throws before `lib/projection_horizon.mjs` can filter for unfinished 2026/27 Premier League fixtures.

Historical V5 run **30635251387**, job **91171096812**, logged the deterministic error twice:

```text
Error: invalid away team for fixture 1000005: null
    at numericId (.../jobs/projections_run.mjs:56:59)
    at .../jobs/projections_run.mjs:121:16
    at main (.../jobs/projections_run.mjs:115:159)
```

The same run passed its source preflight, full test suite, production build, and live configuration steps before the captured projection stage failed. The workflow step was deliberately wrapped to preserve evidence, so the step named `Generate eight live gameweeks` appears successful while the final `Enforce release result` step failed. Artifact **8795046535**, `zeus-release-check-v5-30635251387-1`, contains that run's evidence.

The current archive importer also still skips any archive fixture whose offset `fpl_id` already exists. It inserts missing fixtures but does not repair a damaged existing row. No `lib/fixture_rows.mjs` repair helper exists in the current repository.

This audit did not query Supabase, so it does not independently establish whether production row `1000005` is still malformed today. It proves that the row was malformed during V5 run 30635251387 and that current source would still abort before horizon selection if the row remains malformed.

## Baseline-to-current-main high-level diff

Range:

```text
be3663102a834d730ef20e3ffdb1fbfa194d53e8
..
50a243a2e7cd65491dcde1865d4577727a239f2c
```

The range contains 26 commits and changes 78 files, with 6,419 insertions and 2,770 deletions.

| Top-level area | Changed files | High-level contents | Phase 1 treatment |
|---|---:|---|---|
| `.github/` | 4 | Removed `tidy`, `xpts-live-validation`, and `zeus-final-release`; added V5. There was substantial intermediate V2/V3/V4/release/tidy workflow churn that no longer appears in the final tree. | Do not carry or recreate the later release/cleanup lineage. Do not run V5. |
| `app/` | 4 | Players range initialization, Builder toolbar/range/responsive workspace, Squad atomic GW optimisation and toolbar, responsive CSS. | Potentially reusable later as separate UI PRs only. |
| `components/` | 3 | New shared `GameweekRange`, revised shared player controls, Candidate integration. | Potentially reusable later as the Players/Builder range PRs. |
| `config/` | 3 | New release-workflow metadata, cleanup paths, and interim xP/minutes/role parameters. | Exclude release/cleanup and model changes from Phase 1. |
| `docs/` plus root recovery files | 21 | Recovery context, restoration reports, status claims, and deletion of old live-validation evidence. | Preserve as historical/current context on `main`; do not use status claims as proof or alter the baseline tree before first proof. |
| `jobs/` | 9 | Eight-GW horizon, projection batching/integrity, pagination, release preflight, verification, permanent workflow preparation, FPL stamping, live verifier changes. | Defer to data-pipeline Phase 3 or exclude as release plumbing. |
| `lib/` | 14 | Horizon and batching modules, goal-environment fallbacks, current-team resolution, minutes/role calibration, lineup recency, future engine-anchored scoring, loading changes. | Defer pipeline work to Phase 3 and football/model work to Phase 4. |
| `tests/` | 20 | Tests coupled to the UI, pipeline, xP, workflow, integrity, pagination, and release changes above. | Reapply only with the corresponding isolated later subsystem. Do not weaken baseline tests. |

### Application and shared UI files changed

```text
app/builder/BuilderClient.jsx
app/globals.css
app/players/page.jsx
app/squad/SquadClient.jsx
components/Candidates.jsx
components/GameweekRange.jsx
components/PlayerControls.jsx
```

### Projection/data runtime files changed

```text
jobs/fpl_bootstrap.mjs
jobs/projection_integrity_v14.mjs
jobs/projections_run.mjs
jobs/verify_projection_horizon_report.mjs
jobs/verify_stored_projection_horizon.mjs
lib/data.js
lib/engine/layer0_market.mjs
lib/projection_batch.mjs
lib/projection_generation.mjs
lib/projection_horizon.mjs
lib/server/fpl_brief_api.mjs
lib/server/load.mjs
```

Release-only helpers such as `jobs/core_restoration_preflight.mjs`, `jobs/prepare_permanent_projection_workflows.mjs`, `jobs/verify_live_system.mjs`, and `jobs/xpts_release_gate.mjs` are classified separately below and should not enter baseline recovery.

### xP/current-team/minutes files changed

```text
config/engine-2026-27.json
lib/engine/config.mjs
lib/engine/layer3_minutes.mjs
lib/engine/player_roles.mjs
lib/lineups.mjs
lib/projections.js
lib/resolved_teams.mjs
lib/solver/score.mjs
```

`jobs/projections_run.mjs`, `lib/engine/layer0_market.mjs`, and several loader files cross the pipeline/model boundary and must remain deferred with the pipeline rather than being split into Phase 1.

## Newer UI/product work potentially worth reapplying

These are candidates for later isolated UI PRs, not Phase 1 cherry-picks:

1. **Shared gameweek range**
   - `components/GameweekRange.jsx`
   - `components/PlayerControls.jsx`
   - `components/Candidates.jsx`
   - first introduced in mixed commit `f085130ce7569e120e03566f694664b0ee54f704`, refined in `78c3c7a4d71d6483799c2425ae3beb62daf4733c`.

2. **Players FROM/TO range and live-GW reset**
   - `app/players/page.jsx`
   - commits `f085130…`, `78c3c7a…`, and `948aaed7aff98034b4eb150c52c7d7ffc33f68cd`.

3. **Builder range, toolbar, actions, and responsive workspace**
   - `app/builder/BuilderClient.jsx`
   - `app/globals.css`
   - shared range/control files above
   - commits `f085130…`, `78c3c7a…`, `948aaed…`, `fc485e113c6c36170d514d767bcd93030df9b4ea`, and `bd5702c27345d366c4c07b0fc65e86826158694f`.

4. **Squad `OPTIMISE GWn` atomic update and toolbar**
   - `app/squad/SquadClient.jsx`
   - commits `f085130…`, `78c3c7a…`, and `948aaed…`.

5. **Responsive CSS and integrity checks**
   - `app/globals.css`
   - `tests/css-integrity.test.mjs`
   - commits `78c3c7a…`, `948aaed…`, `fc485e1…`, and `bd5702c…`.

All named commits are mixed-scope uploads. None should be cherry-picked whole. Later work should reapply or path-select the smallest UI slice and then prove it with full tests, build, preview, and screenshots.

## Changes to defer or exclude from Phase 1

### Data-pipeline changes: defer to Phase 3

- Eight-gameweek selection and minimum-horizon enforcement in `lib/projection_horizon.mjs` and `jobs/projections_run.mjs`.
- FPL fixture season/competition stamping and horizon preparation in `jobs/fpl_bootstrap.mjs`.
- Odds-free future-fixture goal-environment fallbacks in `lib/engine/layer0_market.mjs`.
- Per-gameweek batching, future-first writes, completeness reports, and isolated persistence in `lib/projection_batch.mjs` and `lib/projection_generation.mjs`.
- Projection pagination, generation consistency, integrity, stale-row cleanup, horizon export, and stored-horizon verification.
- Server/API loading changes that expose the larger horizon.
- All related horizon, coverage, pagination, runtime, integrity, validation-mode, and permanent-workflow tests.
- The malformed archive-fixture repair itself. It belongs after a read-only production data audit and must not be smuggled into baseline recovery.

Principal mixed/pipeline commits include `993853e23d0f7ccf6767106118a460d71b85439e` and `bd5702c27345d366c4c07b0fc65e86826158694f`.

### xP/model changes: defer to Phase 4

- `minimum_role_nineties = 10` and low-sample role-prior fallback.
- `k_start_minutes = 4` and conditional starter-minute shrinkage.
- Predicted-lineup duplicate resolution by source recency.
- Current-team resolution using lineup and projection diagnostics in `lib/resolved_teams.mjs`.
- Loader and brief changes that apply resolved teams across fixtures, labels, and club limits.
- Future `engine-anchored` xPTS fallback in `lib/solver/score.mjs`.
- Projection-generation changes for player role, minutes, lineup, and team identity.
- All current-team, minutes, lineup, scoring, and named-regression tests coupled to those changes.

Most of this work entered through the mixed commit `f085130ce7569e120e03566f694664b0ee54f704`. Do not cherry-pick that commit as a unit.

### Release, cleanup, and workflow changes: exclude from Phase 1

- `ZEUS Release Check V5` and all V1-V4/core-restoration release-check lineage.
- The intermediate workflow creation/deletion commits from `237289c…` through `e684eed…`.
- Repository tidy and cleanup automation, including checksum/protected-file logic.
- `config/release-workflow.json` and later `config/repository-cleanup-paths.txt` changes.
- `jobs/core_restoration_preflight.mjs`.
- `jobs/prepare_permanent_projection_workflows.mjs`.
- release-specific changes in `jobs/verify_live_system.mjs` and `jobs/xpts_release_gate.mjs`.
- generated restoration reports, committed PASS reports, and stale validation JSON/Markdown.
- tests whose only purpose is to enforce the later release workflow or cleanup manifest.
- removal or recreation of baseline-era workflows during initial proof. Leave the baseline tree untouched and do not run them.

## Smallest next implementation task

After approval, perform one no-code baseline proof task:

1. create `archive/main-50a243a-2026-07-31` at exact current main `50a243a2e7cd65491dcde1865d4577727a239f2c`;
2. create `recovery/gw1-baseline-be36631` from `be3663102a834d730ef20e3ffdb1fbfa194d53e8`;
3. make no source, test, workflow, migration, configuration, or documentation changes on the recovery branch;
4. run `npm install --no-audit --no-fund`, `npm test`, and `npm run build`;
5. push only the recovery branch and obtain a Vercel preview;
6. verify the exact preview SHA and read-only availability of `/`, `/players`, `/builder`, `/squad`, and `/api/health`;
7. record all evidence and stop. Do not run projections, cleanup, migrations, V5, or any Supabase write.

## Risks and unresolved unknowns

- No historical commit has evidence satisfying every current Phase 1 gate on one exact SHA. `be366310…` is the strongest candidate, but Builder and Squad were not explicitly requested by its live verifier and normal `ci` did not run on that exact SHA.
- The current Vercel deployment of `50a243a…` is successful, but no accessible evidence proves current page content, live GW1 data, Builder/Squad behavior, or health against that deployment.
- The audit did not directly request any live ZEUS page because doing so could indirectly read Supabase, which the task prohibited.
- Supabase was not accessed. Applied migrations, current fixture contents, current projection generations, and whether row `1000005` remains malformed are unknown.
- The V5 historical log proves the row was malformed on 31 July 2026 and the current source order proves that the same row would still fail before horizon selection.
- GitHub deployment records and combined Vercel statuses were accessible; Vercel dashboard/build logs and Vercel project configuration were not directly accessible.
- The GitHub CLI (`gh`) is not installed. GitHub Actions logs were read through the connected GitHub app, and public GitHub REST endpoints supplied run/job/deployment metadata.
- The final-release evidence artifact **8774376629** expires on 28 October 2026. The failed V5 artifact **8795046535** expires on 30 August 2026.
- No local dependency install, test suite, or production build was run in this audit, because those create generated files and the task requested a read-only historical baseline audit. Historical Actions evidence was used instead.
- No branch or tag was created, no workflow was triggered, no deployment was initiated, and nothing was pushed.

## Exact commands and repository queries used

### Checkout and required reading

```bash
mkdir -p work
git clone https://github.com/louisrid/zeus.git work/zeus
sed -n '1,260p' AGENTS.md
rg --files docs/zeus | sort -V
wc -l docs/zeus/README.md docs/zeus/00-PROJECT-BRIEF.md docs/zeus/01-CURRENT-STATE.md docs/zeus/02-RECOVERY-PLAN.md docs/zeus/03-V2-PRODUCT-SCOPE.md docs/zeus/04-XPTS-ARCHITECTURE.md docs/zeus/05-COMPETITOR-SYSTEM.md docs/zeus/06-KNOWN-FAILURES.md docs/zeus/07-DECISIONS.md docs/zeus/08-ACCEPTANCE-CRITERIA.md docs/zeus/09-ACTIVE-TASKS.md docs/zeus/10-SOURCE-INDEX.md docs/zeus/11-CODEX-FIRST-TASK.md docs/zeus/PACK-MANIFEST.json docs/DECISIONS.md
sed -n '1,400p' docs/zeus/README.md
sed -n '1,400p' docs/zeus/00-PROJECT-BRIEF.md
sed -n '1,400p' docs/zeus/01-CURRENT-STATE.md
sed -n '1,400p' docs/zeus/07-DECISIONS.md
sed -n '1,400p' docs/zeus/02-RECOVERY-PLAN.md
sed -n '1,400p' docs/zeus/08-ACCEPTANCE-CRITERIA.md
sed -n '1,400p' docs/zeus/03-V2-PRODUCT-SCOPE.md
sed -n '1,400p' docs/zeus/04-XPTS-ARCHITECTURE.md
sed -n '1,220p' docs/zeus/05-COMPETITOR-SYSTEM.md
sed -n '221,440p' docs/zeus/05-COMPETITOR-SYSTEM.md
sed -n '441,700p' docs/zeus/05-COMPETITOR-SYSTEM.md
sed -n '1,700p' docs/zeus/06-KNOWN-FAILURES.md
sed -n '1,700p' docs/zeus/09-ACTIVE-TASKS.md
sed -n '1,700p' docs/zeus/10-SOURCE-INDEX.md
sed -n '1,700p' docs/zeus/11-CODEX-FIRST-TASK.md
sed -n '1,700p' docs/zeus/PACK-MANIFEST.json
sed -n '1,180p' docs/DECISIONS.md
sed -n '181,360p' docs/DECISIONS.md
sed -n '361,540p' docs/DECISIONS.md
sed -n '541,720p' docs/DECISIONS.md
sed -n '721,900p' docs/DECISIONS.md
sed -n '901,1080p' docs/DECISIONS.md
sed -n '1081,1260p' docs/DECISIONS.md
sed -n '1261,1460p' docs/DECISIONS.md
rg --files -g 'AGENTS.md'
```

### Git identity, history, branches, tags, and diffs

```bash
git remote -v
git fetch origin --prune
git status --short
git rev-parse HEAD
git rev-parse origin/main
git ls-remote origin refs/heads/main
git log --oneline --decorate --graph -30
git branch -a
git tag --list
git show-ref --tags
git rev-parse 'v0-baseline^{commit}'
git show -s --format=fuller v0-baseline
git log --format='%H%x09%ad%x09%s' --date=iso-strict --all --reverse
git rev-list --count be3663102a834d730ef20e3ffdb1fbfa194d53e8..origin/main
git log --reverse --format='%H%x09%ad%x09%s' --date=iso-strict be3663102a834d730ef20e3ffdb1fbfa194d53e8..origin/main
git log --reverse --format='COMMIT %H %ad %s' --date=iso-strict --name-status be3663102a834d730ef20e3ffdb1fbfa194d53e8..origin/main
git diff --stat be3663102a834d730ef20e3ffdb1fbfa194d53e8..origin/main
git diff --dirstat=files,0 be3663102a834d730ef20e3ffdb1fbfa194d53e8..origin/main
git diff --name-status be3663102a834d730ef20e3ffdb1fbfa194d53e8..origin/main
git diff --name-only be3663102a834d730ef20e3ffdb1fbfa194d53e8..origin/main | awk -F/ '{count[$1]++} END {for (k in count) print k, count[k]}' | sort
git diff --name-status d15b481b42871e6719d2429f6d3f083185336213..be3663102a834d730ef20e3ffdb1fbfa194d53e8
git diff --quiet d15b481b42871e6719d2429f6d3f083185336213..be3663102a834d730ef20e3ffdb1fbfa194d53e8 -- app components lib jobs config package.json
git diff --name-status 769b9327c5f2d9f099184932f7d3798408d4abfd..50a243a2e7cd65491dcde1865d4577727a239f2c
git diff --quiet 769b9327c5f2d9f099184932f7d3798408d4abfd..50a243a2e7cd65491dcde1865d4577727a239f2c -- app components lib jobs config package.json tests
```

Targeted `git diff --unified=3` or `--unified=2` queries were run for every UI file listed above and for:

```text
config/engine-2026-27.json
lib/engine/config.mjs
lib/engine/layer0_market.mjs
lib/engine/layer3_minutes.mjs
lib/engine/player_roles.mjs
lib/lineups.mjs
lib/projection_batch.mjs
lib/projection_horizon.mjs
lib/projections.js
lib/resolved_teams.mjs
lib/solver/score.mjs
```

Per-file history queries used this exact form:

```bash
git log --oneline be3663102a834d730ef20e3ffdb1fbfa194d53e8..origin/main -- '<path>'
```

### Current source and workflow inspection

```bash
rg --files .github/workflows | sort
rg -n '^(name|on):' .github/workflows
sed -n '1,120p' .github/workflows/ci.yml
rg -n "invalid (home|away) team|home_team|away_team|projection horizon|select.*horizon|fixtureRows|fixtures" jobs/projections_run.mjs lib/projection_horizon.mjs jobs/archive_2526.mjs
sed -n '1,145p' jobs/projections_run.mjs
sed -n '1,110p' lib/projection_horizon.mjs
sed -n '95,145p' jobs/archive_2526.mjs
rg --files lib | rg 'fixture_rows'
```

### GitHub REST queries

The following read-only endpoints were queried with `curl --fail --silent --show-error` and filtered with `jq`:

```text
GET https://api.github.com/repos/louisrid/zeus/actions/runs?per_page=100
GET https://api.github.com/repos/louisrid/zeus/actions/workflows/ci.yml/runs?branch=main&status=completed&per_page=100
GET https://api.github.com/repos/louisrid/zeus/actions/runs?head_sha=<SHA>&per_page=100
GET https://api.github.com/repos/louisrid/zeus/actions/runs/30638259117/jobs?per_page=100
GET https://api.github.com/repos/louisrid/zeus/actions/runs/30580208965/jobs?per_page=100
GET https://api.github.com/repos/louisrid/zeus/actions/runs/30580328019/jobs?per_page=100
GET https://api.github.com/repos/louisrid/zeus/actions/runs/30580328019/artifacts?per_page=100
GET https://api.github.com/repos/louisrid/zeus/actions/runs/30635251387/jobs?per_page=100
GET https://api.github.com/repos/louisrid/zeus/actions/runs/30635251387/artifacts?per_page=100
GET https://api.github.com/repos/louisrid/zeus/deployments?per_page=100
GET https://api.github.com/repos/louisrid/zeus/deployments?sha=<SHA>&per_page=10
GET https://api.github.com/repos/louisrid/zeus/deployments/5693567472/statuses
GET https://api.github.com/repos/louisrid/zeus/deployments/5693065109/statuses
GET https://api.github.com/repos/louisrid/zeus/deployments/5693032274/statuses
GET https://api.github.com/repos/louisrid/zeus/deployments/5669147460/statuses
GET https://api.github.com/repos/louisrid/zeus/deployments/5669108778/statuses
GET https://api.github.com/repos/louisrid/zeus/deployments/5681993803/statuses
GET https://api.github.com/repos/louisrid/zeus/deployments/5682035396/statuses
```

The `head_sha` queries were made for `50a243a…`, `e684eed…`, `769b932…`, `d15b481…`, and `be366310…`. Deployment-by-SHA queries were made for `6da76a8…`, `18888f3…`, `d15b481…`, and `be366310…`.

### Connected GitHub app queries

```text
github_fetch_workflow_job_logs(repo_full_name="louisrid/zeus", job_id=90998684769)
github_fetch_workflow_job_logs(repo_full_name="louisrid/zeus", job_id=91171096812)
github_get_commit_combined_status(repo_full_name="louisrid/zeus", commit_sha="50a243a2e7cd65491dcde1865d4577727a239f2c")
github_get_commit_combined_status(repo_full_name="louisrid/zeus", commit_sha="769b9327c5f2d9f099184932f7d3798408d4abfd")
github_get_commit_combined_status(repo_full_name="louisrid/zeus", commit_sha="be3663102a834d730ef20e3ffdb1fbfa194d53e8")
```

### Unavailable commands or systems

```bash
gh auth status
gh repo view louisrid/zeus --json nameWithOwner,defaultBranchRef,url,visibility
```

Both failed because `gh` is not installed. No Supabase query, Vercel API query, live ZEUS page request, test command, build command, workflow dispatch, deployment command, branch creation, commit, or push was performed.
