# FPLBot


**Objective:** Rank #1 in the world in Fantasy Premier League 2026/27, run as an engineering campaign. Fully automated data → projection → solver → dashboard pipeline. Louis makes every call; the machine does the hours. Hard cost cap: $17/month.

> **START HERE:** `docs/DECISIONS.md` is the binding record of every decision, including an
> EXCLUSIONS section of things deliberately rejected. Read it before changing anything. Where it and
> any other document disagree, it wins. Project dates live only in `config/schedule.js`.

This repo is the permanent reference. Every future build session starts with `docs/DECISIONS.md`.

`mockups/` — seven approved prototypes: one per screen plus `fpl-app-mockup.jsx`, the fully linked six-page app (reference for the real build's routing and state shape).

## What this repo is

A self-contained specification for a system that:
1. Pulls FPL, xG, odds, and team-news data automatically on a fixed schedule.
2. Runs a layered expected-points engine (market-implied goals → Dixon-Coles scorelines → intra-team allocation → minutes hazard → joint match simulation with BPS race).
3. Solves transfers, captaincy, bench order, and chip timing with dual points-EV / rank-EV outputs.
4. Serves everything to a personal six-page tool (Next.js, premium dark, FPL-elevated, **desktop-only**, no login gate) that Louis opens whenever he wants: one Refresh button pulls fresh FPL data on demand (odds stay on scheduled pulls to protect credits), all evaluations are computed internally with zero AI calls, and every decision is his own — no decision docs, no notifications. Picks are logged automatically each GW via his FPL team ID (public endpoint, a config value, never a login) and predicted-vs-actual is tracked all season. Nothing auto-submits; no FPL credentials are ever stored.
5. Includes **the payload export**: a Copy Payload button that puts the whole decision context
   (squad, scores, risk flags, fixtures with difficulty, best available players, and the model's fitted
   basis) on the clipboard for a personal Claude project, at zero API cost. The in-app Analyst with an
   Ask button, per-call cost display, spend cap and memory tables was reviewed and deliberately not
   built; see EXCLUSIONS 12.25 in `docs/DECISIONS.md`.


## Live system

- Website: `https://zeus-teal.vercel.app`
- Players table: `/players`
- Human-readable model brief: `/api/brief`
- OpenWeb/Open WebUI JSON brief: `/api/brief?format=json` or `POST /api/brief`
- Public system health: `/api/health`

The live Players page and brief API use the newest coherent engine generation only. Missing or incomplete engine coverage is an explicit failure, not a switch to a separate final-xPTS fallback.

## File map

| File | Purpose |
|---|---|
| `docs/campaign-plan.md` | The agreed campaign plan, verbatim. Strategy lives here and only here. Doctrine, edges, dates, gates, decision rules. |
| `docs/build/01-architecture-and-model.md` | System architecture, Supabase schema draft, the projection engine in implementable detail, calibration protocol, repo folder structure. |
| `docs/build/02-data-automation.md` | Every data source with exact endpoints, field mappings, the full cron schedule, fallback chains, staleness thresholds, rate limits, credit budget, heartbeats, and the presser/Haiku pipeline. |
| `docs/build/03-ui.md` | The six pages (Dashboard, Squad Builder, Squad, Players, Analysis, News) as text wireframes, chart specs, FPL-elevated theme and component choices, desktop-only layout rules, Refresh + status sheet, the Analyst's UI contract. |
| `docs/build/04-useability.md` | The open-anytime interaction model: Refresh semantics, automatic pick logging and predicted-vs-actual tracking, typical sessions, deadline-day steps. No notifications, by design. |
| `docs/tickets.md` | Build order: every component as a ticket with ID, dependencies, acceptance criteria, and the doc section it implements. Historical sequencing. Current dates live in `config/schedule.js`. |
| `config/engine-2026-27.json` | Fitted engine parameters (Dixon-Coles rho, shrinkage constants, simulation settings). Every value carries `INTERIM`, `DERIVED` or `CALIBRATED` status and, where interim, the date its fitted value lands. |
| `config/rules-2026-27.json` | The complete FPL 2026/27 ruleset as machine-readable JSON. Every value carries a status: `CONFIRMED`, `VERIFY`, or `VERIFY_AT_LAUNCH`. The engine imports this file; nothing rule-shaped is hard-coded anywhere else. |

## Where a new session starts

1. **Read `docs/DECISIONS.md` first.** It is the binding record of every decision, with an EXCLUSIONS
   section of things deliberately rejected and why. Where it and any other document disagree, it wins.
2. Dates come only from `config/schedule.js`. Every other document's dates are superseded and a test
   fails the build if a date is written by hand.
3. Model parameters come only from `config/fitted-params.json` and `config/engine-2026-27.json`, each
   carrying its status and how it was fitted. Never hand-pick one.
4. Scoring values come from `config/rules-2026-27.json` at runtime. Never hard-code one.
5. `docs/tickets.md` and `docs/campaign-plan.md` are historical context. Read them for background, not
   for current state.

## Standing constraints (apply to every session)

- **Cost:** free tiers only; total hard cap **$17/month**. The presser pipeline is the only scheduled AI spend. The website, projections, solver, payload export and OpenWeb/Open WebUI brief are deterministic code over stored data.
- **Security:** public read-only endpoints only. No stored FPL login, no credential automation, no session-token persistence, no headless-browser logins. API keys (Odds API, OpenRouter) live in GitHub Actions secrets / Supabase secrets only — never in code, config, or logs. Louis enters transfers in the official FPL app himself.
- **Honesty:** no invented numbers. Model parameters come out of the backtests on the dates in the campaign plan. Uncertain rule values carry `VERIFY` status in the rules JSON.
- **Decision authority:** the tool informs; Louis decides. It never pushes, recommends-by-ceremony, or notifies. Actual picks are logged automatically each GW with projections frozen at the deadline and settled against actuals.

## Key dates (from the campaign plan)




- **FPL launch day** — full rules verification task runs; `rules-2026-27.json` statuses flipped; ruleset version stamped before the GW1 draft ships.

- **2 Jan 2027, 13:30 GMT** — first chip set expires (GW19 deadline).
- **GW15 / GW19** — variance-gate schedule agreed in writing / first gate applied.
- **GW25 / GW28** — checkpoint threshold signed / second gate applied.


## Full-season data API

- Every Premier League fixture: `/api/brief?view=fixtures`
- Paginated GW1-GW38 xPts: `/api/brief?view=xpts&gw_from=1&gw_to=38&limit=5000&offset=0`
- Fixtures plus a projection page: `/api/brief?view=season&gw_from=1&gw_to=38&limit=5000&offset=0`
- Filter by player or team with `player=` and `team=`. Follow `next_offset` until it is null.
