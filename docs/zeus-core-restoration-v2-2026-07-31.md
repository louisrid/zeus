# ZEUS Core Restoration V2

## Scope

This release restores the core product before Phase 2 football-model calibration continues.

- Generate and serve at least eight future gameweeks.
- Restore Players gameweek-range scoring.
- Restore Builder range selection and four-gameweek optimisation.
- Restore Builder `OPTIMISE XI` and Squad `OPTIMISE GW`.
- Resolve transferred players against the current projection team.
- Prevent tiny historical samples from collapsing likely-starter minutes.
- Prevent a tiny attacking sample from assigning and strengthening the same aggressive role.

## Interface

Players and Builder share one accessible gameweek-range component. Builder and Squad actions use the existing ZEUS colours, typography, radii and pressed states. Wide desktop layouts keep the action bar on one row where space permits. Defined breakpoints wrap controls into stable grids instead of clipping or overlapping them.

## Release action

Use only `.github/workflows/zeus-core-restoration-v2.yml`, displayed in Actions as `ZEUS Core Restoration V2`. The workflow is manual-only and independent of the older validation action.

The action clears old evidence, runs a source preflight, installs dependencies, runs all tests, builds Next.js, generates eight live gameweeks, audits the new generation, waits for the exact Vercel commit and verifies Players, Builder, Squad and OpenWeb. Every step writes its own log. A fresh final report and the logs are uploaded even when an earlier step fails.

## Local verification

- 519/519 repository tests passed with the local Supabase import stub.
- Core restoration preflight passed.
- Changed JS/MJS syntax and JSX parsing passed.
- Workflow YAML parsing passed.
- The production build is deliberately left to GitHub because this environment cannot install the repository's real npm packages.
