# FPL 2026/27 Campaign — Build Spec

**Objective:** Rank #1 in the world in Fantasy Premier League 2026/27, run as an engineering campaign. Fully automated data → projection → solver → dashboard pipeline. Louis makes every call; the machine does the hours. Hard cost cap: $14/month.

This repo is the permanent reference. Every future build session starts here.

`mockups/` — seven approved prototypes: one per screen plus `fpl-app-mockup.jsx`, the fully linked six-page app (reference for the real build's routing and state shape).

## What this repo is

A self-contained specification for a system that:
1. Pulls FPL, xG, odds, and team-news data automatically on a fixed schedule.
2. Runs a layered expected-points engine (market-implied goals → Dixon-Coles scorelines → intra-team allocation → minutes hazard → joint match simulation with BPS race).
3. Solves transfers, captaincy, bench order, and chip timing with dual points-EV / rank-EV outputs.
4. Serves everything to a personal six-page tool (Next.js, premium dark, FPL-elevated, **desktop-only**, no login gate) that Louis opens whenever he wants: one Refresh button pulls fresh FPL data on demand (odds stay on scheduled pulls to protect credits), all evaluations are computed internally with zero AI calls, and every decision is his own — no decision docs, no notifications. Picks are logged automatically each GW via his FPL team ID (public endpoint, a config value, never a login) and predicted-vs-actual is tracked all season. Nothing auto-submits; no FPL credentials are ever stored.
5. Includes **the Analyst**: an on-demand Claude Sonnet quant analyst behind an Ask button on every screen — fires only on an explicit press, cost displayed per call, server-capped monthly, context assembled by code (squad, distributions, fixtures/odds, strategy findings, database-resident season memory), with a Copy Analyst Payload export for the zero-cost route into a personal Claude Project.

## File map

| File | Purpose |
|---|---|
| `docs/campaign-plan.md` | The agreed campaign plan, verbatim. Strategy lives here and only here. Doctrine, edges, dates, gates, decision rules. |
| `docs/build/01-architecture-and-model.md` | System architecture, Supabase schema draft, the projection engine in implementable detail, calibration protocol, repo folder structure. |
| `docs/build/02-data-automation.md` | Every data source with exact endpoints, field mappings, the full cron schedule, fallback chains, staleness thresholds, rate limits, credit budget, heartbeats, and the presser/Haiku pipeline. |
| `docs/build/03-ui.md` | The six pages (Dashboard, Squad Builder, Squad, Players, Analysis, News) as text wireframes, chart specs, FPL-elevated theme and component choices, desktop-only layout rules, Refresh + status sheet, the Analyst's UI contract. |
| `docs/build/04-useability.md` | The open-anytime interaction model: Refresh semantics, automatic pick logging and predicted-vs-actual tracking, typical sessions, deadline-day steps. No notifications, by design. |
| `docs/tickets.md` | Build order: every component as a ticket with ID, dependencies, acceptance criteria, and the doc section it implements. Sequenced to cover Week 1 (23–30 Jul) and Week 2 (31 Jul–7 Aug). |
| `config/rules-2026-27.json` | The complete FPL 2026/27 ruleset as machine-readable JSON. Every value carries a status: `CONFIRMED`, `VERIFY`, or `VERIFY_AT_LAUNCH`. The engine imports this file; nothing rule-shaped is hard-coded anywhere else. |

## Where a new session starts

1. Read this README.
2. Read `docs/campaign-plan.md` for objective, doctrine, dates, and decision rules. Do not re-litigate strategy; it is settled.
3. Open `docs/tickets.md`, find the next unblocked ticket, and read the build-doc section it points to. Each build doc is self-contained for its area.
4. Build to the ticket's acceptance criteria. All rule values come from `config/rules-2026-27.json` at runtime — never hard-code a scoring value.

## Standing constraints (apply to every session)

- **Cost:** free tiers only; total hard cap **$14/month**. AI spend is exactly two things: the Haiku presser pipeline (~$1–3/mo) and the on-press Analyst (Claude Sonnet, ~$3–6/mo, server-capped). All evaluations are internal code — zero AI calls.
- **Security:** public read-only endpoints only. No stored FPL login, no credential automation, no session-token persistence, no headless-browser logins. API keys (Odds API, Anthropic) live in GitHub Actions secrets / Supabase secrets only — never in code, config, or logs. Louis enters transfers in the official FPL app himself.
- **Honesty:** no invented numbers. Model parameters come out of the backtests on the dates in the campaign plan. Uncertain rule values carry `VERIFY` status in the rules JSON.
- **Decision authority:** the tool informs; Louis decides. It never pushes, recommends-by-ceremony, or notifies. Actual picks are logged automatically each GW with projections frozen at the deadline and settled against actuals.

## Key dates (from the campaign plan)

- **30 Jul 2026** — BPS backtest delivered (repricing table + captaincy differential threshold + hit threshold).
- **1 Aug 2026** — World Cup fatigue study delivered.
- **3 Aug 2026** — strategy study delivered: top-manager behaviour (community top-10k archives + API season summaries), vaastav structural analyses, web-research synthesis. Feeds the Analysis page + Guided builder defaults.
- **FPL launch day** — full rules verification task runs; `rules-2026-27.json` statuses flipped; ruleset version stamped before the GW1 draft ships.
- **7 Aug 2026** — three GW1 squad variants delivered.
- **2 Jan 2027, 13:30 GMT** — first chip set expires (GW19 deadline).
- **GW15 / GW19** — variance-gate schedule agreed in writing / first gate applied.
- **GW25 / GW28** — checkpoint threshold signed / second gate applied.
