# ZEUS xPTS Step 3: GW1 Lineups and Minutes

Date: 30 July 2026

## Completed behaviour

- Predicted lineups are explicitly scoped to GW1.
- A player accepted into the predicted XI receives 100% predicted start probability.
- Expected minutes if starting remain player-specific rather than being forced to 90.
- A player outside a fully valid predicted XI receives 0% start probability and retains only a player-specific substitute chance.
- Goalkeepers never receive normal cameo probability.
- Each team is reconciled to exactly 11 expected starters, one expected starting goalkeeper and 990 expected player-minutes.
- Transferred players can be temporarily assigned to the club in the predicted lineup when the FPL snapshot still contains the old club.
- A player appearing in two clubs' predicted XIs is not silently accepted twice.
- Browser, server and projection-job minutes use the same resolver and the same GW1 scope.

## Real lineup snapshot validation

- Clubs supplied: 20
- Fully valid predicted XIs: 19
- Safely partial predicted XI: Chelsea
- Chelsea issue: Lacroix also appears in Crystal Palace's XI and belongs to Crystal Palace in the frozen player snapshot. The Palace occurrence is retained and the Chelsea occurrence is rejected rather than using one player for two clubs.
- Temporary team overrides:
  - Rushworth: Brighton snapshot to Coventry predicted XI
  - Trafford: Manchester City snapshot to Leeds predicted XI

## Named-player checks

The real frozen lineup test confirms 100% predicted start probability for:

- Virgil
- A.Becker
- Matheus N.
- Palmer
- Haaland
- Saka

## Automated acceptance checks

For all 20 teams in the frozen real-player snapshot:

- Sum of start probabilities: 11
- Sum of goalkeeper start probabilities: 1
- Sum of expected player-minutes: 990
- Unavailable players: 0 start, cameo and 60-minute probability
- Invalid locked XI with multiple goalkeepers: rejected
- Predicted lineups do not apply beyond the configured gameweek

## Verification

- Step 3 focused suite: 130 tests discovered, 129 passed, 1 externally blocked because `@supabase/supabase-js` is unavailable in the execution environment.
- Full suite: 413 tests discovered, 403 passed, 10 externally blocked for the same missing package.
- No football-logic or Step 3 assertion failed.
- Syntax checks passed for all changed JavaScript and MJS files.
- A production build is not claimed because npm installation remains blocked by the unavailable registry dependency.
