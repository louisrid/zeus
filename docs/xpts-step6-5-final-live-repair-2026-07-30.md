# Step 6.5: Final artifact-led live repair

The latest validation artifact showed that team starters, goalkeeper totals, team minutes, availability, engine coverage, goal conservation and all named-player ordering gates now pass.

The remaining reported lineup failure was metadata, not the XI: five unavailable-player replacements were correctly selected at 100% but persisted under the pre-normalisation `lineup-notNamed` label. The projection job now records each player's final route after team reconciliation.

A deeper audit of the same exported generation found 67 outfield players using zero positional fallback xG/xA rates. This was not acceptable even though the old gate missed it. Preseason current-season history rows can have valid minutes but all-zero xG/xA, and the runtime previously treated that map as complete. This concentrated team attack onto the few players with matched history, producing Johnson 8.535 xPTS and Diop 8.234 xPTS.

The runtime now selects rate maps in this order:

1. Complete positive current-season rates after ten completed matches.
2. Complete positive prior-season rates.
3. The measured positive values stored in `engine-2026-27.json`.
4. Fail explicitly rather than simulate zero-rate templates.

Allocation also refuses zero outfield priors, and the release gate now checks both zero-rate templates and implausible defender attack concentration.

Verification completed locally:

- 504/504 repository tests passed.
- All changed MJS files passed `node --check`.
- An executable allocation test proves that all-zero preseason maps fall back to positive measured priors and that one measured defender cannot absorb more than 25% of the team's scoring weight.
- The GitHub workflow remains manual-only and automatically uploads the full report and projections artifact.
