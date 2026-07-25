# FPLBot — Master Status (24 Jul 2026)

The master plan lives in `docs/tickets.md` (every ticket, dependencies, feature freeze, v2 list). This file is the running status view on top of it. The product is called **FPLBot** everywhere from here on.

## What is DONE and LIVE

| Item | Status |
|---|---|
| Repo, Next.js app, Vercel deploy | ✅ Live at your Vercel URL |
| Supabase database — all 27 tables + read-only RLS | ✅ Live |
| First pipeline: players, prices, ownership, fixtures, deadlines (every 6h) | ✅ Running (covers the FPL-API half of A-04) |
| FPLBot v0 UI: shell + right rail, live deadline countdown, Dashboard (fixtures, most-owned + ownership donut, price board, data status), Players (full database, search/filters, differentials, template tags, profile drawers with ownership donut and next-6 fixtures, comparison tool) | ✅ Live |
| Full blueprint: 4 spec docs, data contract, 7 approved mockups, 53 tickets | ✅ In repo |

This bundle delivered ticket **A-01** plus early slices of A-02 (schema), A-04 (FPL ingestion), B-12 (shell), C-06 (players v0), C-11 (comparison v0), C-12 (differentials v0).

## What is LEFT — every remaining ticket

### Phase A — finish the data spine (feeds everything else)
- A-02 — Supabase schema migration flow (schema itself is live; migrations formalised)
- A-03 — Rules loader (2026/27 ruleset JSON into the DB, verified)
- A-04 — remaining half: element-summary/event-live ingestion into the match archive
- A-05 — Historical odds loader (football-data.co.uk archives)
- A-06 — 2025/26 event archive build (last season, every player, every match)
- A-07 — Understat scraper (xG, xA, shot locations → shot maps)
- A-08 — FBref scraper + FPL-native xG fallback
- A-09 — Odds API client + credit counter (first use of your Odds API key)
- A-10 — BPS engine (bonus-point simulation, rules-driven)
- A-11 — **BPS backtest deliverable** — first model output: repricing table, captaincy + hit thresholds
- A-12 — 2018/19 archive load (fatigue study input)

### Phase B — the brain
- B-02/B-03/B-06/B-07 — the projection engine: odds → team goals → player events → simulated points. Output: xP, P10/median/P90, P(12+) for every player
- B-04 — minutes model (P(start), expected minutes)
- B-05 — presser parser via **OpenRouter** (was Haiku; cheap model, pennies/month)
- B-25 — promoted-club shrinkage priors + LOW SAMPLE profile marker
- B-08 — calibration harness (proves the model against history, walk-forward)
- B-09 — effective-ownership proxy scrape
- B-01 — fatigue study · B-18 — strategy study (the Analysis page's evidence)
- B-10 — evaluation services + squad solver
- B-11 — chip season-sim (when to play WC/FH/TC/BB)
- B-13 — on-demand Refresh + real Dashboard (projections wired in)
- B-14 — pick tracking via your team ID (predicted vs actual, every GW)
- B-15 — launch-day rules verification runbook
- B-16 — GW1 three-variant drafts (pure / moderate / spicy)
- B-17 — rival scraper (built, parked until top-50k)
- B-19/B-20/B-21 — the real Squad Builder (guided, free build + live feedback, drafts)
- B-22/B-23/B-24 — the Analyst via **OpenRouter**: Ask route, season memory, zero-cost payload export

### Phase C — season operations
- C-01 — evening pull + price-rise prediction · C-02 — nightly 03:00 pull + price digest
- C-03 — cup watcher + blank/double flags
- C-04 — Monday audit: pick settlement + Analyst memory append
- C-05 — Squad page (pitch, sell/replace, captaincy, chips, season strip)
- C-06 — Players page completed (form, xG, shot maps, projections into the live v0)
- C-07 — Analysis page · C-08 — News page
- C-09 — international-break report · C-10 — season-ops runbook
- C-11 — comparison upgraded (projection fans, full stat rows)
- C-12 — differential screener on true EO proxy
- C-13 — set-piece matrix · C-14 — post-GW review · C-15 — multi-GW transfer planner
- C-16 — Analysis deep-links as routed URLs

## Collapsed timeline (set 24 Jul)
Everything ships **this weekend, live by Sunday 21:00**, in four packages:
- **Package 1 — THE FACE** (built, verified, awaiting upload): FPLBot identity, splash, home reshape with pitch + deadline hero + action tiles, full restyle, photos, motion, /status, /legacy freeze
- **Package 2 — THE FUEL** (built, verified, awaiting upload): 2025/26 match archive, Understat team+player xG, odds pipeline with credit counter + implied goal environments, price-change history, transfer-velocity capture, BPS engine + backtest job, Players points/form columns
- **Package 3 — THE BRAIN** ✅ built, verified, awaiting upload: projection engine layers 0–4, minutes model (interim), evaluation services, Squad Builder (Guided/Build/Drafts), Squad page + captain picker, presser parser (OpenRouter)
- **Package 4 — THE EDGE**: Analyst + memory, News page, Analysis page, pick tracking, post-GW review, planner, deep-links

**Exceptions (effort-independent, data/time-bound):** BPS backtest, calibration runs, fatigue + strategy studies execute as soon as their ingested data allows; **xP appears in the UI only once calibration validates it**. **GW1 three-variant drafts: 7 Aug** stands.

## Standing decisions
- AI provider: **OpenRouter** for both the parser and the Analyst (replaces Anthropic direct); model choice benchmarked at B-05/B-22
- v1 feature freeze in force — new ideas go to the v2 list in `docs/tickets.md`
- Budget cap $14/month; zero AI calls in the engine or evaluations

## Package 3 — what went in

| Piece | Where |
|---|---|
| Layer 0 market inversion (power de-overround, DC-consistent means, team-strength fallback) | `lib/engine/layer0_market.mjs` |
| Layer 1 Dixon-Coles (grid, clean sheets, conceded distributions, game states) | `lib/engine/layer1_scoreline.mjs` |
| Layer 2 allocation (shrunken npxG shares, penalties, finishing, promoted priors) | `lib/engine/layer2_allocation.mjs` |
| Layer 3 minutes, interim hazard model | `lib/engine/layer3_minutes.mjs` |
| Layer 4 joint simulation with the BPS race, N=10,000 | `lib/engine/layer4_sim.mjs` |
| Projection run job → `projections`, `minutes_forecasts`, `team_covariances` | `jobs/projections_run.mjs` |
| Presser parser via OpenRouter, strict schema validation | `jobs/presser_pull.mjs` |
| Evaluation services: four readouts, transfer comparison, auto-complete | `lib/solver/core.mjs` |
| Squad Builder: Guided, Build, Drafts, drag-and-drop, compare | `app/builder/` |
| Squad page: pitch, sell-and-replace, captain picker | `app/squad/` |
| Draft writes behind the service key | `app/api/drafts/route.js` |
| Engine parameters, each with a status and an upgrade date | `config/engine-2026-27.json` |
| Gates, run register, aggregate views, calibration fix | `supabase/migration-004.sql` |

**Verified:** 117 tests green (`npm test`) covering all four layers, the ruleset-driven points and
BPS tables, simulation determinism, solver legality and auto-complete, the four readouts, the
presser validation boundary, a schema contract check on every column the jobs write, and repo-wide
guards on the xP gate, the zero-AI rule, the service key and the design system. `next build`
passes, 13 routes.

**Not verified:** nothing has run against your live Supabase — I have no credentials. The queries
and column names are checked statically against the checked-in SQL, not against the database.

**Bug found in Package 2:** `jobs/bps_backtest.mjs` writes `model` and `run_at` to
`calibration_metrics`, which do not exist, with metric names its CHECK constraint rejected. That
job cannot have persisted results. Migration 004 fixes the table rather than touching the job.

**Archive gaps that limit the engine, stated not hidden:** `jobs/archive_2526.mjs` does not populate
fixture scorelines, `pens_taken`, `pens_scored` or `key_passes`. So penalty EV is zero rather than
estimated, home advantage stays neutral, and the key-pass BPS component reads zero. The projection
run prints every gap it hits instead of quietly filling them.

## Next action
**Package 4 — THE EDGE**: Analyst + memory, News page, Analysis page, pick tracking, post-GW
review, planner, deep-links. Say "start Package 4".
