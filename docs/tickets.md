# Tickets — Build Order

Each ticket is sized for one coding session. `Implements` points to the authoritative doc section. A ticket is done when every acceptance criterion (AC) passes. Sequence within a phase is the dependency order; parallelise only where deps allow.

Status legend: `[ ]` open · `[x]` done · `[~]` in progress. Update statuses in this file as the single source of truth.

**Revision note (interaction model v3):** decision-doc and notification tickets removed (old B-13 accept/override screen, old B-14 Telegram/deadline safety); B-13/B-14 redefined below. B-18 expanded from formation study to the full strategy study. B-22–B-24 added (the Analyst: core, memory, payload export). Desktop-only and no-auth applied to all UI tickets. Zero-AI-calls cost rule applies to every evaluation/UI ticket: all interactive computation is SQL + arithmetic over stored engine output; AI spend is only B-05 (Haiku pressers) and B-22 (Analyst, on-press only).

---

## Phase A — Week 1 (23–30 Jul): data spine + BPS backtest

**A-01 — Repo scaffold and CI** `[ ]`
Deps: none. Implements: 01 §5.
AC: repo matches the folder structure in 01 §5; Python project with lint/test CI workflow green; `.gitignore` excludes env files; secret-pattern scan step in CI fails the build if a key-shaped string appears in the diff.

**A-02 — Supabase project + schema migration v1** `[ ]`
Deps: A-01. Implements: 01 §2.
AC: all tables from 01 §2 created via checked-in migrations (including `squad_drafts` and `gw_picks`); RLS enabled everywhere; dashboard role has exactly the write set in 01 §2; service-key access verified from a GH Actions dry run; no credentials in the repo.

**A-03 — Rules loader** `[ ]`
Deps: A-02. Implements: 01 §3 preamble; `config/rules-2026-27.json`.
AC: `config/rules-2026-27.json` validates against a checked-in JSON schema; loader publishes it to the `rulesets` table with its version; engine code imports values only via the loader; a unit test proves no scoring constant exists outside the config (grep-based guard on `src/engine`).

**A-04 — FPL API ingestion + heartbeats** `[ ]`
Deps: A-02. Implements: 02 §2.1, §4.
AC: bootstrap-static, fixtures, element-summary clients populate `players`, `teams`, `gameweeks`, `fixtures`, `player_match_stats`; retry/backoff per 02 §5; every run upserts `pipeline_heartbeats`; unmapped API fields are logged, not dropped silently; runs green from a scheduled GH Actions workflow.

**A-05 — Historical odds loader (football-data.co.uk)** `[ ]`
Deps: A-02. Implements: 02 §2.5.
AC: seasons 2023/24–2025/26 loaded into `odds_snapshots` with closing-line preference order (Pinnacle closing → B365 closing → averages); team-name crosswalk table complete with zero unmatched fixtures; row counts reconcile against fixture counts per season.

**A-06 — 2025/26 event archive build** `[ ]`
Deps: A-04. Implements: 01 §2 (`player_match_stats`, `shots`), 02 §2.1–2.2.
AC: full 2025/26 per-player-per-match rows present including minutes, sub timings, CBIT/recoveries, BPS, bonus; Understat shot rows loaded with FPL↔Understat crosswalk complete (unmatched list empty or reviewed); spot-check script verifies 20 random player-GWs against the live FPL site output.

**A-07 — Understat scraper** `[ ]`
Deps: A-02. Implements: 02 §2.2, §5.
AC: league + match shot data for current and prior two seasons; 24h caching; rate limit enforced in the client, not by convention; heartbeat written.

**A-08 — FBref scraper + FPL-native xG fallback wiring** `[ ]`
Deps: A-04. Implements: 02 §2.3, §4.
AC: FBref client obeys ≥6s spacing, backs off 24h on 429/403, and is marked optional in the pipeline graph; the xG feature builder demonstrably runs end-to-end with FBref and Understat both disabled, sourcing FPL-native expected_goals/expected_assists; a pipeline flag records which source fed each run.

**A-09 — Odds API client + credit counter** `[ ]`
Deps: A-02. Implements: 02 §2.4.
AC: request uses exactly `regions=uk&markets=h2h,totals`; every call writes `api_credits` from response headers; client hard-refuses below 50 remaining except pre-solve; a test call on a friendly/off-season sport proves headers parse; key read from secrets only.

**A-10 — BPS engine (rules-driven)** `[ ]`
Deps: A-03, A-06. Implements: 01 §3.4 step 6.
AC: computes BPS per player per match purely from `rules-2026-27.json`; reproduces ≥99% of actual 2025/26 bonus awards when run with 2025/26 BPS values (validation mode proves the engine before the rule change is applied); tie-handling matches FPL behaviour on known tie cases from the archive.

**A-11 — BPS backtest → repricing deliverable (DUE 30 JUL)** `[ ]`
Deps: A-10, A-05. Implements: campaign plan "BPS backtest delivered 30 July"; 01 §4.6.
AC: 2025/26 season re-run under 2026/27 BPS values; per-player expected bonus delta table ranked and stored; keeper/dribbler/DefCon-CB direction hypotheses confirmed or rejected with sizes; captaincy differential tolerance and transfer-hit threshold derived per 01 §4.6 and written to a thresholds config; a human-readable summary stored for the Analysis page.

**A-12 — 2018/19 archive load (fatigue study input)** `[ ]`
Deps: A-04. Implements: campaign plan fatigue study; 01 §2 note.
AC: 2018/19 per-player-per-GW minutes/points loaded with `source` marked; World Cup 2018 deep-run player list (squad + days/minutes at the tournament) compiled into a reference table.

---

## Phase B — Week 2 (31 Jul–7 Aug): engine, evaluation services, tool v1, GW1 drafts

**B-01 — Fatigue study (DUE 1 AUG)** `[ ]`
Deps: A-12. Implements: campaign plan "fatigue study delivered 1 Aug".
AC: GW1–6 minutes and output for 2018 deep-run players vs matched controls; result is either a fatigue prior per days-played bucket (written into Layer 3 features as the WC load flag values) or an explicit "effect indistinguishable from noise" finding; either outcome written up with the decision it implies.

**B-02 — Layer 0: odds inversion** `[ ]`
Deps: A-05, A-09. Implements: 01 §3.0.
AC: power-method de-overround with proportional fallback recorded; (λh, λa) solver converges on ≥99.5% of historical fixtures; `fit_residual` stored; identical code path runs on Odds API and football-data rows.

**B-03 — Layer 1: Dixon-Coles** `[ ]`
Deps: B-02. Implements: 01 §3.1.
AC: ρ fit by MLE on the three-season archive against odds-implied means; scoreline grid + P(CS) outputs stored; truncation error at grid edge measured and recorded; goal-minute draw calibrated against archive minute distribution.

**B-04 — Layer 3: minutes model v1** `[ ]`
Deps: A-06, B-01. Implements: 01 §3.3.
AC: P(start) classifier trained walk-forward with isotonic calibration; per-manager sub-off curves built with league-blend by sample size; lineup-scenario generator produces M=50 coherent XIs per team-GW; `minutes_forecasts` populated; start log-loss beats a "started-last-week" baseline out-of-sample.

**B-05 — Presser pipeline (Haiku) — the only AI spend** `[ ]`
Deps: A-02. Implements: 02 §6.
AC: Friday run + nightly diff scan implemented; output validates against the exact schema in 02 §6.2, invalid rows logged not inserted; signals visible in `presser_signals` and consumed as Layer 3 features and the News page; a week of dry-run cost logged and confirmed ≤ the §6.4 estimate band; `pen_duty` updates ride the pipeline; a repo-wide guard test asserts no other module imports the Anthropic client.

**B-06 — Layer 2: allocation** `[ ]`
Deps: A-06, A-07/A-08 (any healthy xG source). Implements: 01 §3.2.
AC: shrunken npxG shares renormalise within expected XI; penalty EV computed with archive-derived award/conversion rates (no hard-coded constants — unit test asserts); finishing multiplier clamped per calibrated bound; role-change flag resets demonstrated.

**B-07 — Layer 4: joint simulation** `[ ]`
Deps: B-03, B-04, B-06, A-10. Implements: 01 §3.4.
AC: N=10,000 sims per fixture within the scheduled projection-run window; per-player distributions to `projections`, per-sim matrices to `sim_artifacts`, covariances to `team_covariances`; BPS race uses the rules-driven engine; DefCon thresholds from rules JSON; simulated bonus distribution validated against 2025/26 actuals in backtest mode.

**B-08 — Calibration harness + ablation (thresholds finalised)** `[ ]`
Deps: B-07, A-05. Implements: 01 §4.
AC: walk-forward runner with enforced `as_of` discipline; log-loss/CRPS/reliability computed and stored; naive, market-only, and public-source benchmarks ingested and scored; ablation ladder report generated — any layer failing to beat the previous is flagged for cut; derived thresholds written to config and consumed by the evaluation services.

**B-09 — EO proxy scrape + validation** `[ ]`
Deps: A-02. Implements: 02 §2.7; campaign plan "named build task".
AC: top-10k EO table ingested weekly to `eo_snapshots`; validation cross-check vs a direct 1,000-squad sample on 2025/26 data within an agreed tolerance; fallback path (direct sampling) implemented and tested; polite rate limits enforced.

**B-10 — Evaluation services + solver v1 (zero AI calls)** `[ ]`
Deps: B-07, B-08, B-09, A-03. Implements: 01 §3.5; campaign-plan decision rules.
AC: squad-evaluation service returns the Builder's exact four readouts (projected points over a 1–12 GW horizon from stored projections + covariances, captaincy strength, risk flags, structure) in <300ms from DB; transfer-comparison service ranks same-position replacements with net squad EV delta; beam-search transfer planner over 6-GW horizon respecting bank/FT-cap/legality from rules JSON with the calibrated hit threshold; field model scores on shared sim draws; every evaluation carries points-EV and rank-EV; a guard test asserts zero AI-client imports across `src/solver` and the API routes.

**B-11 — Chip season-sim (incl. Free Hit)** `[ ]`
Deps: B-10. Implements: 01 §3.5; campaign-plan chip strategy.
AC: candidate placements simulated over the remaining season; set-1 expiry enforced from rules JSON; Free Hit valued on single-week dislocation with the burn-before-expiry rule implemented; placement grids cached for the Squad-page chip tools; skeleton written to `chip_plan`.

**B-12 — Tool scaffold: desktop layout, theme, right-rail nav, status sheet (no auth)** `[ ]`
Deps: A-02. Implements: 03 §1–2; 02 §7.
AC: Next.js app on Vercel at an unguessable path with **no login gate**; browser ships only the anon key under read-only RLS (verified: anon role cannot write any table); FPL-elevated theme tokens and fonts from 03 §1; fixed right rail (240px) with the six pages (Dashboard/Squad/Builder/Players/Analysis/News) and the freshness block; header with passive deadline countdown, Refresh and Ask buttons; status sheet with heartbeats, staleness colours, Odds credit counter, **Analyst month-to-date spend vs cap**, model/ruleset version; desktop-only — no mobile breakpoints shipped.

**B-13 — On-demand Refresh endpoint + Dashboard page** `[ ]`
Deps: B-12, A-04, B-07. Implements: 02 §8; 03 §3.1; 04 §1.
AC: `POST /api/refresh` (server route, service key) triggers FPL pulls (bootstrap deltas, fixtures, element deltas; `event/{gw}/live` during live GWs) and recomputes derived aggregates — SQL/arithmetic only; server-side 60s debounce; response returns a per-source freshness map rendered in the strip; **odds excluded from the refresh path with a test proving no code path from the endpoint reaches the Odds client**; Dashboard per 03 §3.1 — fixed 2×2 quadrant grid on a wide canvas (Trending, My Team with lineup graphic + expansion, Fixture Swings, Players preview with working inline position filter), huge display type, generous whitespace, desktop-only.

**B-14 — Pick tracking via team ID (setup → freeze → snapshot → settlement)** `[ ]`
Deps: A-04, A-02. Implements: 04 §2; 01 §2 (`gw_picks`); 02 §2.1.
AC: setup flow asks once for the FPL team ID and stores it as `FPL_ENTRY_ID` config (documented as a public number, not a credential; no login ever); projections frozen at each GW deadline keyed to deadline timestamp; post-deadline snapshot (Supabase pg_cron 5-min checker → dispatch) reads the public picks endpoint for that ID and writes picks, captain/vice, chip to `gw_picks` with frozen projections and a never-revised predicted total; settlement after the 09:00 finalisation writes actuals; season predicted-vs-actual series renders on the Dashboard My Team expansion and Squad page strip.

**B-15 — Launch-day rules verification runbook** `[ ]`
Deps: A-03. Implements: campaign plan "launch day, named task"; rules JSON metadata.
AC: a documented, executable checklist that walks the official FPL rules/help pages; every `VERIFY`/`VERIFY_AT_LAUNCH` item in `rules-2026-27.json` flipped to `CONFIRMED` or corrected; ruleset version bumped and re-published to `rulesets`; chip tools re-run under the stamped ruleset; **hard gate: B-16 cannot ship before this completes**.

**B-16 — GW1 three-variant drafts (DUE 7 AUG)** `[ ]`
Deps: B-10, B-11, B-15, B-18, B-21, A-11, B-01. Implements: campaign plan "GW1 draft: three variants".
AC: pure/moderate/spicy squads generated under the stamped ruleset and saved as three named drafts in the Builder's Drafts mode with side-by-side comparison working; dual EV lines and all four readouts visible per draft; BPS-repricing, fatigue-study, and formation-study outputs demonstrably feeding the drafts (traceable in the readouts); Louis's chosen posture recorded as the season's opening pick.

**B-17 — Rival scraper (build, validate, park)** `[ ]`
Deps: A-04. Implements: campaign-plan EO/rank-EV rules; 01 §2 (`rival_squads`).
AC: post-deadline sampler over public picks endpoints at polite rates; validated on 2025/26 data (reconstructed EO within tolerance of B-09); armed behind a config flag that trips at overall rank < 50k; does nothing until then.

**B-18 — Strategy study (DUE 3 AUG)** `[ ]`
Deps: A-06, A-05, A-04. Implements: 03 §3.5; 02 §2.8; campaign-plan timeline (named study alongside the backtests).
AC: three parts delivered and stored as data rows (finding, effect size, evidence score, season range, source): **(a) top-manager behaviour** from community-scraped archives of historical top-10k weekly picks (GitHub; coverage per season recorded) plus champions' season summaries from `entry/{id}/history` — with the sourcing constraint honoured in code and writeup: **past seasons' week-by-week picks are NOT available from the official API**, so any season without a community archive is analysed at summary level only; **(b) structural analyses** on the vaastav/Fantasy-Premier-League dataset — best formations by season, value by position/price band, budget structures, bench spend vs return; **(c) one web-research synthesis** of proven high-rank strategy findings, sources listed. Findings render on the Analysis page and set the Guided builder's Step-1 defaults; relevant findings are exposed to the Analyst payload builder; monthly re-run scheduled for the current-season components.

**B-19 — Squad Builder: Guided mode** `[ ]`
Deps: B-10, B-12, B-18. Implements: 03 §3.2 (Guided).
AC: Step 1 presents structure cards ranked by B-18 evidence with scores and one-line whys; subsequent steps build position group by position group with engine-ranked candidates inside the structure's budget envelope; every add/remove updates the fixed right feedback panel instantly (four readouts, horizon slider 1–12 GWs); legality validated inline against rules JSON.

**B-20 — Squad Builder: Free Build + live feedback panel** `[ ]`
Deps: B-10, B-12. Implements: 03 §3.2 (Free Build, feedback panel).
AC: empty-pitch assembly of any legal squad; the shared feedback panel component renders exactly the four readouts and nothing else; evaluation round-trip <300ms; panel is a fixed right column on desktop; budget/3-per-club/composition violations flagged inline as they occur.

**B-21 — Squad Builder: Drafts + compare** `[ ]`
Deps: B-19 or B-20 (panel exists), A-02. Implements: 03 §3.2 (Drafts); 01 §2 (`squad_drafts`).
AC: save/rename/delete named drafts from either mode; side-by-side comparison of up to three drafts showing the four readouts and per-position diffs; promote-to-plan-of-record flag; drafts persist in `squad_drafts` with eval cache invalidated on new projections.

**B-22 — The Analyst: payload builder + Ask route (on-press Sonnet)** `[ ]`
Deps: B-12, B-10, B-18. Implements: 02 §9.1, §9.3, §9.4; 03 §4.
AC: single shared payload builder assembles the seven context blocks of 02 §9.1 with the ~20k-token cap and the documented trim order; the verbatim system prompt from 02 §9.3 ships byte-identical (snapshot test); Ask drawer on every page with optional question, estimated cost pre-press, actual cost + month-to-date post-press; `analyst_calls` row per press; **server-side monthly cap** enforced with a refusal message pointing at the copy path; guard test asserts the Sonnet client is imported only by the Ask route and no scheduled job can reach it.

**B-23 — The Analyst: memory (post-GW append + feed-forward)** `[ ]`
Deps: B-22, B-14, C-04 logic (settlement fields). Implements: 02 §9.2; 01 §2 (`analyst_memory`).
AC: Monday-audit extension appends structured system records per GW (decisions vs model evaluations, per-pick prediction gaps, captaincy outcomes, component misses); fenced `MEMORY` blocks in Analyst responses are parsed and stored with `created_by='analyst'`, malformed blocks dropped and logged; payload builder includes the token-capped memory digest ordered by recency/relevance; drawer shows the loaded-record count.

**B-24 — Copy Analyst Payload (zero-cost export)** `[ ]`
Deps: B-22. Implements: 02 §9.5; 03 §4.
AC: button beside Ask puts the identical payload (system prompt as header block + the seven context blocks) on the clipboard as formatted text; byte-equality test against the API route's payload for the same state; works with no API call and no cost row.

---

## Phase C — Pre-GW1 completion (8 Aug → GW1 deadline)

**C-01 — Evening pull + rise prediction** `[ ]`
Deps: A-04. Implements: 02 §3 `evening_pull`; 03 §3.6.
AC: 18:00 job computes net transfer velocity and rise-risk banding; HIGH-risk flags for squad/draft players appear on the News page (no push anywhere); predictions scored against actual overnight changes for two weeks and the banding thresholds adjusted from that data.

**C-02 — Nightly 03:00 pull + price digest** `[ ]`
Deps: A-04. Implements: 02 §3 `nightly_pull`.
AC: runs after the 01:30–02:30 change window; diffs prices to `player_price_history`; overnight risers/fallers visible on the News page by morning.

**C-03 — Cup watcher + blank/double flags** `[ ]`
Deps: A-04. Implements: 02 §3 `cup_watcher`; 03 §3.3, §3.6.
AC: detects fixture postponements/additions from the fixtures feed; sets `gameweeks.is_blank/is_double`; entry appears on the News page; chip placement grids re-solve automatically and the Squad-page chip tools reflect the new flags.

**C-04 — Monday audit + pick settlement + memory append** `[ ]`
Deps: B-07, B-14. Implements: 02 §3 `monday_audit`; 04 §2; campaign-plan audit discipline; 02 §9.2.
AC: settles `gw_picks` actuals after bonus finalisation (re-run trigger honours the 09:00 day-after rule read from `fixtures`); appends the structured post-GW records to `analyst_memory`; calibration drift computed on rolling windows only; single-week misses written as variance with no attribution; drift breaches open a re-fit task and show on the status sheet.

**C-05 — Squad page (pitch, sell/replace, captaincy + chip tools, season strip)** `[ ]`
Deps: B-10, B-11, B-14, B-12. Implements: 03 §3.3.
AC: pitch view of the current 15 from `gw_picks`/`my_squad` with projections on shirts; click-player sell/replace panel with ranked same-position candidates, fans, prices, rise-risk, net squad EV delta; captaincy comparison module (tails, P(12+), EO overlay); chip tools with GW strip, expiry wall, season-EV curve, commit flow; season predicted-vs-actual strip — laid out as pitch + right-column modules per 03 §3.3.

**C-06 — Players page (database, filters, profiles)** `[ ]`
Deps: B-12, B-07. Implements: 03 §3.4.
AC: full database with position/price/team/availability filters and sorts including value (pts per £m); dense desktop table with fans and mono-aligned columns; **raw data presented properly — no dumbed-down commentary, no tooltips explaining basics** (verified by review against 03 §3.4); profile drawer with distribution, next-6 fixture chips, form, minutes risk; deep-links from Dashboard trending and fixture-swing clicks.

**C-07 — Analysis page** `[ ]`
Deps: B-18, B-12. Implements: 03 §3.5.
AC: renders every B-18 finding as chart + written conclusion; evidence scores match those cited in the Guided builder; monthly re-run refreshes in place; loads entirely from stored findings (no computation on request beyond queries).

**C-08 — News page** `[ ]`
Deps: B-05, C-01, C-02, C-03, B-12. Implements: 03 §3.6.
AC: reverse-chron feed with type filters; presser signal chips with confidence grouped by club; last-night price changes and tonight's rise risks; cup/blank-double and ruleset entries; nothing from this page is ever pushed anywhere.

**C-09 — International-break report job** `[ ]`
Deps: B-05. Implements: 02 §3 `intl_break_report`.
AC: on break weeks, a report entry lists travelled players, 180-minute loads, and new flags on the News page; feeds Layer 3 congestion features.

**C-10 — Season-ops runbook** `[ ]`
Deps: all above. Implements: campaign-plan gates and review.
AC: written procedures with dates for the GW15 gate-schedule agreement, GW19 gate application, GW25 signing, GW28 checkpoint, and the GW38+1 season review; each lives as a pre-computed view Louis opens when he chooses — no reminders, per the interaction model.

---

**C-11 — Player comparison** `[ ]`
2–3 players side by side from the Players table; full profile rows with best-per-row highlight; overlaid projection fans. Spec §3.4.2. Mockup done (both Players surfaces); build = same UI on `projections` + `player_gw_points`. Depends: C-06.

**C-12 — Differential screener** `[ ]`
One-click Players preset: high xP, low effective ownership, ranked by the gap using `eo_snapshots.top10k_proxy`. Spec §3.4.2. Mockup done (own% proxy). Depends: C-06, B-09.

**C-13 — Set-piece matrix** `[ ]`
Every team's penalty hierarchy + direct-FK + corner takers from `set_piece_duty`, kept current by the presser pipeline and observed kicks; surfaced as the SET PIECES view on the Players page (spec §3.4.3). Penalty duty is the most concentrated point source in the game. Depends: B-05, C-06.

**C-14 — Post-GW review** `[ ]`
After settlement: my picks vs model — predicted vs actual per player (`gw_picks.frozen_projections` vs `player_gw_points`), captaincy outcome, which engine component missed (vs `calibration_metrics`). Auto-appends structured records to `analyst_memory`. Dashboard module per spec §3.1 (post-GW review); appears the morning after the Monday audit. Depends: C-04, B-14, B-23.

**C-15 — Multi-GW transfer planner** `[ ]`
Squad page: plan moves 1–4 GWs ahead in `transfer_plans`; tracks banked FTs toward the 5-cap; projected gain per move; flags collisions with predicted price changes (`transfer_velocity`) and fixture swings. Spec §3.3.1. Depends: C-05, C-01.

**C-16 — Analysis deep-links as routed actions** `[ ]`
Structure→Builder and value-band→Players with pre-set state carried in URL params (shareable). Spec §3.5.1. Proven in `fpl-app-mockup.jsx`. Depends: C-07, B-12.

**B-25 — Promoted-club shrinkage priors** `[ ]`
Named model feature (doc 01 §3.9): prior fitted on last five promoted cohorts, linear decay to GW10, `projections.prior_blend`, inflated `ep_sd`, separate calibration scoring, LOW SAMPLE marker contract with the UI. Depends: A-02, A-03; feeds B-06.

---

## Dependency snapshot

```
A-01 → A-02 → {A-03, A-04, A-05, A-07, A-09}
A-04 → {A-06, A-08, A-12, B-17, C-01, C-02, C-03}
A-03 + A-06 → A-10 → A-11 (30 Jul)
A-12 → B-01 (1 Aug)          {A-06, A-05, A-04} → B-18 (3 Aug)
A-05 + A-09 → B-02 → B-03
{A-06, B-01} → B-04     {A-06, xG source} → B-06
{B-03, B-04, B-06, A-10} → B-07 → B-08 → B-10 → B-11
A-02 → {B-05, B-09, B-12} · B-12 → {B-13, B-19, B-20}
{B-10, B-12, B-18} → B-19 · {B-19|B-20} → B-21
A-04 → B-14 (team-ID pick tracking)
{B-12, B-10, B-18} → B-22 → {B-23 (with B-14), B-24}
A-03 → B-15 ─┐
{B-10, B-11, B-18, B-21, A-11, B-01} ──┴→ B-16 (7 Aug, gated on B-15)
C-06 → {C-11, C-12} · {B-05, C-06} → C-13
{C-04, B-14, B-23} → C-14 · {C-05, C-01} → C-15 · {C-07, B-12} → C-16
{A-02, A-03} → B-25 → B-06
Phase C closes the six pages + ops loop before the GW1 deadline.
```

---

## FEATURE FREEZE — v1 scope locked (24 Jul 2026)

v1 is everything above this line. Anything new goes on the v2 list; nothing jumps the queue before GW1.

## v2 list

- True top-10k EO via expanded rival sampling (upgrade of the B-09 proxy)
- Comparison from any surface (profile-to-profile), not just the Players table
- Shot maps filtered by GW range / situation
- Transfer planner auto-suggest (solver proposes the move sequence)
