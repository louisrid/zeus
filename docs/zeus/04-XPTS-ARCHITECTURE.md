# ZEUS xP Architecture

## Purpose

This document explains the intended projection architecture and the major historical failure modes. It does not authorise xP changes during baseline or UI recovery.

## Two historically separate scoring paths

ZEUS has historically contained two different concepts:

1. **Raw engine projection**
   - Produced by the joint match simulation
   - Stored in projection rows as values such as `ep_mean`

2. **App-facing display or fallback scoring**
   - Decided whether to trust the engine row
   - Could apply another minutes multiplier
   - Could reject an engine row as stale
   - Could replace it with archive, Understat, or positional fallback output

This separation caused major inconsistencies. A player's stored engine xP could be reasonable while the screen displayed a different, inflated, or compressed value.

The intended architecture is one coherent engine route for current projections. Fallback information may be diagnostic, but it must not silently become the final displayed xP for selected active players.

## Main code areas

### Projection generation

- `jobs/projections_run.mjs`
- `lib/engine/`
- `lib/projection_batch.mjs`
- `lib/projection_generation.mjs`
- `lib/projection_horizon.mjs`
- `lib/projection_runtime.mjs`
- `lib/projections.js`

### Minutes and line-ups

- `lib/minutes_resolved.mjs`
- `lib/lineups.mjs`
- Engine minutes layers under `lib/engine/`
- `config/lineups.json`

### App scoring and optimisation

- `lib/solver/score.mjs`
- `lib/solver/optimise.mjs`
- `lib/solver.js`
- `lib/squad.js`
- `lib/captain.mjs`

### Data and persistence

- `lib/supabase.js`
- Supabase schema and migrations
- Scheduled data jobs under `jobs/`

## Intended projection pipeline

### 1. Data inputs

- Current FPL players, teams, fixtures, prices, availability, and status
- Historical player and team performance
- Understat expected metrics
- Betting odds or a team-strength fallback
- Predicted line-ups and press information
- Penalty and set-piece duties

### 2. Team goal environment

For each fixture, derive expected goals for both teams.

Preferred evidence order:

1. Market odds where valid
2. Current team attack and defence strengths
3. Venue-specific components
4. Explicit, visible neutral fallback only when necessary

A selected current fixture must never disappear silently because a lambda could not be produced.

### 3. Scoreline model

The engine uses a joint scoreline approach, historically described as Dixon-Coles or a related adjusted count model.

It should generate internally coherent home and away goal outcomes.

### 4. Player attacking allocation

Allocate team attacking output using:

- Expected minutes
- Blended non-penalty xG rate
- Blended xA or chance-creation rate
- Position and broad role
- Penalty share
- Set-piece role where reliable
- Small-sample shrinkage

Team expected goals and assists must conserve after player allocation.

### 5. Minutes model

Estimate separately:

- Probability of starting
- Expected minutes if starting
- Probability of substitute appearance
- Expected minutes if substituting
- Probability of reaching 60 minutes
- Probability of no appearance

Predicted line-up certainty must not automatically mean 90 minutes.

### 6. Joint match simulation

For each simulation:

- Sample line-ups and minutes
- Sample scoreline
- Allocate scorers and assisters
- Handle penalties without adding goals twice
- Apply clean sheets and goals conceded according to time on pitch
- Generate saves and defensive actions
- Generate card and BPS events
- Rank BPS and award bonus
- Apply the correct season rules

### 7. Projection output

Store component evidence and final mean xP, including:

- Gameweek
- Player and resolved current team
- Generation timestamp
- Model version
- Expected minutes and start/cameo probabilities
- Team and opponent goal environment
- Goal and assist rates used
- Expected goals, assists, clean sheet, bonus, DefCon, and other components
- Data-source and confidence metadata

### 8. Coherent loading

The app and APIs must:

- Paginate all relevant rows
- Select a coherent latest generation
- Avoid mixing timestamps
- Require coverage for expected players
- Show real blanks as zero
- Surface failures rather than silently switching methodologies

## Major historical failures

### Double minutes punishment

The engine already incorporated minutes. The app-facing scorer could multiply by minutes again, disproportionately reducing players with imperfect minute estimates.

### Mixed final methodologies

Some players displayed engine xP while others displayed archive or Understat fallback xP. Rankings therefore compared incompatible outputs.

### Weak stale-row logic

The app could decide a legitimate engine projection was too low, classify it as stale, and replace it with a more generous fallback.

### Generic priors

Broad positional priors could overrate unknown or low-sample players and compress elite-player separation.

### Circular low-sample role classification

A short hot streak could classify a player as aggressive, then the aggressive prior could reinforce the same short hot streak.

### Broken current-team identity

Transferred players could retain stale club identity in fixtures, filters, club limits, or API output.

### Incomplete fixture horizon

A workflow selected eight gameweeks but skipped 70 odds-free future fixtures, wrote only GW1, and still progressed too far through release logic.

### Archive data poisoning current generation

A malformed finished 2025/26 archive row with `away_team = null` currently aborts live 2026/27 generation before the horizon is selected.

## Current model work that appears present

The current repository contains code and tests for:

- Coherent generation selection
- Paginated reads
- Engine-only coverage checks
- GW1 predicted-line-up locking
- Current-team resolution
- Historical player-rate matching
- Role-aware priors
- Penalty allocation
- Projection horizon integrity
- Per-gameweek isolated writes

These systems must be evaluated from the exact code and tests. Existing status documents are not proof that they work in production.

## Later model priorities

After product and pipeline recovery:

1. Validate minutes and substitute probabilities
2. Validate team-strength output against held-out matches
3. Validate attacking allocation and conservation
4. Calibrate clean-sheet probabilities
5. Complete BPS event modelling
6. Calibrate DefCon by role and match context
7. Tie goals conceded and clean-sheet points to exact on-pitch intervals
8. Model goalkeeper penalty saves and full save bands
9. Validate penalties and set pieces
10. Compare against unseen historical gameweeks and actual outcomes

## Required model evidence

Every xP change must show:

- Before and after current-player panel
- Team-level goal and assist conservation
- Minutes and starter totals
- Historical holdout result
- Full tests
- Production build
- Exact changed files
- No named-player hard-coding
