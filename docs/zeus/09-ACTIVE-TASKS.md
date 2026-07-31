# ZEUS Active Tasks

Updated: 31 July 2026

## Active task: baseline audit and recovery proposal

### Objective

Identify the last genuinely working ZEUS baseline and design the smallest restoration PR.

### Codex must do now

1. Read `AGENTS.md` and this entire context pack.
2. Inspect the real Git history and GitHub Actions history.
3. Record current `main` SHA.
4. Find the last SHA where normal CI passed.
5. Find the last SHA where Next build passed.
6. Find the last SHA deployed successfully by Vercel.
7. Identify the working GW1-only baseline described by the user.
8. Compare that baseline with current `main`.
9. Classify current changes into:
   - Safe UI/product work to reapply later
   - Data-pipeline work to defer
   - xP model work to defer
   - Workflow and cleanup work to exclude
10. Produce `docs/zeus/12-BASELINE-AUDIT.md`.

### Do not do yet

- Do not edit application code
- Do not run V5
- Do not write to Supabase
- Do not run migrations
- Do not change workflows
- Do not implement UI
- Do not change xP
- Do not merge or push to `main`

### Required audit output

- Exact SHAs and evidence links or Action run identifiers
- Proposed baseline SHA
- Diff summary from baseline to current main
- Proposed archive branch name
- Proposed recovery branch name
- Exact smallest next implementation task
- Risks and unknowns

## Next task after audit approval

Create a recovery branch from the approved baseline SHA, run tests and build without modifications, deploy a preview, and document results.

## Later queued tasks

1. Players range PR
2. Builder range and actions PR
3. Squad optimise PR
4. UI responsive integration PR
5. Read-only production data audit
6. Fixture archive repair
7. Eight-gameweek in-memory generation
8. Staging persistence
9. Controlled live persistence
10. xP model work by subsystem
