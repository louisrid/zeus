# Temporary external xPTS mode

Activated: 3 August 2026.

## Live source

ZEUS reads xPTS and expected minutes from `config/external-xpts-2026-27.mjs`, imported from the manually expanded FPL Copilot table.

- Available gameweeks: GW1-GW8
- GW9-GW38: unavailable, with no ZEUS fallback
- Imported minutes: display and selection metadata only
- xPTS: returned exactly as imported, with no ZEUS minutes scaling, fixture scaling, calibration, smoothing or substitution

## Duplicate names

Names are grouped after case, accent and punctuation normalisation. The source row with the highest official 8-gameweek total is retained. It is assigned to the most prominent matching FPL player by ownership, price and minutes. Every other FPL player in that duplicate-name group receives `0.0` for GW1-GW8 until manually resolved.

## Backup and rollback

The switch workflow creates a backup branch and tag from the exact pre-switch commit before changing the site. The internal model files remain in the repository, but `jobs/projections_run.mjs` is guarded and the permanent projection workflows are paused.
