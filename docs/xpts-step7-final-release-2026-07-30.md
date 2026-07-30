# Step 7 final release

Step 7 separates deployment and integration work from football-model tuning.

The manual `zeus-final-release` workflow:

1. Removes obsolete repair workflows and duplicate workflow installers.
2. Runs the complete test suite.
3. Builds the production Next.js site.
4. Commits the cleanup safely.
5. Waits for the exact commit to deploy to Vercel.
6. Checks the homepage and Players page.
7. Checks the live Supabase projection generation through `/api/health`.
8. Checks the OpenWeb/Open WebUI JSON brief contract through GET and POST where credentials permit.
9. Uploads one final evidence report.

The workflow is manual-only and must not run from ordinary uploads.

## Release gates added

- The active gameweek comes from the first unfinished `gameweeks` row, not the oldest projection ever stored.
- Archive players and archive teams are excluded from the health and OpenWeb reads.
- The exact cleanup commit must be live on Vercel.
- The deployed homepage, Players route, current projection generation and OpenWeb JSON response must all pass in the same run.
- The evidence report is retained as a GitHub artifact.
