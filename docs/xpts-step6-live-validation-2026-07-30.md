# ZEUS xPTS Step 6: Automatic Live Validation

Date: 30 July 2026
Status: Validation automation complete in code. Awaiting the automatic production run triggered by upload.

## Purpose

Steps 3 to 5 changed the main football model. Step 6 proves their combined production output without requiring a manual Supabase query or subjective checking after each edit.

## Automatic workflow

Uploading this step triggers `.github/workflows/xpts-live-validation.yml` on `main`.

The workflow:

1. Installs the real project dependencies.
2. Runs every repository test.
3. Builds the Next.js production website.
4. Runs `jobs/projections_run.mjs` with the repository's existing Supabase secrets.
5. Selects the newest complete projection generation.
6. Exports the entire active-gameweek player table.
7. Runs the whole-table audit and hard release gate.
8. Uploads the complete CSV, JSON and Markdown evidence as a GitHub Actions artifact.
9. Commits `docs/xpts-live-validation-latest.md` and its JSON counterpart so the result can be inspected without downloading an artifact.

## Critical gates

The release is rejected when any of these remain broken:

- Missing engine projection rows.
- Mixed or stale projection generations.
- Team start probabilities not equal to 11.
- Goalkeeper start probabilities not equal to one.
- Team expected minutes not reconciled to 990.
- Predicted GW1 starters below 100% start probability.
- Predicted non-starters above zero start probability.
- Unavailable players receiving minutes or events.
- Established players with valid history still using a broad positional prior.
- Impossible player probabilities.
- Player events with zero expected minutes.
- Player expected goals not conserving the team's expected goals.
- Virgil, Alisson or Matheus Nunes still carrying bench-level minutes.
- Palmer below Neto or Caicedo.
- Saka below Rice.
- Haaland failing to separate meaningfully from Watkins.

These named-player checks are output regression tests. They do not feed prices, fame or manual boosts into the projection model.

## Final project step retained

After the live xPTS report passes, Step 7 will clean the GitHub repository and verify the deployed `/players` table, Vercel build and OpenWeb/Open WebUI API connection end to end before the project is called finished.
