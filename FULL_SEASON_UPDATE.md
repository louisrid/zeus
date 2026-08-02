# Full-season fixtures, xPts and early-week minutes update

## Added

- Full Premier League season fixture verification: exactly 380 fixtures across GW1-GW38.
- Projection workflow now requests GW1-GW38 and verifies all 38 generated and stored gameweeks.
- `/api/brief?view=fixtures` returns every season fixture.
- `/api/brief?view=xpts&gw_from=1&gw_to=38&limit=5000&offset=0` exposes paginated xPts for every player/gameweek.
- `/api/brief?view=season` returns the complete fixture list plus a page of season projections.
- `player=` and `team=` filters for targeted API inspection.
- Extra projection diagnostics: expected minutes, start probability, clean-sheet probability, team/opponent lambda and minutes source.

## Maguire and Lammens investigation

The source-level cause of the GW2/GW3 drop was a general minutes-evidence cliff. The configured predicted XI is scoped to GW1. A named GW1 starter received strong lineup evidence in GW1, but that evidence disappeared completely in GW2 and GW3, returning the player to the historical forecast. This affects low-history or uncertain-role players most severely, including a new goalkeeper and a centre-back with rotation risk.

The fix carries positive starter evidence forward with a role-aware decay. Goalkeeper evidence decays more slowly than outfield evidence. Negative not-named evidence is never carried into future gameweeks. This is systemic and contains no Maguire- or Lammens-specific override.

## API pagination

A full 38-gameweek player table can exceed one safe HTTP response. Follow `next_offset` until it is null. Example:

`/api/brief?view=xpts&gw_from=1&gw_to=38&limit=5000&offset=0`
