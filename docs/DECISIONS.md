# FPLBot — DECISIONS

**This document is binding. Every delivery is checked against it before hand-over.**

It is the single authoritative decisions document. `docs/tickets.md` holds the 53 tickets and their
acceptance criteria, `STATUS.md` holds the plain-language current state, `docs/campaign-plan.md`
holds the original brief. There is no `PROJECTPLAN.md` in the repo; those three are the plan
documents. Where any of them disagrees with this file, this file wins.

The root cause of repeated regressions was that these decisions only ever lived in chat, so each
rebuild reinvented them. They live here now. If a decision is not in this file, it is not a
decision. If this file and any other document disagree, this file wins.

Where a decision changed, only the latest version appears. Superseded versions are noted so nobody
reintroduces them.

Status column: **LIVE** means implemented, with the file cited. **BROKEN** means not implemented or
only partly implemented. No citation means BROKEN.

Two decisions are marked SUMMARY as their source: those came from the compacted portion of the
conversation, so the wording is a summary rather than verbatim. Everything else is verbatim.

---

## 1. Type system

Locked. Abandoned twice before this file existed. Enforced by `tests/design-system.test.mjs`, which
fails the suite on violation.

| # | Decision | Status | File |
|---|---|---|---|
| 1.1 | Outfit is used for all words | LIVE | `lib/ui.jsx` → `lang()` |
| 1.2 | Michroma is page titles and the wordmark only | LIVE | `lib/ui.jsx` → `D`, used only in `components/Shell.jsx` |
| 1.3 | Martian Mono is numeric values only | LIVE | `lib/ui.jsx` → `val()` |
| 1.4 | Mono weight 700 maximum, never 800 | LIVE | `lib/ui.jsx` → `FNW`, clamped inside `val()` |
| 1.5 | All text pure #FFFFFF. No grey, no opacity. Hierarchy from size and weight only | LIVE | `lib/ui.jsx` → `solid()` |
| 1.6 | Caps only on page titles, wordmark, small eyebrow labels, and codes (club abbreviations, positions, GW numbers, status codes like FIT) | LIVE | `lib/ui.jsx` → `Label`, `code()` |
| 1.7 | Plates only where a value earns emphasis, never around every cell | LIVE | `lib/ui.jsx` → `Value` is the default, `Plate` the exception. Ceiling of four per file is enforced |
| 1.8 | Name-over-number: the name dominates, the number sits lighter and smaller beneath | LIVE | `lib/ui.jsx` → `NameNumber` |
| 1.9 | Neon pink #FF2ECC is reserved for captain and value emphasis. Nothing else may use it | LIVE | `lib/ui.jsx` → `T.tag` |
| 1.10 | No abbreviation, tag or label that cannot be understood at a glance. TPL specifically banned | LIVE | enforced in `tests/design-system.test.mjs` |
| 1.11 | Tokens live centrally so this cannot drift again | LIVE | `lib/ui.jsx` is the only source |
| 1.12 | No captions | SUMMARY, LIVE | `lib/ui.jsx` |

Superseded: an earlier note recorded Martian Mono at weight 800. 700 is the ceiling.

---

## 2. Numbers and honesty

| # | Decision | Status | File |
|---|---|---|---|
| 2.1 | No fake, empty or placeholder numbers anywhere. If the data is not there, render nothing and say once where it is coming from | LIVE | `app/player/[id]/PlayerPage.jsx`, `app/players/page.jsx` |
| 2.2 | A column whose every value would be zero is not rendered until the data exists | LIVE | `app/players/page.jsx` → `columnsFor()` |
| 2.3 | xP is hidden until walk-forward calibration passes. Until then the label is INTERIM SCORE | LIVE | `lib/solver/score.mjs` → `metricLabel()`, gated by `model_gates` |
| 2.4 | Every interim metric is labelled with its upgrade date | LIVE | `lib/solver/score.mjs` → `interimChip()` |
| 2.5 | xP is the only term for projected points. Never EP | LIVE | enforced in `tests/design-system.test.mjs` |
| 2.6 | Every score must have a defined, transparent formula written into the docs | LIVE | `docs/scoring-formulas.md`, `docs/build/01-architecture-and-model.md` |
| 2.7 | Never report a count, check or benchmark that was not actually produced | LIVE | process rule |
| 2.8 | Unpublished fixtures render TBC, never a dash | LIVE | `components/Opp.jsx` |
| 2.9 | Every element maps to a real column or computed output. Zero fake xP | SUMMARY, LIVE | `lib/projections.js` |

---

## 3. Filters and player discovery

| # | Decision | Status | File |
|---|---|---|---|
| 3.1 | Price filtering is a min/max range slider. No preset max buttons | LIVE | `app/players/page.jsx` → `PriceRange` |
| 3.2 | All players are visible regardless of budget. Never hide a player for affordability | LIVE | `app/players/page.jsx`, no affordability filter exists |
| 3.3 | Club filtering is a dropdown, not typing a name | LIVE | `app/players/page.jsx` → `Sel` |
| 3.4 | All filters combine simultaneously | LIVE | `app/players/page.jsx` → single filter chain |
| 3.5 | Every filter the data genuinely supports is present: ownership bands, availability and rotation read, promoted-club flag, fixture-run difficulty, differentials | LIVE | `app/players/page.jsx` |
| 3.6 | Where a filter needs data not ingested, add the ingestion or ticket it explicitly. Never skip silently | LIVE | set-piece and penalty duty ticketed as D5 |
| 3.7 | Each filter shows its own consequence: option counts, visible thresholds | LIVE | `app/players/page.jsx` |
| 3.8 | Filters reset cleanly in one action | LIVE | `app/players/page.jsx` → `clearAll` |
| 3.9 | Every sort states what it is evidence of | LIVE | `app/players/page.jsx` → `SORT_BASIS` |

---

## 4. Player pages

| # | Decision | Status | File |
|---|---|---|---|
| 4.1 | Players have full pages on their own route, full width, Football Manager depth | LIVE | `app/player/[id]/PlayerPage.jsx` |
| 4.2 | Header carries name, club, position, price, ownership, status, next fixtures with strength colours | LIVE | same |
| 4.3 | Season and career numbers, per season and per competition | LIVE | same, reading `history_player_gw` |
| 4.4 | Expected goals and assists against actual, where available | LIVE | same |
| 4.5 | Price trajectory | LIVE | same, reading `player_price_history` |
| 4.6 | Projection distribution, once the engine is calibrated | LIVE as a gated section, empty until the gate opens | same |
| 4.7 | Comparison entry point on the page itself | LIVE | same |
| 4.8 | The drawer may remain as a quick look, but clicking through lands on the real page | LIVE | `app/players/page.jsx` |
| 4.9 | Every surface showing a player links to the page | LIVE | players table, squad rows, builder shirts, comparison cards |
| 4.10 | Form, minutes and rotation read, availability history | LIVE | `jobs/fpl_bootstrap.mjs` records every change in status, chance of playing and news; shown on the player page |

---

## 5. Opponent context

| # | Decision | Status | File |
|---|---|---|---|
| 5.1 | Next opponent appears beside every player, everywhere a player appears | LIVE | `components/Opp.jsx`, used on eight surfaces |
| 5.2 | Our own opponent-strength scale, more granular than FDR, computed from form, updating through the season | LIVE | `lib/opponent.js` |
| 5.3 | It switches to odds-implied strength when that pipeline lands | LIVE as a parameter, not yet fed | `lib/opponent.js` → `impliedGoalsByTeamId` |
| 5.4 | The scale is defined once and applied identically everywhere | LIVE | one module, one component |
| 5.5 | The formula is written down | LIVE | `docs/build/01-architecture-and-model.md` |

---

## 6. Builder and drafts

| # | Decision | Status | File |
|---|---|---|---|
| 6.1 | Clicking Builder lands on the mode choice: GUIDED, BUILD, DRAFTS, immediately selectable | LIVE | `app/builder/BuilderClient.jsx` → `TabBar` |
| 6.2 | Never forced through guided steps to build normally | LIVE | same |
| 6.3 | Free build is a one-click entry with the full pitch and live feedback | LIVE | same |
| 6.4 | Drafts opens straight to saved drafts | LIVE | same |
| 6.5 | Modes switch at any time without losing work | LIVE | same, squad state is shared |
| 6.6 | Formation is switchable at any point with the same fifteen, the eleven rearranged, feedback re-scoring live | LIVE | `lib/solver/core.mjs` → `applyStructure` |
| 6.7 | Formation is presented as a live lens, not a gate, and says so | LIVE | `app/builder/BuilderClient.jsx` |
| 6.8 | Guided shows the complete step map upfront, every step named and visible, with progress | LIVE | `app/builder/BuilderClient.jsx` → `StepMap` |
| 6.9 | Any earlier step can be jumped back to without losing the squad | LIVE | `app/builder/BuilderClient.jsx` → `StepMap`, jumping only changes which candidate list shows |
| 6.10 | Strategic decisions come before the pitch appears: shape, budget structure, bench strategy, where to invest by position, risk posture, captain anchor | LIVE | `app/builder/BuilderClient.jsx` → six plan steps, `PlanStep` |
| 6.11 | Each strategic step carries its evidence and updates the feedback panel live | LIVE | `app/builder/BuilderClient.jsx` → `planEvidence`, computed from the live pool and `config/fitted-params.json`. Risk posture carries no figures because the rank-distribution evidence needs manager pick data we do not ingest |
| 6.12 | Guided player selection runs position group by group in constraint order: premiums and the captain anchor first, budget enablers last | LIVE | `app/builder/BuilderClient.jsx` → `PICK_ORDER` is MID, FWD, DEF, GKP |
| 6.13 | The pitch fills in as picks are made rather than appearing empty | LIVE | `app/builder/BuilderClient.jsx`, the pitch renders from the first guided step once any player exists |
| 6.14 | Every step remains editable afterwards, including formation, with the squad preserved | LIVE | `app/builder/BuilderClient.jsx`, `lib/solver/core.mjs` → `applyStructure` |
| 6.15 | A draft saves at any point, with any number of players including zero. No completeness requirement, no blocking validation | LIVE | `app/api/drafts/route.js`, `app/builder/BuilderClient.jsx` |
| 6.16 | Incomplete drafts reopen exactly where they were left and show what is still missing | LIVE | `app/builder/BuilderClient.jsx` → `DraftCard` gap read |
| 6.17 | The drafts list shows completeness at a glance | LIVE | `app/builder/BuilderClient.jsx` → `DraftCard` progress bar |
| 6.18 | Drag and drop wherever possible on desktop | SUMMARY, LIVE | `components/BuilderPitch.jsx` |

---

## 7. Scoring panel

Every item here is BROKEN. The current panel shows four readouts, not a scored panel.

| # | Decision | Status |
|---|---|---|
| 7.1 | Overall squad score as the headline | LIVE, `lib/scoring.js` → `overallScore` |
| 7.2 | Line strength scores for GK, DEF, MID, FWD, so a weak line is instantly visible | LIVE, `lib/scoring.js` → `lineStrength` |
| 7.3 | Projected points with the horizon slider, interim basis labelled | LIVE, `components/Feedback.jsx` |
| 7.4 | Captaincy strength: how good the best armband option in this squad is | LIVE, `lib/scoring.js` → `captaincyStrength` |
| 7.5 | Template alignment as a percentage against the consensus best XV and the top-10k template | LIVE | `lib/scoring.js` → `templateAlignment` and `topRankAlignment`. Top-rank comes from `jobs/rival_pull.mjs`, which reads the official overall league rather than scraping, and measures effective ownership so a captained player counts double |
| 7.6 | Template alignment is **not higher-is-better**. Maxing it guarantees rank 1 is impossible; zero alignment is pure variance. It is presented as a band with a target zone, coloured against that zone, never against 100% | PARTLY LIVE, `components/Feedback.jsx` states the interpretation and shows the band. The target zone is not fitted and cannot be until the strategy study, so none is invented |
| 7.7 | Both sides are shown: which essential template picks are missing, and where the squad is differentiated | LIVE, `components/Feedback.jsx` |
| 7.8 | Risk flags: count plus what they are | LIVE, `components/Feedback.jsx` |
| 7.9 | Structure: budget spread, bench floor, premium count, club concentration | LIVE, `components/Feedback.jsx` |
| 7.10 | Visual-first, minimal words, colour-coded, every score showing its number | LIVE, `components/Feedback.jsx` |
| 7.11 | Every score has a defined, transparent formula written into the docs | LIVE, `docs/scoring-formulas.md` |
| 7.12 | Each score shows its interim basis where real data is not live | LIVE, `components/Feedback.jsx` |

---

## 8. Pages that do not exist

| # | Decision | Status |
|---|---|---|
| 8.1 | Analysis page built out properly instead of a placeholder | LIVE, `app/analysis/AnalysisClient.jsx` reading `history_position_season`, `history_value_band`, `history_coverage`, `fitted_params`, `model_gates`, `strategy_findings` |
| 8.2 | News page built out properly instead of a placeholder | LIVE, `app/news/NewsClient.jsx` reading `presser_signals` and `player_price_history` |
| 8.3 | Team ID connect, so real picks are tracked against predictions | LIVE, `app/api/entry/route.js`, `components/TeamAndChips.jsx` |
| 8.4 | Chip planning surface | LIVE, `app/api/chips/route.js`, `components/TeamAndChips.jsx` |
| 8.5 | Per-competition history shown on player pages | LIVE, `app/player/[id]/PlayerPage.jsx`, currently one competition in the data |

---

## 9. The model

| # | Decision | Status | File |
|---|---|---|---|
| 9.1 | Load every usable season of the open FPL dataset, roughly 2016/17 onward | LIVE | `jobs/history_load.mjs`, ten seasons, 253,900 rows |
| 9.2 | Fit on seasons up to 2024/25. Hold 2025/26 entirely untouched and test on it once at the end | LIVE | `config/fitted-params.json` |
| 9.3 | Walk forward inside the training set: train through GW t, predict t+1, roll | PARTLY LIVE | used to fit `k`; no general harness exists |
| 9.4 | Fit aggressively on real historical points. Thin fitting is a bigger risk than overfitting | PARTLY LIVE | Six families fitted: position priors, minutes priors, promotion factor, blend k, rate shrinkage, minutes scaling. Dixon-Coles rho attempted and rejected: the reconstruction recovered half the matches and the likelihood was mis-specified, so it stays neutral. See `config/fitted-params.json` |
| 9.5 | Never hand-pick `k`. Fit it from history | LIVE | `config/fitted-params.json`, grid-searched to 1000 minutes |
| 9.6 | Promoted players: measure the discount from the ten seasons. No Championship scraper in v1 | LIVE | `config/fitted-params.json`, factor 0.7511 overall, per position |
| 9.7 | Add a competition column and separated per-competition history | LIVE | `supabase/migration-006.sql` |
| 9.8 | Validate minutes separately against actual minutes, with its own scorecard split by rotation-heavy versus settled squads | LIVE | `jobs/minutes_scorecard.mjs`, surfaced on the Analysis page. Brier for P(start) and P(60+), MAE in minutes, start accuracy, split settled versus rotation-heavy with the split measured on the prior season only |
| 9.9 | Component-level attribution: every miss traceable to minutes, goal share, assist share, clean sheet, bonus, DefCon or negatives | LIVE | `jobs/component_attribution.mjs`, surfaced on Analysis. Decomposes the held-out season with the real ruleset and reports each component's share of point movement. DefCon is excluded because it exists in one season only |
| 9.10 | Baseline gate: benchmark against season-average points, a market-only model, and one public source. Then test every layer against the version without it. Any layer failing out-of-sample is cut, no exceptions | LIVE for the layers that exist | `jobs/baseline_gate.mjs` grades the on-screen scorer against three baselines on the untouched 2025/26 season, per position, on rank correlation plus RMSE and MAE. Two gaps remain: no historical odds are held so the odds engine itself cannot be graded, and the layer ablation ladder is not built |
| 9.11 | Per-position calibration with reliability curves for GK, DEF, MID, FWD separately | LIVE | `jobs/reliability.mjs` bins predictions into quintiles per position and reports bias, surfaced on Analysis |
| 9.12 | Role reallocation on unavailability instead of zeroing | BROKEN, blocked on set-piece duty data | |
| 9.13 | Team form and home advantage never get their own adjustment layer. Both are already priced into the odds | LIVE | `docs/model-exclusions.md` |
| 9.14 | Nothing that requires predicting human intent. No manager change, managerial style, motivation, stakes, or rotation intent beyond observed historical patterns. Excluded from v1 and v2 permanently | LIVE | `docs/model-exclusions.md` |
| 9.15 | Formation cards get real per-shape evidence if the data supports it, or show nothing | LIVE | `app/builder/BuilderClient.jsx`, fitted points per start per position |
| 9.16 | The BPS backtest output must actually be read and reported | BROKEN | job has run, output never read |

---

## 10. Quality bar for every delivery

Run this before hand-over. If the pass finds nothing, it was not done properly.

| # | Check | Enforcement |
|---|---|---|
| 10.1 | Type system enforced on every screen | `tests/design-system.test.mjs` |
| 10.2 | No invented or empty numbers | manual, plus 2.1 and 2.2 |
| 10.3 | No unreadable abbreviations | `tests/design-system.test.mjs` |
| 10.4 | No placeholder text on live surfaces | manual |
| 10.5 | Every control works and combines | manual |
| 10.6 | Consistent components and terminology on every page | `tests/design-system.test.mjs` partly |
| 10.7 | Nothing overlapping or shifting at 1440 and 1920 | **cannot be automated here, needs a browser** |
| 10.8 | Clean console | **cannot be automated here, needs a browser** |
| 10.9 | Empty and error states on every data surface | manual, currently present on all six |
| 10.10 | All text spelled correctly | manual |
| 10.11 | `next build` passes and the full suite passes | run every time |
| 10.12 | Nothing from a previous package removed or degraded | manual |

---

## 11. Working rules

| # | Rule |
|---|---|
| 11.1 | One zip per delivery, one set of manual steps at the end |
| 11.2 | No changelogs. Superseded an earlier rule requiring a five-line changelog |
| 11.3 | No status essays, no plan recaps, no re-explaining |
| 11.4 | Instructions go at the bottom of the response, not midway |
| 11.5 | Plain language, not coder-speak |
| 11.6 | Flag anything that cannot be done properly in a turn rather than half-doing it |
| 11.7 | A running deferred list at the end of every delivery, so nothing is lost between them |
| 11.8 | Never stop a whole delivery for one blocked item. Ship the rest and note the carry-over in one line |
| 11.9 | Do not ask which order to build in. That is a delivery decision, not a user decision |
| 11.10 | Anything needing a scraper that does not exist is skipped and ticketed, not faked |
| 11.11 | Never claim a verification that did not run |
| 11.12 | Verification runs once per delivery as an automated suite. Prose only for failures |
| 11.13 | Desktop only, 1440px minimum. SUMMARY source |
| 11.14 | Navigation rail on the right. SUMMARY source. Enforced in `tests/guards.test.mjs` |
| 11.15 | Goalkeeper at the bottom of pitch views. SUMMARY source. Enforced in `tests/guards.test.mjs` |
| 11.16 | Minimum font size 12px. SUMMARY source. Enforced in `tests/guards.test.mjs` |
| 11.17 | No developer-style labels in the UI. SUMMARY source |


---

## 12. EXCLUSIONS — rejected, never to be rebuilt

Everything here was considered and rejected. It does not come back. If a future delivery proposes
one of these, the answer is no without further discussion.

| # | Excluded | Why |
|---|---|---|
| 12.1 | Any Friday ritual, weekly ceremony, or decision-document workflow | Rejected |
| 12.2 | Notifications of any kind | Rejected |
| 12.3 | Plain-English explainers and basic-concept tooltips. FPL concepts are known | Rejected. Enforced by 11.17, no developer-style or explanatory labels |
| 12.4 | X£ as a default price surface | It stays a quiet supplementary view only, never the primary price display |
| 12.5 | Manager-change handling and managerial-style modelling | Requires predicting human intent. `docs/model-exclusions.md` |
| 12.6 | Motivation and stakes modelling: relegation battles, title races, dead rubbers, European qualification | Requires predicting human intent. `docs/model-exclusions.md` |
| 12.7 | Rotation-intent guessing beyond observed historical minutes patterns | Requires predicting human intent. `docs/model-exclusions.md` |
| 12.8 | Separate team-form or home-advantage adjustment layers on top of the odds | Double-counts a signal the market has already priced. `docs/model-exclusions.md` |
| 12.9 | Invented or non-discriminating metrics. The original shape value is the named example: it scored 96 to 100 across all eight formations and therefore discriminated nothing | Replaced by fitted points-per-start per position in `config/fitted-params.json` |
| 12.10 | Unreadable abbreviation tags. TPL is the named example | Enforced in `tests/design-system.test.mjs` |
| 12.11 | A drawer standing in for a real player page | Full pages exist at `app/player/[id]/`. The drawer is a quick look only |
| 12.12 | Neon pink on template status | Superseded the earlier lock reserving neon pink for value and captain emphasis in all cases. Template now uses cyan |
| 12.13 | Changelogs in deliveries | Superseded the earlier five-line changelog rule |
| 12.14 | Preset maximum-price buttons, and any filter that hides a player for affordability | Enforced in `tests/design-system.test.mjs` |
| 12.15 | Blocking validation on saving a draft | A draft saves at any point, including with zero players. `app/api/drafts/route.js` |
| 12.16 | A Championship scraper in v1 | The promotion discount is measured from ten seasons of FPL history instead |
| 12.17 | Hand-picking any model parameter | Everything is fitted and the fit recorded. `config/fitted-params.json` |
| 12.18 | Claiming a verification, count or benchmark that was not produced | Process rule |
| 12.19 | Touching `app/legacy/*` or `app/legacy/_lib` | Deliberately frozen v0 snapshots for comparison. Excluded from every sweep and design pass |
| 12.20 | Editing an already-applied migration | Write forward only |
| 12.21 | Inventing a parameter that could not be fitted | Dixon-Coles rho is the worked example: attempted, found unreliable, left neutral and documented rather than guessed |
| 12.23 | Calling a sample of a few hundred managers "the top 10k" | The scope is named `top10k_proxy` deliberately. A sample is not a census and the naming must never imply otherwise |
| 12.22 | Reallocating corner or free-kick duty | Neither leaves a trace in any ingested source, so there is no hierarchy to walk. Penalties are reallocated because missed penalties are recorded |

---

## 13. Change log for this document

| Date | Change |
|---|---|
| 25 Jul 2026 | Created. Sections 1 to 11 extracted from the conversation, latest version of each decision only |
| 26 Jul 2026 | Top-rank alignment built from effective ownership via the official overall league, no scraper (7.5 live). Every job made lazily-connected and import-safe, with guards. |
| 26 Jul 2026 | Role reallocation built (9.12 live). Penalty duty derived from history, no scraper. Availability history captured and shown (4.10 live). Archive players excluded from every current-season job. Dixon-Coles rho attempted and rejected rather than invented |
| 26 Jul 2026 | Rate shrinkage fitted and applied (S=24 nineties). Reliability curves and minutes coverage built (9.11 live). Pitch visible from step one (6.13 live) |
| 26 Jul 2026 | Expected minutes wired into the live scorer: rank correlation +0.093 to +0.484 on the held-out season, RMSE 3.63 to 2.69. Ablation ladder run; the prior-season layer was challenged by one season and kept after refitting on eight. Guards made reachability-aware so dead files no longer fail the suite |
| 26 Jul 2026 | Component attribution built (9.9 live). BudgetPill import bug fixed and a guard added for missing component imports |
| 26 Jul 2026 | Minutes scorecard built (9.8 live). BPS backtest surfaced on Analysis (9.16 live) |
| 26 Jul 2026 | Template rewritten as a constrained knapsack: the legal fifteen with the highest total ownership inside 100.0. Budget pill added to all three pitches. Baseline gate built, 9.10 and 9.11 partly live |
| 25 Jul 2026 | 8.1 to 8.4 moved to LIVE. Analysis, News, team ID connect and chip planning built. Consistency pass run |
| 25 Jul 2026 | 6.10 to 6.12 and 7.1 to 7.11 moved to LIVE. Guided plan steps and the scoring panel built |
| 25 Jul 2026 | Section 12 exclusions added. Plan-document naming clarified. 3.1, 3.2, 4.9, 6.15, 6.16, 6.17, 7.9, 6.8, 6.9, 6.14 moved to LIVE |


---

## 14. THE SCHEDULE

**Binding. Set 26 Jul 2026. This supersedes every date written in any other document.**

| Milestone | When |
|---|---|
| Working MVP | **26 July 2026** |
| Complete project | **28 July 2026, 22:00** |

The four dates previously repeated across `docs/campaign-plan.md`, `docs/tickets.md`,
`docs/build/01-architecture-and-model.md` and `STATUS.md` — a BPS backtest, fatigue study,
strategy study and GW1 drafts spread across 30 July to 7 August — are **dead**. They were wrong,
they were retyped from those documents repeatedly, and that is why the error recurred.

### How this is now prevented

| Mechanism | File |
|---|---|
| One definition of every date, imported everywhere | `config/schedule.js` |
| The interim upgrade labels read it rather than holding dates | `lib/solver/score.mjs` |
| The database gate matches it | `supabase/migration-010.sql` |
| A guard test fails the build if any surface file hard-codes a date | `tests/design-system.test.mjs` |
| Superseded documents carry a banner at the top pointing here | the four documents above |

The guard test caught four hard-coded dates still hiding in `lib/engine/layer3_minutes.mjs`,
`lib/scoring.js`, `lib/solver/core.mjs` and the test suite itself when it was first added.

### GW1 deadline

The Builder header counts down to the real GW1 deadline read live from the FPL API, not from any
stored date, so it cannot go stale.
