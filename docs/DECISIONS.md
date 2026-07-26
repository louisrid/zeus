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
| 2.3 | **Projected points are called xP, always.** No gate on the name, no provisional wording anywhere a user can see it | LIVE | `lib/solver/score.mjs` → `metricName()` returns xP unconditionally; `interimChip()` is a no-op. **Supersedes the original rule** that withheld the name until calibration passed. Changed by Louis 26 Jul 2026: the number is genuinely calculated, DEFCON and minutes are handled correctly, and the model's real limits are reported on the Analysis page rather than hidden behind a euphemism. The calibration gate still exists and still records whether the gate has run; it no longer controls the label |
| 2.4 | Nothing is labelled provisional to the user | LIVE | Enforced in `tests/guards.test.mjs`: no screen may show INTERIM or an upgrade date. Supersedes the earlier rule requiring upgrade-date chips |
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
| 9.3 | Walk forward inside the training set: train through GW t, predict t+1, roll | LIVE | `lib/harness.mjs`, 6 tests. Enforces that a model can only see gameweeks strictly before the one it predicts, scores every model on the same rows, and computes the ranking verdict. There is no interface through which future data can be passed to a predictor |
| 9.4 | Fit aggressively on real historical points. Thin fitting is a bigger risk than overfitting | LIVE | Every family that can be fitted has been: position priors, minutes priors, promotion factor, blend k, rate shrinkage, minutes scaling, and Dixon-Coles rho. Rho was fitted properly on 1900 matches and **rejected on evidence**: the correction is the wrong shape for this data, shown cell by cell in `config/fitted-params.json`. Home advantage was measured at +0.133 goals and deliberately not applied, per EXCLUSIONS 12.8 |
| 9.5 | Never hand-pick `k`. Fit it from history | LIVE | `config/fitted-params.json`, grid-searched to 1000 minutes |
| 9.6 | Promoted players: measure the discount from the ten seasons. No Championship scraper in v1 | LIVE | `config/fitted-params.json`, factor 0.7511 overall, per position |
| 9.7 | Add a competition column and separated per-competition history | LIVE | `supabase/migration-006.sql` |
| 9.8 | Validate minutes separately against actual minutes, with its own scorecard split by rotation-heavy versus settled squads | LIVE | `jobs/minutes_scorecard.mjs`, surfaced on the Analysis page. Brier for P(start) and P(60+), MAE in minutes, start accuracy, split settled versus rotation-heavy with the split measured on the prior season only |
| 9.9 | Component-level attribution: every miss traceable to minutes, goal share, assist share, clean sheet, bonus, DefCon or negatives | LIVE | `jobs/component_attribution.mjs`, surfaced on Analysis. Decomposes the held-out season with the real ruleset and reports each component's share of point movement. DefCon is excluded because it exists in one season only |
| 9.10 | Baseline gate: benchmark against season-average points, a market-only model, and one public source. Then test every layer against the version without it. Any layer failing out-of-sample is cut, no exceptions | LIVE for the layers that exist | `jobs/baseline_gate.mjs` grades the on-screen scorer against three baselines on the untouched 2025/26 season, per position, on rank correlation plus RMSE and MAE. Two gaps remain: no historical odds are held so the odds engine itself cannot be graded, and the layer ablation ladder is not built |
| 9.11 | Per-position calibration with reliability curves for GK, DEF, MID, FWD separately | LIVE | `jobs/reliability.mjs` bins predictions into quintiles per position and reports bias, surfaced on Analysis |
| 9.12 | Role reallocation on unavailability instead of zeroing | LIVE | `lib/engine/role_reallocation.mjs`, 7 tests. Penalty duty passes to the next available taker; goal and assist share is absorbed proportionally by available teammates in the same position group with the total conserved. Corners and free kicks are not reallocated: no source records them, EXCLUSIONS 12.22 |
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
| 10.10 | All text spelled correctly | manual, swept clean 26 Jul |
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

## 15. Readiness and opening drafts

| # | Decision | Status | File |
|---|---|---|---|
| 15.1 | A readiness board that catches a silently dead pipeline before it costs rank | LIVE | `app/status/page.jsx`. Every job judged against its own schedule, every table checked for rows it should hold, each failure stating the exact fix |
| 15.2 | Three GW1 draft variants, built and compared on the same readouts | LIVE | `lib/variants.mjs`, 7 tests. Template, Balanced and Differential from one normalised ownership weight; saved as drafts from the Drafts tab |
| 15.3 | Variant alignment is reported, never targeted | LIVE | `lib/variants.mjs`. What alignment actually wins needs manager pick data that arrives with the season, so no target is invented |

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
| 12.25 | An in-app Analyst with spend caps, cost display and memory tables | The payload export delivers most of the value at no running cost and no per-call spend. Reviewed 26 Jul and dropped |
| 12.26 | Instructional captions that explain FPL concepts | Sort captions state what a metric is evidence of, in one clause, with no teaching tone. A colour never needs a sentence: its meaning goes in the header |
| 12.24 | Team strength ratings fitted on prior seasons | Tested out of sample and 2.4% worse than a flat league mean. Prior-season strength does not transfer because squads change. Cut under 9.10 |
| 12.23 | Calling a sample of a few hundred managers "the top 10k" | The scope is named `top10k_proxy` deliberately. A sample is not a census and the naming must never imply otherwise |
| 12.22 | Reallocating corner or free-kick duty | Neither leaves a trace in any ingested source, so there is no hierarchy to walk. Penalties are reallocated because missed penalties are recorded |

---

## 13. Change log for this document

| Date | Change |
|---|---|
| 25 Jul 2026 | Created. Sections 1 to 11 extracted from the conversation, latest version of each decision only |
| 26 Jul 2026 | Dead buttons fixed: buildPayload and bestXI were called but never imported, so Best XI and Copy payload threw on click. A new guard test fails the suite whenever any client component calls an identifier it never imported or defined; it immediately caught a second latent crash (setProfileP surviving the drawer deletion). Second button added: FILL AROUND PICKS keeps everything picked and builds the best remaining squad around it. Locked players show a pink ring and LOCK tag on the pitch. Candidate rows untangled back to tag, price, score |
| 26 Jul 2026 | Final sweep: Squad crash fixed (core.teamById, not core.teams), TEMPLATE tags deleted, feedback panel cut to numbers and bars, player page prose cut, RUN renamed DIFFICULTY, run totals are plain numbers, migration 020 rewritten against tables that exist (kickoff_utc on history, no fixtures_archive). Best XI solver added: maximises fielded-eleven xP over a chosen 1 to 8 GW horizon, cheapest legal bench, locks seated always, budget and club limits enforced by test |
| 26 Jul 2026 | Batch 3 live: as_of on history (backfilled from kickoff), daily player_snapshots, leakage guard in tests. The roadmap is complete; what remains needs real gameweeks |
| 26 Jul 2026 | Night corrections: X£ input fixed to last season's points per Louis's definition, the Analyst removed entirely at his instruction, engine shrinkage split with an interim S=6 in response to the competitor compression finding, type floor raised to 13 |
| 26 Jul 2026 | Corrective pass: X£ rebuilt as the rank map, Batch 1 reallocation and reconciliation live, Analysis split from model evidence, the Analyst built at Louis's instruction superseding 12.25, blanks and doubles detected, dead code deleted |
| 26 Jul 2026 | Guided mode removed at Louis's instruction, superseding 6.8 to 6.14. Per-gameweek xP added to the scorer and surfaced on every player row. Position became a filter rather than a gate. Quick-look drawer deleted |
| 26 Jul 2026 | xP made the permanent label at Louis's instruction; all provisional wording removed from every screen and the four tests enforcing the old rule replaced. Builder crash fixed: a handler was referenced without being defined, and a guard now catches that class |
| 26 Jul 2026 | Final end-to-end check: live team connected to the Squad page, provenance corrected to state real engine coverage, draft load now reports dropped picks. Section 19 records what was traced |
| 26 Jul 2026 | Reconciled against the original brief: X£ built, insights surface built, fixture swings now name players. Section 18 records what was considered and not acted on |
| 26 Jul 2026 | Second review actioned: engine minutes parameters fitted (k_start 4 to 1, k_survive 4 to 32, early_sub_share 0.12 to 0.171, p_start_ceiling 0.97 to 1.0), rho status corrected to FITTED_AND_REJECTED, README session order and dates fixed, section 17 added so settled questions stop recurring |
| 26 Jul 2026 | Review of two older sessions actioned: CI added, minutes constants fitted (blend 8 to 1, P(60+) 0.86 to 0.548), rotation split moved to the league median, payload export built, Players copy stripped, docs corrected to $17 and OpenRouter |
| 26 Jul 2026 | Readiness board built. Three GW1 draft variants built from a normalised ownership weight, generated straight into Drafts |
| 26 Jul 2026 | Walk-forward harness extracted as a shared module (9.3 live). Team strength ratings fitted, tested out of sample, and CUT for failing the baseline gate by 2.4 per cent |
| 26 Jul 2026 | Archive job now records both sides of every fixture and the scoreline (migration 016). Dixon-Coles rho fitted on 1900 matches and rejected on evidence, 9.4 complete. Consistency pass run: RMSE relabelled, everything else clean |
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

## 22. Corrections to the corrective pass, 26 Jul 2026 night

| # | Decision | Status | File |
|---|---|---|---|
| 22.1 | **X£ ranks last season's total points against this season's price ladder.** Louis's definition, confirmed against the teardown chat where the sanity table was built on 239/179/117/92 season points. The rank-map mechanics stand; the input was wrong. Source is the archive, not players.total_points, which mutates into this season's total at GW1 | LIVE | `lib/projections.js` → `lastSeasonPoints`, all three call sites. **Amends 21.1** |
| 22.2 | **The in-app Analyst is removed.** Louis never asked for panels on pages; mounting them was invented. Route, component, migration and tests deleted; the guard is back to presser-only; Copy payload remains the accepted mechanism | LIVE | **Supersedes 21.5.** If migration-019 was already run, the two empty tables are harmless; `drop table ai_spend; drop table analyst_memory;` removes them |
| 22.3 | Engine shrinkage split from archive shrinkage. The engine's ep_mean already conditions on minutes and fixture, so applying the archive's fitted S=24 to it counted caution twice and compressed the top of the list, which is exactly where the competitor comparison showed us low (Haaland 5.8 against their 7.7, agreeing near the bottom). Engine S = 6, INTERIM, flagged for the Batch 3 backtest to confirm or kill | LIVE | `lib/solver/score.mjs`, `lib/projections.js`. A 38-ninety starter on a 7.4 engine number now reads 6.94, was 6.1; a 3-ninety player stays pulled down |
| 22.4 | The type floor rises to 13px, sixty-eight sub-13 instances raised, and the design-system test enforces 13 from now on | LIVE | 16 files plus `tests/design-system.test.mjs` |

---

## 21. The corrective pass, 26 Jul 2026 late

Louis's instruction, verbatim intent: fix everything, implement everything promised, remove everything unasked for.

| # | Decision | Status | File |
|---|---|---|---|
| 21.1 | **X£ is the rank map.** fair(p) = the real price at his output rank on the real price ladder. The league-rate version was xP divided by a constant, a duplicate column, and is deleted | LIVE | `lib/xprice.mjs`, tests enforce the roadmap's 13-row sanity table. Players column shows the signed gap; "No data" for unscoreable players, never a number |
| 21.2 | Reallocation live on the engine path: an absent player's goal and assist share transfers within the position group, penalty duty passes down, club total conserved | LIVE | `jobs/projections_run.mjs` wiring `lib/engine/role_reallocation.mjs`, which previously had zero callers |
| 21.3 | Fallback reconciliation: club-position group rate totals conserved when a member is out, uplift capped at 1.35, cap stated not hidden | LIVE | `lib/solver/score.mjs`, `tests/reconciliation.test.mjs` |
| 21.4 | Analysis holds football evidence only: position returns, value bands, promoted clubs. Nine diagnostic sections moved to Status under Model Evidence. The strategy-study promissory stub is dropped until the data exists | LIVE | `app/analysis/AnalysisClient.jsx`, `components/ModelEvidence.jsx`, `app/status/page.jsx` |
| 21.5 | **The in-app Analyst is built.** Louis's instruction supersedes exclusion 12.25. Server route holds the key; ledger-backed monthly cap (default $5) checked before any tokens are bought, fails closed; cost shown per call and per month; eight-rule prompt answers only from the payload | LIVE | `app/api/analyst/route.js`, `components/AskAnalyst.jsx` on Builder and Squad, `supabase/migration-019.sql`, `tests/analyst.test.mjs` |
| 21.6 | Blank and double gameweeks detected exactly from the fixture list and shown in the chip planner | LIVE | `lib/data.js` → `blanksAndDoubles`, `components/TeamAndChips.jsx` |
| 21.7 | Deleted: `lib/harness.mjs` (zero callers), the `team_covariances` write (read by nothing), two promissory copy lines | LIVE | grep-verified clean |

---

## 20. Guided mode removed, xP per fixture everywhere

Louis, 26 Jul 2026. Supersedes decisions 6.8 to 6.14, which specified the guided flow in detail.

| # | Decision | Status | File |
|---|---|---|---|
| 20.1 | **Guided mode is removed.** The Builder has two modes, Build and Drafts | LIVE | `app/builder/BuilderClient.jsx`. Step map, plan steps, the six strategic decisions, the anchor effect and the plan state all deleted. **Supersedes 6.8 to 6.14** |
| 20.2 | Position is a filter, not a gate. The Builder searches the whole pool and narrows by position pills | LIVE | `app/builder/BuilderClient.jsx` → `Candidates`. Choosing a slot before knowing who is available is the wrong order |
| 20.3 | Clicking a player anywhere opens his full page immediately. No quick-look drawer, no expand icon | LIVE | `app/players/page.jsx`. The `Profile` drawer is deleted, not hidden |
| 20.4 | Every player row shows his next fixture and the xP for **that fixture**, not a season figure | LIVE | `components/FixtureXP.jsx` → `NextFixtureXP`, used on Players, Squad and the Builder candidates |
| 20.5 | xP is available per gameweek, not one number reused | LIVE | `lib/solver/score.mjs` → `scoreForGw`. Uses the engine's own per-gameweek series where it exists, otherwise recomputes against that gameweek's goal environment. **Returns null for a gameweek it cannot score rather than repeating another gameweek's number** |
| 20.6 | A fixture run shows five or six fixtures each with its own xP, plus the total | LIVE | `components/FixtureXP.jsx` → `FixtureRun`, on player pages |
| 20.7 | Sorting by xP is available on Players and in the Builder, and is the default | LIVE | `xP NEXT` and `xP NEXT 5` on both, plus value, ownership, price and name |

---

## 19. Final end-to-end check

Traced the real behaviour rather than checking that files exist. Three genuine faults, all fixed.

| # | Finding | Fix |
|---|---|---|
| 19.1 | **Team ID connect wrote to `my_squad`; the Squad page read `gw_picks`.** The two never met, so turning on the live team populated a table nothing displayed | `app/squad/SquadClient.jsx` now reads `my_squad`, handling the official API's `multiplier` and `position` fields for bench and armband. Order of preference: submitted picks, then live team, then plan-of-record draft |
| 19.2 | **Provenance overclaimed.** The app said "Projections from the simulation engine" whenever the engine covered even one player, while the rest of the list was interim scoring shrunk toward the position mean, so the two halves have different spread | `provenanceLine` now states the real split and what the remainder is. Moved to `lib/solver/score.mjs` so the label and its provenance cannot drift apart, and covered by a test that fails if a partial list describes itself as an engine list |
| 19.3 | **Loading a draft silently dropped players who had left the league**, returning a short squad with no explanation | The builder now says how many were dropped and why |

Verified sound, not assumed:

- **No minutes double-count.** The simulation samples minutes inside `layer4_sim.mjs`, so `ep_mean` already includes them, and `scoreOf` returns on the projection path before the expected-minutes multiplier is applied. Only the archive and Understat paths are scaled.
- **DEFCON is fully wired**, not merely present in config. Points value, the 10 CBIT threshold for defenders, 12 CBIRT for midfielders and forwards, and the one-per-match cap all read from `config/rules-2026-27.json` and are applied in `lib/engine/points.mjs` and counted per simulated match in `lib/engine/layer4_sim.mjs`, with goalkeepers correctly excluded.
- **One scorer serves every screen.** Dashboard, Squad, Builder, Players, player pages, News and the payload all call `loadModel`, so no two surfaces can disagree.
- **Draft round trip preserves** shape, starting eleven, captain and vice.

---

## 18. Reconciled against the original brief

Checked the whole product against the original vision document. Three things it specified were genuinely
absent. Everything else was either present, superseded by something better, or explicitly a "maybe".

| # | Decision | Status | File |
|---|---|---|---|
| 18.1 | X£: what a player should cost, shown beside his real price | LIVE | `lib/xprice.mjs`, 10 tests. **One league-wide rate**, so a defender is compared directly against a forward. Corrected from a per-position rate on 26 Jul after Louis challenged it: measured over three seasons a defender out-scores a forward at every price point (£5: 1.78 against 1.01), and a per-position index reports both as fairly priced, hiding the decision. Points per million by position sit within 20% of each other, so one rate does not collapse the list onto one position. The per-position figure is kept as `withinPosition` for filling a specific slot. Supplementary only, never replacing real price, per EXCLUSIONS 12.4 |
| 18.2 | X£ is a read on mispricing, not a price-change prediction | LIVE | Stated in the module. Price movement is driven by transfers, which this does not model |
| 18.3 | A surface for things worth noticing, with the numbers behind each one | LIVE | `lib/insights.mjs`, 7 tests, on the News page. Flagged-but-owned, premiums without penalty duty, mispricing both ways, heavily-owned players below their position midpoint |
| 18.4 | Fixture swings name the players to own, not just the clubs | LIVE | `lib/insights.mjs` → `swingTargets`, on the News page |
| 18.5 | Insights live on News, not a seventh page | LIVE | Six pages are locked. News is where "what is happening that you should know" belongs |
| 18.6 | No insight is generated prose | LIVE | Every observation carries the figures that produced it and can be disagreed with |

Considered and not acted on, because the current build already achieves the underlying goal:
the percentage bars the brief sketched are the 0-to-100 scoring panel, which is more precise; the
suggested left-hand toolbar is the right-hand rail, locked later; the in-app trained AI is the payload
export, per EXCLUSIONS 12.25; the same-day deadline is superseded by `config/schedule.js`.

---

## 17. Raised by review and deliberately not done

Recorded so it stops being raised. Each was evaluated against the real build, not against an older plan.

| # | Raised | Decision | Why |
|---|---|---|---|
| 17.1 | Complete the calibration harness and ablation ladder | **Already done** | `lib/harness.mjs`, `jobs/baseline_gate.mjs`. Ran on live data. One layer was cut for failing: team strength ratings, 2.4% worse than a flat mean |
| 17.2 | Fit Dixon-Coles rho | **Done, and rejected on evidence** | Fitted on 1,900 matches. Observed 272 goalless draws against 230 expected but only 200 one-alls against 255. The correction moves both cells together, so no single rho fits. Status is FITTED_AND_REJECTED, not INTERIM |
| 17.3 | Include fatigue in the minutes model | **Not built, and correctly so** | `wc_prior` is null and while null **no fatigue effect is applied at all**. The alternative is guessing a penalty, which EXCLUSIONS forbids. The hook exists: set the value and it activates with no code change |
| 17.4 | Build the in-app Analyst: Ask button, memory tables, spend cap, per-call cost | **Not built** | The payload export delivers the decision context at zero running cost and zero spend risk. The rest is a large build to replicate what a Claude project already does. EXCLUSIONS 12.25 |
| 17.5 | `w_minutes_share` still INTERIM | **Cannot be fitted yet, and has no effect until it can** | It weights in-season minutes share, which does not exist before GW1. Pre-season the term is skipped entirely because minutes share is null. It becomes fittable from live data the moment matches are played |
| 17.6 | Strategy study output for the Guided Builder | **The Builder does not depend on it** | Shape cards use points-per-start fitted on nine seasons plus live market value. Both real. The study would add ownership and winner behaviour, which needs manager pick data that `rival-pull` collects automatically from GW1 |
| 17.7 | Delete stale files such as `jobs/projection_run.mjs` | **Not doing it** | Guards are reachability-aware and workflow-aware, so dead files are ignored by every check. Deleting them costs manual clicks and buys nothing |

---

## 16. Budget

| # | Decision | Status |
|---|---|---|
| 16.1 | AI spend cap is **$17 a month**, superseding the earlier $14 | LIVE, corrected across README, STATUS and four docs on 26 Jul |
| 16.2 | Models are called through OpenRouter, not the Anthropic API directly | LIVE, `jobs/presser_pull.mjs` |

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
