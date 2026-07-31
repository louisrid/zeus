# ZEUS Current Recovery Decisions

Updated: 31 July 2026

These decisions are current and binding for recovery work. They supersede conflicting older recovery plans and assistant instructions. Existing `docs/DECISIONS.md` remains the source for older product choices not addressed here.

## 1. Recovery order

1. Restore a working deployed baseline.
2. Reapply UI and feature changes.
3. Repair the eight-gameweek data pipeline.
4. Improve xP football accuracy.

Do not combine these stages.

## 2. Working baseline

Use Git and GitHub evidence to identify the last version that actually:

- Passed normal CI
- Built
- Deployed
- Loaded
- Displayed real GW1 data

Do not choose a baseline from an assistant claim or old ZIP filename.

## 3. Preserve current work

Before restoring the baseline:

- Preserve current `main` in an archive branch
- Preserve the current cleaned repository state
- Do not destroy the newer UI and xP work

Useful newer changes may be reapplied selectively after the baseline is proven.

## 4. UI before xP complexity

After baseline recovery, apply the UI and product improvements first.

The UI can initially operate on the baseline's existing data horizon. It does not need the final eight-gameweek generation system before the controls and actions are made correct.

## 5. One PR per system

Separate pull requests for:

- Players range
- Builder range and actions
- Squad gameweek optimiser
- Responsive and visual integration
- Read-only data audit
- Eight-gameweek generation
- Production persistence
- Each later xP subsystem

## 6. No destructive live work during recovery

Until explicitly approved:

- No Supabase writes
- No stale-row deletion
- No migrations
- No live projection generation
- No release-check action
- No repository cleanup workflow

## 7. Eight-gameweek target

The eventual product target remains at least eight gameweeks of real per-gameweek projection rows.

This is a later data-pipeline phase, not part of baseline recovery.

## 8. Gameweek controls

- Players uses FROM and TO gameweeks
- Builder uses the same shared control
- Builder defaults to a four-gameweek window where available
- Quick options should include 1, 4, and 8 gameweeks
- Every Builder optimiser action uses the selected range

## 9. Builder actions

Keep or restore:

- BUILD SQUAD
- FILL GAPS
- IMPROVE
- OPTIMISE XI
- CLEAR
- COPY PAYLOAD
- SAVE PLAN
- UNDO
- Budget left

## 10. Squad optimisation

`OPTIMISE GWn` keeps the same 15 players and updates XI, formation, bench, captain, and vice-captain atomically.

## 11. Visual design

- Preserve existing ZEUS visual identity
- Prefer one toolbar row only when it fits
- Use deliberate grids before clipping
- Prevent pitch and player-panel overflow
- Desktop-first, not a broad mobile redesign

## 12. Projection consistency

Current active players must be compared through one coherent projection methodology and generation.

Do not silently mix engine and final fallback outputs.

## 13. Predicted line-ups

For a fully validated GW1 XI:

- Named players have 100% start probability
- Start probability is not the same as 90 minutes
- Non-starters may have realistic substitute probabilities
- Goalkeepers are handled separately
- Team totals reconcile correctly

## 14. Current-team identity

Transferred players use one resolved current team across engine, fixtures, UI, club limits, APIs, and stored rows.

## 15. Player-specific examples

Named players are regression cases, not manual coefficients.

No code such as "if player is Palmer" or "lower Osula" is allowed unless it is purely a test fixture.

## 16. Competitor use

Use FPL Copilot to understand architecture, component decomposition, and target behaviour.

Maintain an independent ZEUS approach. Do not copy hidden or inferred coefficients without evidence.

## 17. Codex role

Codex is the primary coding executor once it has the real repository and history.

ChatGPT or another model may help consolidate requirements or review a PR, but two coding agents must not edit the same branch simultaneously.

## 18. Verification language

Do not use words such as "verified", "ready", "final", or "fixed" unless the required acceptance gates have actually passed on the exact branch.

State clearly what was not tested.
