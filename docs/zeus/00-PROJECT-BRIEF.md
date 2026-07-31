# ZEUS Project Brief

## What ZEUS is

ZEUS is a private desktop web application for Fantasy Premier League decision support. Its design target is to help one user pursue world rank one in the 2026/27 season through an automated data, projection, optimisation, and review system.

It is not a public SaaS product. It has no normal user accounts and does not submit transfers to FPL.

## Main objectives

ZEUS should:

- Collect FPL, fixture, odds, team-news, historical, and player-performance data
- Produce coherent player expected-points projections
- Explain where each projection comes from
- Build legal 15-player squads
- Optimise starting elevens, captains, vice-captains, and bench order
- Support multi-gameweek planning
- Show player, fixture, ownership, price, and model context in one desktop interface
- Export a complete decision payload for use in an external AI chat
- Track projection quality over time

The user remains the final decision-maker. ZEUS does not auto-submit FPL actions.

## Stack

- Next.js 14 using the App Router
- React 18
- Supabase Postgres
- Vercel deployment
- GitHub Actions for scheduled jobs and CI
- FPL API
- The Odds API
- Understat and historical FPL data

The supplied repository snapshot contains:

- 9 page routes
- 9 API routes
- 18 GitHub Actions workflows
- 41 test files
- 24 numbered migrations
- 28 job scripts
- 18 shared components

## Main surfaces

### Dashboard `/`

High-level current-gameweek view, squad context, fixture information, and navigation into the main tools.

### Builder `/builder`

Creates or improves a legal 15-player squad. It supports locks, exclusions, a selected gameweek range, shortlist context, saving plans, and payload export.

### Squad `/squad`

Displays saved plans and per-gameweek team states. It should support one-action optimisation of the starting eleven, bench, captain, and vice-captain for a selected gameweek.

### Players `/players`

Searchable and sortable player table. It should sum xP over a selected FROM and TO gameweek range.

### Player `/player/[id]`

Detailed player projection and component context.

### Line-ups `/lineups`

Published predicted line-ups and their source context.

### Analysis `/analysis`

Model and decision analysis.

### News `/news`

Team news and relevant notices.

### Status `/status`

Pipeline and system status.

## API surfaces

The repository includes API routes for health, brief generation, comparison, optimisation, drafts, plans, chips, elite ownership, and FPL entry data.

The model brief is intended to support both normal readable output and structured JSON for OpenWeb/Open WebUI.

## Core systems

ZEUS has four distinct systems that must not be changed together without a specific reason:

1. **Data ingestion**
   - FPL bootstrap and fixtures
   - Odds
   - Understat
   - Historical archive
   - Team news and predicted line-ups
   - Ownership and rival data

2. **Projection engine**
   - Team goal environment
   - Scoreline simulation
   - Player attacking allocation
   - Minutes and appearance probabilities
   - FPL scoring, bonus, saves, defensive contribution, and cards

3. **Product and solver**
   - Player sorting and comparison
   - Squad construction
   - Starting-eleven optimisation
   - Captaincy and bench order
   - Saved plans and gameweek timeline

4. **Release and operations**
   - CI
   - Scheduled data jobs
   - Projection writes
   - Supabase integrity checks
   - Vercel deployment verification

## Vocabulary

- **xP**: Projected FPL points
- **xPTS**: Historical wording in some code, chats, and release work. Product UI may use xP according to existing design decisions
- **Plan**: A saved 15-player base squad and its gameweek states
- **Engine**: The simulation path under `lib/engine/` and `jobs/projections_run.mjs`
- **Fallback scorer**: The separate scoring route under `lib/solver/score.mjs` and related display code. It must not silently replace current engine projections
- **Projection generation**: A coherent set of player rows produced by one run and one timestamp
- **DefCon**: FPL defensive-contribution scoring

## Constraints

- Desktop-first private tool
- No automated FPL credential storage or submission
- Low operating cost
- No invented parameters presented as measured truth
- No broad AI-generated recommendations inside the app unless explicitly approved
- No hard-coded fixes for named players
- No claim of model accuracy without historical and live evidence

## Current strategic priority

The immediate priority is recovery, not feature expansion:

1. Restore a proven deployable baseline
2. Reapply product and UI improvements safely
3. Repair the eight-gameweek data pipeline
4. Resume xP model work
