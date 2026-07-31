# Codex First Task

## Purpose

The first Codex task is a read-only baseline audit. It must not become another broad repair attempt.

## Required prompt

Use the prompt below in Codex after this context pack is committed to the repository.

```text
You are working on the ZEUS repository at github.com/louisrid/zeus.

First read AGENTS.md and every file in docs/zeus in numeric order. Treat them as the current recovery context. Read docs/DECISIONS.md afterward for historical product decisions that are not superseded.

This is a READ-ONLY BASELINE AUDIT. Do not edit application code, tests, workflows, migrations, configuration, or documentation other than the single audit report requested below. Do not run any live GitHub Action. Do not access, write to, delete from, or migrate Supabase. Do not run ZEUS Release Check V5. Do not push to main.

Inspect the exact connected Git repository and its Git history. Also inspect available GitHub Actions and deployment evidence.

Establish with evidence:
1. The exact current main commit SHA.
2. The last commit where normal CI passed.
3. The last commit where the complete Next.js production build passed.
4. The last commit successfully deployed by Vercel.
5. Which commit is the last genuinely working GW1-only ZEUS version described in docs/zeus/01-CURRENT-STATE.md.
6. The complete high-level diff between that working baseline and current main.
7. Which newer changes are reusable UI/product work.
8. Which newer changes belong to the projection pipeline and must be deferred.
9. Which newer changes belong to xP model calibration and must be deferred.
10. Which release, cleanup, and workflow changes should not be carried into baseline recovery.

Pay particular attention to the known deterministic current failure involving archived fixture 1000005 with away_team null. Confirm whether the current repository still validates that historical row before selecting the live horizon. Do not fix it in this task.

Create exactly one file:

  docs/zeus/12-BASELINE-AUDIT.md

The report must include:
- Evidence for every selected SHA
- Action run names or identifiers where available
- Proposed working baseline SHA
- Proposed archive branch name for current main
- Proposed recovery branch name
- A concise file-area diff from baseline to current main
- A list of newer UI files or commits potentially worth reapplying later
- A list of data-pipeline, xP, workflow, and cleanup changes to exclude from Phase 1
- The smallest next implementation task
- Risks and unresolved unknowns

Do not implement the recovery yet. Do not weaken or change tests. Do not claim a commit is working unless the evidence proves CI, build, deployment, and page availability.

At the end, report the exact commands and repository queries you used, and clearly state anything you could not access.
```
