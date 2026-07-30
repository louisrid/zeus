# ZEUS xPTS Step 4: Player Rates and Role-Aware Priors

Completed: 30 July 2026

## What changed

- The projection job now reads the complete 2025-26 player-gameweek history and aggregates player-level xG, xA, minutes and defensive actions at run time.
- Current players are conservatively matched to those historical profiles using full names, initials, surnames, team aliases and transfer-team lists.
- The historical profile fills missing fields in the old id-backed prior view, so established players no longer fall to a generic positional attacking rate only because archive ids or names differ.
- Broad football roles are derived from prior-season distributions, not hand-written player overrides.
- Role-specific npxG and xA priors are derived at run time and used as hierarchical shrinkage targets.
- The measured allocation shrinkage value kPos=20 is now the actual live rate-shrinkage value. The hidden fallback of 12 is removed.
- Stored projection diagnostics now record the rates actually used after shrinkage, and the rate source includes the derived role.
- Understat and archive loaders now use the same conservative player matcher to prevent future data loss and duplicate archive players.
- The automated CSV audit now reports role-aware coverage.

## What this is intended to fix

- Palmer, Neto and Caicedo receiving nearly identical generic midfielder attacking rates.
- Established players such as Bruno Fernandes, Dalot and Guehi falling onto broad positional priors.
- Defensive midfielders, creators, attacking midfielders and wide attackers being treated as the same player type.
- New or low-sample players being shrunk only toward a broad FPL position rather than a data-derived football role where enough history exists.
- Diagnostics showing raw rates rather than the rates actually used by the engine.

## Verification

- Full repository test suite: 480/480 passed using a local import stub for the unavailable Supabase npm package.
- All new role, matching, expected-metric and allocation tests passed.
- Syntax checks passed for every changed JavaScript and MJS file.
- No production projection run was performed in the container because it has no Supabase credentials. The live run is intentionally delayed until Step 5 so the user performs one combined projection refresh rather than one per step.
