# ZEUS Core Restoration Package

Updated: 30 July 2026

## Purpose

This package repairs the product regressions discovered after the first successful xPTS release. It deliberately restores core product behaviour and obvious data-path bugs before the separate Phase 2 calibration programme begins.

## Restored product features

- Projection generation now writes eight gameweeks rather than only three.
- Players always shows a working gameweek-range control, regardless of the active sort.
- Builder has a prominent FROM/TO gameweek slider and defaults to the current four-gameweek window.
- Builder xPTS, Best XI, Rebuild and Optimise all use the selected gameweek total.
- Squad drafts have a visible `OPTIMISE GWn` button that fields the best legal eleven, orders the bench and selects captain and vice-captain in one atomic edit.
- Missing direct future rows remain engine-only and use an engine-anchored fixture adjustment rather than becoming zero or switching to a separate historical final-xPTS model.

## Corrected player and data-path bugs

- Duplicate predicted-lineup appearances now use the unique newest source date before trusting a stale stored club.
- Lacroix resolves to Chelsea, while the older Crystal Palace occurrence is rejected.
- The resolved team used by the engine is propagated through browser loading, server loading, fixtures, labels, club limits and the OpenWeb response.
- Expected minutes conditional on starting are shrunk toward the league starter mean when the historical sample is small. This prevents Gomes/Lavia-type 100% starters inheriting obsolete 40 to 55 minute assumptions from one or two old starts.
- Players below ten historical nineties cannot use their own short hot streak to assign and reinforce an aggressive role prior. This targets the Osula-type circular low-sample inflation without manually lowering any named player.
- Gabriel and other premium defender outputs are not arbitrarily changed in this bugfix package. The live report now exposes team lambda, opponent lambda, clean-sheet probability, attack, bonus and DEFCON, and warns on defender projections above 7.25 so the later defender/team-strength calibration is evidence-led.

## New release protection

The manual live workflow now:

1. Installs dependencies.
2. Runs the complete test suite.
3. Builds the production website.
4. Generates eight live gameweeks.
5. Exports and audits the newest generation.
6. Blocks collapsed predicted-starter minutes, low-sample role feedback and stale Lacroix club mapping.
7. Warns on premium defenders, short low-sample starters and high low-sample projections.
8. Waits for the exact Vercel commit.
9. Checks the homepage, Players, Builder, Squad, Supabase health and OpenWeb GET/POST.
10. Checks future API projections for GW+1 and GW+3.
11. Uploads the complete evidence artifact.

The workflow remains manual-only.

## Local verification

- Complete repository test suite: **519/519 passed**.
- All changed JavaScript and MJS files passed syntax checks.
- All changed JSX files passed TypeScript JSX parsing.
- All three changed workflow YAML files parsed successfully.
- The old successful production artifact correctly fails the new gates for the three defects this package is intended to repair:
  - collapsed predicted-starter minutes;
  - low-sample role feedback;
  - Lacroix attached to Crystal Palace.
- The old artifact also produces the intended non-blocking warnings for Gabriel, Gomes/Lavia-type minutes and Osula-type low-sample inflation.

A local Next production build is not claimed because the uploaded repository has no installable local Next/React dependencies in this container. The manual GitHub workflow installs the real dependencies and will not pass without a successful production build.

## Release decision

The core restoration is ready for one manual live validation. Phase 2 model calibration does not begin until the artifact proves the restored site, future gameweeks and corrected live projections all pass together.
