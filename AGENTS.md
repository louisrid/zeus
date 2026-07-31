# ZEUS Codex Instructions

## Read order

Before changing any file, read these in order:

1. `AGENTS.md`
2. `docs/zeus/README.md`
3. `docs/zeus/01-CURRENT-STATE.md`
4. `docs/zeus/07-DECISIONS.md`
5. `docs/zeus/02-RECOVERY-PLAN.md`
6. `docs/zeus/08-ACCEPTANCE-CRITERIA.md`
7. The remaining numbered files in `docs/zeus/`
8. `docs/DECISIONS.md` for older product decisions that have not been explicitly superseded

## Authority

For current recovery work, use this order of authority:

1. The exact checked-out repository, its Git history, and real CI results
2. `docs/zeus/01-CURRENT-STATE.md`
3. `docs/zeus/07-DECISIONS.md`
4. `docs/zeus/02-RECOVERY-PLAN.md`
5. `docs/zeus/08-ACCEPTANCE-CRITERIA.md`
6. Existing `docs/DECISIONS.md`
7. Older handovers, status files, release reports, chats, and assistant claims

Do not treat `STATUS.md`, `ZEUS_XPTS_STATE.md`, old release reports, or a previous assistant statement as proof. They contain claims from failed release attempts and may be stale.

## Current operating mode

ZEUS is in recovery mode.

The first goal is not to complete V2 or improve xPts. The first goal is to restore the smallest proven deployable baseline from Git history.

The work order is fixed:

1. Identify and restore the last genuinely green baseline.
2. Prove it with normal CI, production build, and deployment.
3. Reapply UI and product features in small isolated pull requests.
4. Repair the eight-gameweek data pipeline using a read-only audit first.
5. Resume football-model calibration only after the product and data pipeline are stable.

Do not combine these phases.

## Non-negotiable safety rules

- Never edit `main` directly. Use a dedicated branch.
- One logical system per branch or pull request.
- Do not combine UI changes with projection-engine, Supabase, workflow, migration, or xPts changes.
- Do not run a live projection, cleanup, migration, or Supabase write unless the task explicitly authorises it.
- Do not delete current projections during development.
- Do not run `ZEUS Release Check V5` during baseline recovery or UI recovery.
- Do not modify GitHub Actions unless the active task is specifically a workflow task.
- Do not add a new workflow version merely because an old one failed.
- Do not claim success from selected tests, YAML parsing, shell syntax, or a synthetic replay.
- A completed implementation requires the exact repository state to pass the required full commands and acceptance gates.
- Stop at the first genuine blocker. Report it clearly. Do not work around it by weakening tests or deleting checks.
- Never make named-player hard-coded boosts or reductions. Fix systems, not individual outputs.
- Never silently catch projection, database, fixture, or coverage failures.
- Never use an old PASS artifact as evidence for a new commit.
- Never generate separate code and workflow deliveries that were not tested together in the exact assembled repository.

## Required commands

For ordinary code changes, run from the repository root:

```bash
npm install --no-audit --no-fund
npm test
npm run build
```

Use `npm ci` only when a valid committed `package-lock.json` exists.

For a baseline audit, also inspect:

```bash
git status --short
git log --oneline --decorate --graph -30
git branch -a
git tag --list
```

Do not invent a commit SHA. If Git history is unavailable, stop and say so.

## Delivery standard

Every completed task must report:

- Branch name
- Base commit SHA
- Final commit SHA
- Exact files changed
- Exact commands run
- Test count and result
- Build result
- Deployment result when relevant
- Anything not verified
- Rollback instructions

Keep the implementation small. Preserve working code unless there is direct evidence it must change.

## User workflow constraint

The user primarily works through GitHub and does not want terminal-dependent manual steps. Prefer branches, pull requests, and GitHub-visible evidence. Do not ask the user to manually assemble multiple incompatible files.
