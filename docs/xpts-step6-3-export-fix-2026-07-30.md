# Step 6.3: Live validation export repair

The live projection generation completed successfully, but the validation CSV export failed.

## Cause

The exporter requested several raw FPL alias columns from the canonical Supabase `players` table. The live table stores ZEUS fields such as `team_id`, `position`, `price` and `chance_of_playing`; it does not store aliases such as `team`, `element_type`, `now_cost` or `chance_of_playing_next_round`. PostgREST rejects an explicit select when any requested column is absent.

## Fix

The exporter now loads the small reference tables with `select=*` and maps the canonical values in JavaScript. This avoids schema drift and keeps the export compatible with future additive columns.

## Verification

- Exporter syntax check passed.
- Live-validation regression tests: 4/4 passed.
