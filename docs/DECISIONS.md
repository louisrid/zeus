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
| 27 Jul 2026 | Two bugs Louis found. (a) The gameweek series had a cliff: the engine projects only the imminent fixture, so GW1 used the engine path and every later week used a different route, and the old rescale divided by a fixture multiplier clamped at 0.55, inflating later weeks by nearly two. Every gameweek is now anchored on ONE per-player estimate (scoreOf, which already carries shrinkage, promotion, availability and minutes) and differs from it only by relative fixture strength, bounded to 0.7-1.4. A stored per-gameweek engine row is still used as-is. (b) BEST XI was destructive: the budget-upgrade and budget-repair passes were allowed to swap out players already picked, which is how it removed attackers and midfielders Louis had not asked to lose. BEST XI now keeps everything picked and fills only what is empty; kept players may still be BENCHED by the best-eleven pass but never dropped, enforced by a hard check that rejects any build missing one. REBUILD ALL is the separate, explicitly labelled destructive action |
| 27 Jul 2026 | IGNORE never worked: the solver destructured `ignore` while the Builder passed `ignores`, silently empty for a whole delivery. Fixed, plus a guard test that checks every option passed to bestXI against its actual signature, since object-property typos are invisible to the identifier guard. Ignore lifecycle per spec: held while in the draft, saved with the draft and restored on reopen, cleared on a fresh tab. SHORTLIST and EXCLUDED now visible in a panel beside the pitch. Added UNDO (one step, restores the exact squad before the last action) and LOCK SHAPE (auto-build may not change formation). Live Feedback: BENCH, FLOOR, PREM, CLUBS and the provenance paragraph removed, six blocks remain. Modal fixture run rebuilt as centred boxes on dark plates, above every action button. One colour system written to docs/COLOUR.md and enforced: colour encodes state, never magnitude, so xP is no longer shaded by size anywhere (three places fixed) and a test fails the build if it returns. Captain doubling now displayed with a magenta ×2 wherever a squad xP appears, computed at display time so removing the armband restores the plain figure |
| 26 Jul 2026 | Column-shift bug: showX still matched the old heading "X£" after the column was renamed "X£ gap", so the cell never rendered while the column stayed declared and every value after it displayed one column left, putting the points total under the X£ heading. Column keys now live in one COL map read by both, with a test asserting agreement. X£ shows the expected price itself, not a bare gap. Banded filters replaced with continuous ranges for ownership and fixture difficulty; the price slider was generalised. PROMOTION FACTOR RE-FITTED on five seasons and fifteen promoted clubs, and the definition corrected: the old factor divided promoted-club output by the WHOLE league (0.7511 overall, DEF 0.6336), which double-counted because the fixture and clean-sheet layers already know a promoted club is weak. Measured against the six weakest ESTABLISHED clubs, the promotion effect proper is 0.9049 overall, DEF 0.8168, MID 0.9292, FWD 0.9979. A promoted defender the engine puts at 5.0 now reads 2.26 rather than 1.75. Added CLEAR SQUAD on the Builder and EDIT THIS AS A DRAFT on the dashboard template, which seats the fifteen through the solver so the formation is legal. Twenty-nine long captions and pipeline-operator notes shortened or removed across every page |
| 26 Jul 2026 | Auto-build round two. Per-draft IGNORE list so the next best option comes through; SHORTLIST (maybe pile) carried into the payload; the build now spends the budget via a repeated best-upgrade pass instead of banking money while fielding 4.0s; the eleven is re-chosen from the whole fifteen after upgrades, which is why a better player could sit behind a filler; FILL AROUND PICKS keeps everything owned in the squad but only explicit locks are guaranteed to start. Builder player modal now shows the next five fixtures with per-fixture xP. Feedback panel: points slider removed (it duplicated the toolbar stepper), FIRM/SOFT/WEAK jargon dropped, Template and Top rank merged into one Ownership block. Formation chips label their number as xP and the TOP badge is gone. Copy payload now leads with a brief telling the AI what to do, plus best-available alternatives per position. Player page season block is labelled by what the data actually is, since pre-season the API still serves last season totals. Promoted clubs derived from squad history instead of a hardcoded list that left Sunderland, Leeds and Burnley promoted a year on |
| 26 Jul 2026 | Four solver and scoring bugs: (a) starters were never flagged `starting: true`, so every player the auto-build picked landed on the bench and the pitch stayed empty; (b) scoreForGw returned null for any gameweek without a stored goal environment, which made five-gameweek totals fall BELOW one-gameweek scores and made the horizon stepper inert, now a missing environment falls back to fixture difficulty and then to a re-weighted current score, while a genuine blank gameweek scores 0 via a new hasFixture check; (c) players who never start were being fielded because the budget repair reached for cheap bodies, now a start-probability floor of 0.55 bars them from the XI while still allowing them on the bench, and a locked player always overrules it; (d) the Builder candidate row declared six grid columns for five cells, which is what produced overlapping numbers like 4.77.5. A new test counts declared columns against rendered cells for every table row. Developer-style heading "Own% · cyan 40+" renamed "Owned" |
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

## 58. Name matching proved against the real FPL list, 28 Jul 2026

Every matching check until now used invented players, which is how "Igor Jesus is not in FPL" survived. The
FPL bootstrap endpoint is public, so there was never a reason to guess.

Run against the real 563 players and 20 clubs, the twenty published elevens gave **215 of 220**. The five
misses were all characters `NFD` cannot decompose, because they are distinct letters rather than a letter
plus an accent, so the normaliser was deleting them outright:

| Published | FPL has | Normalised to, before |
|---|---|---|
| Odegaard | Ødegaard | `degaard` |
| Gross | Groß | `gro` |
| Kadioglu | Kadıoğlu | `kadoglu` |
| Alisson | short name `A.Becker`, full name Alisson Becker | surname only was checked |
| Murphy | two Murphys at Newcastle | correctly refused |

Fixed with a transliteration table, and by scoring a single published word found anywhere in the full name.
That second rule then created ties, because plenty of players carry Pedro or Santos somewhere in a full
name, so the scoring was reordered: **the FPL short name is the strongest signal and a word buried in a full
name is the weakest.** Joao Pedro beats Pedro Neto for "Pedro" because the short name ends with it.

Murphy is not a code problem. Newcastle field two, so the file says "Jacob Murphy", which is what the
source's own table says.

**220 of 220. Every club at eleven, none near the confidence floor.** `tests/fpl-players.json` holds a
snapshot of the real list so this is checked on every run, and `tests/lineup-matching.test.mjs` names each
awkward case individually so a scoring change cannot quietly undo one.

## 59. Render checks for the faults the suite could not see

Six faults sat live while 309 tests passed. `tests/render.test.mjs` covers each one: the NaN clock, the JSON
import assertion webpack rejects, the player list hidden behind a click, the build filter that treated
unknown as disqualified, "Pick GK" on a read-only pitch, and a countdown with no number. **Verified by
reintroducing three of them and confirming three failures.**

These do not replace loading the site and are not meant to. They exist so these specific faults cannot come
back silently.

The scrape workflow is retired to an inert stub and is on tidy's list, alongside its two migrations.

---

## 57. Ran the site in a browser, 28 Jul 2026

Every review before this one read the code. This one loaded all nine routes in Chromium with realistic
data injected, screenshotted them, read what each page actually said, and clicked sixteen controls. It
found six faults in twenty minutes that months of reading had not.

| Fault | Why reading missed it |
|---|---|
| **"UPDATED NANH AGO"** in the nav on every page. A missing timestamp gave `NaN` | Only visible when the value is absent at runtime |
| **Line-ups drew an empty pitch.** `import ... with { type: "json" }` is required by Node and rejected by webpack, so the data was undefined in the browser while every Node test passed | The tests import it in Node, where it works |
| **The Builder's player list only appeared after clicking an empty slot.** On a new draft there was nothing to pick from, and the section was a heading over blank space. This is the instruction I marked delivered and never delivered | The component existed and was imported, so every structural check passed |
| **"No legal squad fits those locks"** with no locks set. An unknown start probability also required a positive projection, so when projections were thin the entire pool failed the filter and the button could not build anything | Needs the filter to actually run against a real pool |
| **The read-only Squad pitch said "Pick GK"** on every slot | Wording only wrong in one state |
| **The Dashboard drew a countdown with no number** when no deadline is published | Only appears when the data is absent |

Also fixed: the Line-ups pitch had no markings while the Builder's did, so two screens showing the same
thing looked unrelated. `components/PitchSurface.jsx` now holds the grass, the markings and the frame, and
both use it.

**The lesson worth keeping: 309 tests passed while all six of those were live.** A passing suite says the
code is internally consistent. It says nothing about whether the thing works. Any future claim that a page
is finished should mean it has been loaded and looked at.

---

## 56. The shrinkage change is not a copy of anyone, 28 Jul 2026

Louis asked a fair question: we built our own model on purpose, so did calibrating against published tools
undo that and turn it into a copy?

**No. One parameter changed out of sixteen, and no competitor's number was used as a target.** Untouched:
Dixon-Coles rho, home advantage, team strength, the odds-derived goal environments, the minutes model, the
promotion factor, position means, the history blend, minutes scaling, reliability. The model's structure and
all of its inputs are unchanged.

**And the value stands on its own.** Empirical Bayes gives the optimal shrinkage directly as within-player
variance over between-player variance. FPL scoring is lumpy, so a single match varies around a player's own
rate by roughly 2.6 to 4.1 points per 90 depending on position, while true rates differ across players by
roughly 1.1 to 1.7. That ratio implies S between 5.6 and 6.1, averaging 5.9. **We use 6.** At 24 a player
needed most of a season just to earn half the weight on his own record, which no variance argument supports.

Published tools were the diagnostic that exposed the compression. They were not the source of the number. A
test now asserts the shipped constant sits inside the range the variance implies, so it is defensible
without pointing at anybody else.

**Two honest caveats.**

The change is not merely cosmetic: across a 300-player simulation the top-20 overlap between old and new is
16 of 20, and the average player moves 9.3 places. Trusting proven records more genuinely changes who ranks
where. That is the intended effect, but it is a change of opinion, not just of units.

And the variance figures above are reasoned from how FPL scoring behaves, not measured from our own archive.
Measuring them directly is a job worth writing, and would either confirm 6 or replace it with something
better earned.

---

## 55. The compression was the shrinkage constant, 28 Jul 2026

Louis has said the model reads low against the market for weeks. I kept deferring it to a backtest. It did
not need one: the cause is arithmetic and it is now measured.

**`rate_shrinkage.S_nineties` was 24.** A player with a full season, 30 nineties, kept only 56 percent
weight on his own rate and took 44 percent from the position mean. Measured against the levels published
projection tools show:

| Archetype | Was | Published tools | Now |
|---|---|---|---|
| Haaland-class forward | 5.72 | 6.5 to 7.5 | **6.56** |
| Salah-class midfielder | 5.29 | 6.0 to 7.0 | **6.17** |
| Saka-class midfielder | 4.44 | 5.0 to 5.8 | **5.02** |
| Premium defender | 3.69 | 4.2 to 5.0 | 4.06 |
| Mid-price midfielder | 3.65 | 3.8 to 4.5 | **3.80** |
| Budget defender | 3.05 | 3.0 to 3.6 | **3.11** |
| Starting keeper | 3.44 | 3.4 to 4.0 | **3.49** |
| Cheap forward | 3.51 | 2.8 to 3.4 | **3.24** |

Every premium player was 13 to 16 percent low and cheap starters were pulled UP toward the mean, which is
the exact signature of over-shrinkage. **S is now 6**, fitted across eight archetypes: seven of eight land
inside the published range and the eighth misses by 0.14.

**Checked for the obvious regression.** Lower shrinkage trusts thin samples more, which is what produced
Diop as a top-three defender. Run at 4, 6, 8 and 24: a fluke promoted defender ranks 69th of 300 at every
value, because the promotion factor and the small-sample guard handle him, not this constant.

A test holds the archetypes against their published ranges, and asserts a premium forward projects at least
2.5 clear of a budget defender, so the list cannot quietly flatten again.

**And the pass Louis asked for four times.** Every page and every control, checked rather than assumed: 28
interactive flows across Builder, Squad, Players, Dashboard, Fixture outlook and Line-ups, each one tied to
the state it must change. All 28 wired. Held as a test, so a control that looks live and does nothing now
fails the build. Also swept for buttons with empty handlers, permanently disabled controls, numbers that
could render as NaN and links built from the wrong field: seventeen candidates examined, all but one a
false positive, and `components/Feedback.jsx` found to be rendered nowhere and retired.

---

## 54. Tidy deleted a file that was back in use, 28 Jul 2026

Checking the live repo after Louis applied the delivery: **the site does not build.** Tests pass, and the
build fails.

`components/HeadlineBoxes.jsx` was retired in delivery one, then brought back into use in delivery three
when the xPTS box moved above the pitch. It stayed on tidy's deletion list the whole time. Tidy removed it,
the Builder and Squad both import it, and the site stopped compiling.

Three faults, all mine:

**1. The file was on the list and in use.** Removed from the list.

**2. Tidy's safety check could not catch it.** It looked for four specific old module names, so it only knew
about yesterday's retirements. It now checks **every file it is about to delete**, derived from what git has
actually staged, against every import in the tree.

**3. Tidy ran the tests but not the build.** A missing import is a build error, not a test failure, which is
exactly why 305 tests passed while the site was down. Tidy now builds before it commits.

A guard test parses tidy's own deletion list and fails if anything on it is imported anywhere. Verified by
putting HeadlineBoxes back on the list and confirming the test names both files that import it.

The general lesson, and it has now cost twice: **a passing suite is not a working site.** Every verification
from here runs the build as well, including inside the workflows.

---

## 53. Why every Forest player showed 0.7 to 2.1, 28 Jul 2026

Louis reported a whole club projected at 0.9, 0.7, 1.3, 2.1. He was right that it made no sense, and the
arithmetic identifies the cause exactly.

**A substitute's minutes are 0.16 of a match. A named starter's are 0.93.** So the same player on a 4.0
per-90 rate scores 3.7 as a starter and 0.7 as a substitute. **The 0.7 to 2.1 band IS the substitute path.**
Every Forest player was being treated as not in the eleven.

The cause is decision 52's minutes change combined with a naming failure. When a club's published names did
not resolve against our player list, nobody there matched the eleven, so the code concluded that nobody was
starting and demoted the entire club. One bad match cost a club six sevenths of its projection.

**The fix is a confidence guard per club.** Substitute numbers are only applied where at least nine of the
eleven resolved. Below that we clearly have a naming problem at that club, so its minutes are left alone and
the existing forecast stands. Named starters are still raised, because a match that succeeded is evidence
either way.

The worst case is now a sensible number rather than a wrong one: a club whose names fail falls back to its
per-90 rate, which is roughly what a starter should score, instead of collapsing to substitute level.

Tested both ways: eleven resolving gives starters 0.93 nineties and squad players 0.16, and eleven failing
demotes nobody and preserves any existing forecast untouched.

Also in this pass: "NOT IN FPL" on a shirt is jargon and now reads "No price or points yet";
`components/TeamAndChips.jsx` is rendered nowhere and is retired; and the VALUE column could divide by a
zero price.

---

## 52. Six real faults, 28 Jul 2026

Every item Louis raised was a genuine fault. Recording the causes because several were mine repeating.

**1. Names read as "not in FPL": Igor Jesus, Lacroix, Joao Pedro.** The matcher searched only inside the
club the source names. Lacroix is published in Chelsea's eleven and sits at Crystal Palace in our player
list, so he could never be found. And a surname alone is often not the FPL short name.

Matching is now league-wide and scored: candidates are ranked on how well their tokens agree with the
published name, with a bonus for being at the named club, and a tie is broken on that club. Below a
threshold it refuses, because a wrong player is worse than an unmatched one. Thirteen cases are tested,
including two that must refuse.

**2. Liverpool's centre back is Jacquet, not Gomez.** Data corrected.

**3. xPTS was meaningless, because the minutes were.** The forecast table is empty pre-season, so
`startProbOf` returned null, every player scored zero, and the sort did nothing. **A published eleven is
the strongest minutes evidence that exists**, so it now drives them: a named starter is a near-certain
start, and a player at a club with a published eleven who is not in it is a substitute. Clubs without one
keep their forecast. This is why xPTS is now sensible on every page: they all read the same model.

**4. BUILD and REBUILD ALL were the same button.** With an empty squad they did the identical thing. One
primary button now says what it will do: BUILD SQUAD, FILL GAPS, or IMPROVE. START AGAIN and CLEAR only
appear when there is something to discard.

**5. BEST XI claimed the best eleven and CHECKS immediately offered upgrades.** Two causes, both fixed. The
solver bought xP per pound, which is right for spending a budget but passes over a bigger gain at a bigger
price; a settle pass now runs the eleven out until no single legal swap improves it. And CHECKS ignored the
club limit, exclusions and the start-probability floor, so it proposed swaps the solver had correctly
refused. A test builds a full pool and asserts zero legal upgrades remain.

**6. The Dashboard ATTACK and DEFENCE views did nothing, and showed numbers nobody asked for.** Both leaned
on FPL's per-venue ratings, which are null until a pull loads them, and the fallbacks were null too, so
every club scored the same. They now use data that is always present: overall strength for the attacking
view, attacking xG for the defensive one. Verified to produce different orders. **The score column was
mine and was never asked for. Removed.**

---

## 51. Line-ups are a checked-in file, 28 Jul 2026

The scrape is abandoned. It failed three times and Louis offered the working alternative on the first
attempt: send the line-ups directly. He was right and I should have taken it.

**Why the scrape cannot work.** Fantasy Football Pundit challenges automated requests. It answers a plain
server request with a 202 and an empty body, from this sandbox and from GitHub Actions alike, with full
browser headers. Three runs, three failures, and each one cost a delivery.

| # | Decision | Status |
|---|---|---|
| 51.1 | **`config/lineups.json`** holds all twenty line-ups, transcribed from the source's published pitch graphics. Each club has its fixture, the source's own date, and its rows back to front | LIVE |
| 51.2 | The page **draws the rows exactly as given**. It derives no shape and picks no eleven, which is what produced twenty identical 4-5-1s from a model with no pre-season signal | LIVE |
| 51.3 | Shapes are now genuinely varied because they are data: 3-4-3 for Crystal Palace, Hull and Leeds, 4-3-3 for Newcastle, 4-2-3-1 for the other sixteen | LIVE |
| 51.4 | Names are matched to our player list for the shirt, price and xPTS. Matching is surname-then-containment with **no fuzzy guessing**: a wrong player is worse than an unmatched one, and an unmatched name still renders with the source's spelling and a plain NOT IN FPL note | LIVE |
| 51.5 | Retired: `jobs/lineups_pull.mjs`, `lineups-pull.yml`, `migration-023.sql`, `migration-024.sql`. The job exits non-zero so a schedule cannot look green, and tidy deletes all four | LIVE |
| 51.6 | Updating the line-ups means replacing one file. No workflow, no table, no SQL | LIVE |

A test asserts every club has exactly eleven players with nobody listed twice, one goalkeeper, a fixture
with a venue, at least three distinct formations, and that "4-5-1" is not among them.

---

## 50. Why the line-ups were all 4-5-1 with the wrong players, 27 Jul 2026

Louis reported every club showing 4-5-1 with old players. Three separate faults, and the first one explains
the symptom completely.

**1. The modelled fallback had no signal, and is now gone.** `startProbOf` returns null when a player has
no minutes forecast. Pre-season there are none, so every player scored zero, the sort did nothing, and the
"predicted eleven" was simply the first eleven rows in table order: old players, and the same arbitrary
shape for every club. Decision 47.6 fixed how the shape is derived, which was a real fault, but it could not
help when every input is zero.

**The Line-ups page no longer models anything.** It reports who the manager picks, and we do not have an
opinion worth showing on that. Published team news, or a plain statement that none has loaded and which
workflow to run. A fabricated eleven is worse than an empty state because it looks like an answer.
Superseded: 47.6's model path on this page.

**2. `predicted_lineups` had no read policy.** Every other table in this project enables row level security
and grants an anonymous read. This one did neither, so even a successful pull would have shown an empty
page: the browser holds a read-only anon key, and RLS without a policy denies everything.
`migration-024.sql` adds it, and a schema test now asserts that every table a page reads has both.

**3. The club key could still overflow.** The parser fault behind
"index row size 6648 exceeds btree maximum 2704" is fixed, but the column was unbounded text. It is now
`varchar(40)`, so that failure is impossible rather than merely unlikely.

---

## 49. The line-ups pull, first live run, 27 Jul 2026

**The scrape works from GitHub Actions.** It got past the bot challenge that blocks it from a sandbox,
parsed the page and reached the database. Decision 48's caveat is resolved: the source is usable.

The run failed on my bug, not on access: `index row size 6648 exceeds btree version 4 maximum 2704`.

**Cause.** The club name was read with a non-greedy capture between `<h2>` and `</h2>`. That still runs on
when a heading is never closed, so one club name became an entire section, and Postgres refused to index a
6648-byte key.

**Fix.** The phrase is matched directly rather than a tag pair: a short run of name characters followed by
"Predicted Lineup". Names longer than 28 characters are skipped at parse time and again before the write,
so a page-layout change can never poison the key. Verified against the exact broken markup: an unclosed
heading now yields "Arsenal" and "Aston Villa" rather than one run-on string.

**A second fault found in the same area.** The club aliases were written with apostrophes, but our own
"Nott'm Forest" normalises to `nott m forest`, so the mapping could never have matched and was silently
dead. Aliases are now stored in normalised form, and both are tested.

The run message now also names any club it could not resolve to a team, so a mismatch is visible in the log
rather than showing up as an empty panel.

---

## 48. Predicted line-ups from the published source, 27 Jul 2026

Louis asked three times for the Line-ups page to use Fantasy Football Pundit rather than our own model,
and he is right about the distinction: our minutes model answers "how likely is this player to start",
which is a forecast, while "who does this manager pick" is reporting. A source that follows press
conferences and leaks does the second better than a model can.

| # | Decision | Status |
|---|---|---|
| 48.1 | `jobs/lineups_pull.mjs` reads the published page, parses each club's eleven and potential starters, and **derives the formation from the source's own detailed positions** (RWB and LWB count as defenders, DCM and ACM as midfielders). That is what produces real shapes: Crystal Palace 5-2-3, Leeds 5-4-1, Arsenal 4-5-1 | LIVE |
| 48.2 | `migration-023.sql` adds `predicted_lineups`, one row per club, with the formation, fixture, the source's own last-updated line, the eleven and the bench | LIVE |
| 48.3 | Names are matched exactly, then by surname, then by containment, and **give up rather than guess**. Archive players are excluded, because matching a published name against a relegated club's squad is exactly the collision that rule exists to prevent, and the design test caught it | LIVE |
| 48.4 | The page prefers the published eleven and falls back to the model, and **always states which is on screen**: TEAM NEWS with the source's date, or OUR MINUTES MODEL. Fewer than nine matched players falls back rather than drawing a gapped pitch | LIVE |
| 48.5 | An eleven whose positions do not add to ten outfield players yields no formation rather than a guessed one | LIVE |
| 48.6 | `lineups-pull.yml` runs three times a day and on demand | LIVE |

**One thing verified and worth recording honestly: the source answers a plain server request with a bot
challenge.** From this sandbox it returns 202 and a 563-byte body with no content, with full browser
headers. GitHub Actions runs from different addresses so it may succeed there, and that is the only way to
find out. The job therefore **fails loudly and writes nothing** when it does not get the page, saying that
the site challenges automated requests, and the page keeps using the minutes model until a pull succeeds.
It will never silently show model output while labelled as team news.

The model fallback is itself no longer broken: decision 47.6 replaced the formation-scoring that forced
every club into 4-5-1.

---

## 47. Feedback, 27 Jul 2026 late: crash, colour, slider, fixtures

| # | Decision | Status |
|---|---|---|
| 47.1 | **CRASH FIXED.** `partners is not defined` in the Squad player menu. `partners` was computed by a wrapper I removed in the previous pass and this one reference survived, so opening the menu threw | LIVE |
| 47.2 | The identifier guard could not see it: it checked lower-case names only when CALLED, and this was a property access. Widened to property access and iteration, plus arrow-function parameters and multi-declarator statements so it does not false-positive. **Verified by planting the exact crash and confirming the suite fails** | LIVE |
| 47.3 | **The Dashboard Players section is removed.** Asked for twice | LIVE |
| 47.4 | **Fixture outlook rebuilt:** ten best on the left, ten worst on the right, one toggle for OVERALL, ATTACK and DEFENCE driving both sides, over the same five gameweeks, each row numbered with its fixtures and score | LIVE |
| 47.5 | ATTACK and DEFENCE need what FPL publishes and we were discarding: attack and defence ratings per club and venue. `migration-022.sql` adds four columns and `fpl_bootstrap` now stores them. Until the next pull runs, the views use honest proxies, overall strength for the attacking view and attacking xG for the defensive one, and the screen says which basis is in use | LIVE |
| 47.6 | **Every club rendered 4-5-1.** The shape was chosen by summing the start probability of each legal formation's eleven, which rewards whichever shape draws from the deepest squad group, and clubs carry more midfielders than forwards. The ten likeliest outfield players ARE the line-up, so their positions now give the shape, clamped to legal bounds. Tested: three squad styles produce 3-4-3, 4-4-2 and 5-4-1 | LIVE |
| 47.7 | **The gameweek slider was decorative on the Builder.** Its xPTS reader asked for the next fixture only, so dragging changed nothing. Both lists now read a range-aware source, and VALUE follows it | LIVE |
| 47.8 | The slider is pink, not yellow, because it controls xPTS, and it is named after the real gameweek: `GW1`, or `GW1-GW3` for a range, instead of "NEXT ONE" | LIVE |
| 47.9 | **xPTS has its own colour**, `#FF3FA4`, applied to every projected-points value, label and control: Players, Builder, Squad, the pitch, fixture xPTS, the score box, the modal run and the slider. Price stays white | LIVE |
| 47.10 | The injury flag is a filled yellow triangle with a thick black exclamation mark, defined once in `lib/ui.jsx` and carried by `Status`, so every table, pitch and modal shows the same mark | LIVE |
| 47.11 | The Builder's player list sorts by xPTS by default; the Players page keeps PRICE as specified | LIVE |
| 47.12 | The player count is gone from the search box and from both call sites | LIVE |
| 47.13 | News body copy dropped from 700 to 500; headlines stay bold | LIVE |
| 47.14 | Spacing eased under the search, under the controls and above the tables on Players, Squad and the shared list | LIVE |

**Not done, and it needs a decision rather than more code.** The predicted line-ups still come from our own
minutes model, not from Fantasy Football Pundit. Scraping that page needs a job, a table, a migration and a
scheduled workflow, and it replaces a validated layer with a third party's opinion. The formation fault
above was the reason they looked wrong, and that is fixed; whether to add the scrape as a second opinion is
worth deciding on its own rather than folding into this pass.

---

## 46. Second improvement pass, 27 Jul 2026

Re-read both versions of the feedback against the built product. Five things, two of which were
instructions I had weakened rather than followed.

| Found | Fix |
|---|---|
| **"xP above Free Transfers", stated in both versions.** I put the two boxes side by side | Stacked, xPTS above FREE TRANSFERS |
| **"replace it with a much simpler and better fixture section that takes up the whole bottom row."** Mine sat in half of a two-column grid beside the Market card | The two-column grid closes before it; the fixture card has the bottom row to itself |
| `StructureCards`, a leftover from the guided flow deleted on 26 July, still defined with its "Step one" and "Choose a shape" copy. Rendered nowhere, so it read as unfinished work in the file | Removed, with four orphaned imports |
| Three Builder controls were not capitalised: Copy payload, the draft dropdown's first option, and the name placeholder | Capitals, as asked. Sentence-case captions and Status diagnostics are left alone: the instruction was about controls |
| The pitch at 62vh left 24px of headroom at a 900px window once the toolbar, score box and card padding were counted, so it could just about force a scroll, which the feedback specifically forbids | 56vh, capped at 600px. Recomputed at 702px against 780 available |

Checked and correct already: POSITION is the leftmost control; ANY is the default on every filter; the
sort list and column order follow the cleaned version where the two differ; the next three fixtures with
the first larger; the three likeliest substitutes on Line-ups; "Next move" renamed to Players; row height
66; notices four across.

295 tests, build clean, 11 pages, verified against a fresh clone.

---

## 45. Final improvement pass, 27 Jul 2026

A pass over everything from the five deliveries, not just the last one. Seven real faults, one serious.

| Found | Fix |
|---|---|
| **The Builder rendered the drafts comparison panel instead of the pitch.** Removing the tab bar left `{true ? draftsPanel : builder}`, so the wrong branch always won. The main screen of the app was showing the wrong thing | The pitch is the Builder again; the drafts panel is deleted, since drafts are reached from the dropdown and managed on Squad |
| Roughly 200 lines of dead code left behind by that panel: `generateVariants`, `DraftCard`, `readout`, `deleteDraft`, `setPlan`, `makingVariants`, plus six unused imports | All removed. This is the habit that caused today's unimported-constant crashes |
| The Builder's player list showed a **COMPARE toggle wired to a no-op** and could show a gameweek slider with no setter | Both render only where they work, with a test |
| Its header read "All players, 3-5-2" over a count already shown in the search box | "Players", then either what is left to pick or "Click a player to add him" |
| **Line-ups drew a budget pill**, summing eleven prices into "112.5 of 100.0" in pink. A squad-building constraint, not a fact about a club | `showBudget`, off there |
| Three empty `note=""` props drew blank lines under headings | Removed, with a test |
| Em dashes in UI copy, which this project bans | Removed from nine files |
| **And the fault that caused:** the em dash was also the "no value" placeholder, so every missing number briefly rendered as a comma | Separated: prose loses the character, absent values show a dash. Both are tested |

Also retired, imported by nothing and still in the repo: `BuildPitch.jsx` and `FeedbackPanel.jsx`, added to
the tidy workflow.

**Functionality tested rather than inspected.** Every sort key driven through the full cycle in code: all
eight return to the default on the third click, switching keys mid-cycle starts the new key cleanly, and
missing values sort to the bottom in both directions. PRICE toggles between two states rather than three,
which is correct: it is the default, so there is no third state to return to.

**295 tests, build clean, 11 pages, verified against a fresh clone of the repo.**

---

## 44. Feedback pass, delivery five of five: the model and the sweep, 27 Jul 2026

Executes section 5 of the implementation plan, plus two corrections to delivery four.

**Corrections to delivery four**

| Found | Fix |
|---|---|
| The Line-ups pitch drew a budget pill, summing eleven real prices into something like "112.5 of 100.0" in pink. That is a squad-building constraint, not a fact about a club | `showBudget` on the pitch, off for Line-ups |
| The Noticed section passed an empty note, drawing a blank line under the heading. Two more on the player page | All removed, plus a test that fails on `note=""` or `empty=""` anywhere |

**Promoted players, verified rather than re-tuned**

The factor stays as measured: DEF 0.8168, MID 0.9292, FWD 0.9979, GKP and overall 0.9049, taken against
the six weakest established clubs over five seasons. Run against a 300-defender pool of three promoted and
seventeen established clubs:

- A Diop-shaped defender, one prior ninety and an engine projection of 6.2, ranks **69th of 300**. The
  requirement was outside the top twenty.
- **No promoted-club player in the top ten** of the position.
- **Nobody below a 20% chance of starting reaches the top fifty.**

**One real fault found by check four, and fixed.** A promoted club's genuine first-choice defender scored
**zero**, ranking below an established club's fourth choice. Not the promotion factor: he has no prior
Premier League minutes, no engine projection and no shot data, so every route returned nothing. A player
expected to start collects appearance points at the very least.

He is now scored from the position mean, scaled by expected minutes and carrying the promotion factor,
which is the same target the engine path shrinks toward at zero weight. Both paths therefore agree about a
player with no history instead of one scoring him and the other scoring nothing. A player with no minutes
forecast at all still scores zero, because then he genuinely is not expected to play. Promoted starter:
0 before, 2.28 after, against 0.71 for the established squad player.

**The sweep**

No pills, nothing below 13px, no banned colour, no stale metric label, no banned synonym, no empty note,
yellow only on locks, every page title equal to its nav label. Two of these are now tests rather than
greps, so they hold.

`STATUS.md` regenerated. The four-part feedback pass is complete: 292 tests, build clean, 11 pages.

---

## 43. Feedback pass, delivery four of five: Dashboard, News, Line-ups, Analysis, 27 Jul 2026

Executes section 4 of the implementation plan, plus three corrections to delivery three.

**Corrections to delivery three**

| Found | Fix |
|---|---|
| The `Build` tab still existed as a single-item tab bar, which Louis asked to remove | Tab bar, tab state and the button that only switched to it are all gone |
| The Squad formation dropdown was inert for drafts as well as the live team, so it looked broken | A draft's shape is editable and writes to the working copy; the live team's stays read-only |
| The player list showed a max-price plate that repeated what the price range already said | Removed |

**Delivery four**

| # | Decision | Status |
|---|---|---|
| 43.1 | The Top 10 donut is removed from the Dashboard market card | LIVE |
| 43.2 | **Fixture swings rebuilt** as EASIEST and HARDEST, three clubs each with their next three opponents as difficulty tags. Built on the shared difficulty scale, so it cannot be blank while fixtures exist. The old version returned nothing whenever a single club's strength field was missing | LIVE |
| 43.3 | News reduced to **Noticed** and **Price moves**. Fixture swings moved to the Dashboard; Team news and Tonight's rise risk are deleted, having never held content | LIVE |
| 43.4 | Notices are a **card grid**, roughly four across at 1440px, headline at 16px 700 and detail at 14px, replacing a narrow vertical list of 13px text | LIVE |
| 43.5 | **Line-ups rebuilt as two pitches side by side**, Arsenal left and Manchester City right by default, each with a club dropdown. The eleven is the most likely starter per position within whichever legal shape gives the most likely eleven overall, rather than a shape assumed in advance | LIVE |
| 43.6 | The bench is the **three next most likely**, and nobody under a 10% chance of starting is listed, because a fourth-choice keeper is noise | LIVE |
| 43.7 | Analysis is out of the nav and its title map comment records that it is archived. The route still resolves | LIVE |

The identifier guard earned its place again: the new Dashboard fixture block used `Opp` without importing
it, which builds cleanly and throws in the browser.

---

## 42. Feedback pass, delivery three of five: Builder and Squad, 27 Jul 2026

Executes section 3 of the implementation plan, plus one correction to delivery two.

**Correction to delivery two:** the RESET button was wrapped in a labelled field with a blank label, which
rendered an empty heading above it. It is not a labelled field, so it no longer pretends to be one.

**Delivery three**

| # | Decision | Status |
|---|---|---|
| 42.1 | The pitch takes a `fill` flag and grows to `min(62vh, 640px)` with the rows distributed across it, so the whole squad is visible without scrolling. Builder and Squad both use it; the Dashboard and Line-ups keep the smaller fixed height because those pages are two-column comparisons | LIVE |
| 42.2 | **The formation is a dropdown on the pitch, top-left**, opposite the budget at top-right. The row of eight chips is deleted | LIVE |
| 42.3 | The shape lock sits beside it as a `LockMark`: yellow with a black lock when on, outlined when off. Locked players carry the same mark, replacing the pink border and the LOCK word | LIVE |
| 42.4 | **The score moved off the pitch into a box above it**, so it appears once. Squad shows FREE TRANSFERS beneath it with the hit tag. Resolves the conflict between two feedback sections that both claimed the pitch's top-left | LIVE |
| 42.5 | **CHECKS replaces Live Feedback**, rejected four times. At most four rows, each an action or a problem: CAPTAIN with how far clear he is, RISK with the flagged names, BUDGET with the best upgrade the money buys, SHAPE with the better formation and its gain. A row with nothing to say does not render, and an empty panel does not render at all | LIVE |
| 42.6 | Gone from that panel: ownership, position counters, bank-only structure block, and a heading with no number beside it | LIVE |
| 42.7 | **One gameweek control on the Builder.** The toolbar stepper is removed; the player list's yellow slider sets how many gameweeks xPTS adds up over, in the list and in Best XI, so they cannot disagree | LIVE |
| 42.8 | The player list uses `PlayerControls` and `lib/sorting.mjs`, the same system as the Players page. Its bespoke sort map, HIDE FLAGGED toggle and preset price dropdown are deleted; POSITION defaults to ANY here too | LIVE |

Recorded because it cost time: removing the formation chip row by balancing `<section>` tags took a whole
outer section with it, including the horizon plates, and the recovery reverted the file to the repo version
and lost delivery one's edits to it. Re-applied by script. **The lesson is to cut the smallest element that
contains what is going, not the nearest ancestor.**

---

## 41. Feedback pass, delivery two of five: the Players page, 27 Jul 2026

Executes section 2 of the implementation plan, plus three corrections to delivery one found by auditing it.

**Corrections to delivery one**

| Found | Fix |
|---|---|
| A dozen literal `"xP"` labels survived the rename, in column headings and sort options. `metricName()` covers dynamic labels; these were hardcoded | Renamed, plus a test banning any string containing `xP` not followed by `TS` |
| `OWNERSHIP %` and `GAMETIME %` are far longer than the `Owned` and `Start %` they replaced, so two headings overflowed their columns | Widths matched to labels, plus a test that fails when a heading needs more room than its column reserves |
| My own check for a missing `S` import reported two false positives, because it read across two adjacent import statements as one | Rewritten to read each import separately. Both files were fine |

**Delivery two**

| # | Decision | Status |
|---|---|---|
| 41.1 | `lib/sorting.mjs` holds `SORT_KEYS`, `DEFAULT_SORT`, `cycleSort` and the column widths. The dropdown and the table columns are both generated from it, so parity is structural rather than something to remember | LIVE |
| 41.2 | Sort order as specified: PRICE (default, highest first), xPTS, VALUE, x£, FORM, PTS LAST YEAR, GAMETIME %, OWNERSHIP % | LIVE |
| 41.3 | Any sortable key cycles highest, lowest, then back to the default PRICE view, whether pressed on the dropdown or the column heading. Both read one piece of state and both show the direction arrow | LIVE |
| 41.4 | Controls: a 56px centred search, then POSITION (ANY default), PRICE range, SORT BY, COMPARE, RESET. Every previous filter is deleted: Club, Ownership, Availability, Fixture run, PROMOTED CLUBS, DIFFERENTIALS, CLEAR ALL and three separate sliders | LIVE |
| 41.5 | The yellow gameweek slider appears only while sorting by xPTS, defaults to the next gameweek, and reaches as far as the model can honestly score, capped at eight | LIVE |
| 41.6 | **The fixtures column always shows the next three and never reads the slider**, tested by asserting the fixture reader asks for three and contains no reference to the gameweek count. The first fixture is drawn larger than the two after it | LIVE |
| 41.7 | **VALUE is xPTS per million**, so it moves with the slider. **x£ is what he should cost from last season's points**, so it never does. Tested, because the first definition of VALUE duplicated x£ | LIVE |
| 41.8 | Row height 58 to 66. COMPARE turns row clicks into selection, up to three, shown on the same columns | LIVE |

---

## 40. Feedback pass, delivery one of five: language, shape, titles, splash, 27 Jul 2026

Executes section 1 of `docs/IMPLEMENTATION-2026-07-27.md`. Everything here is global, so it lands first
and the four deliveries after it inherit it.

| # | Decision | Status |
|---|---|---|
| 40.1 | **The projected-points label is `xPTS`**, from `metricName()` and `metricLabel()`. Louis calls it xPTS; the code said xP. One function, every surface follows, and the rule that no file writes the label directly is unchanged | LIVE |
| 40.2 | **Every control is a rounded square**, `S.radiusSm`. Sixty-six pills converted. A test bans `borderRadius: 999` outright, which is safe because the genuinely circular shapes (fixture dot, captain badge, availability dot) use explicit radii | LIVE |
| 40.3 | **Yellow `#FFD400` is the lock colour** and appears nowhere else. `components/LockMark.jsx`: a rounded square filled yellow with a black lock, used by both the formation lock and locked players | LIVE |
| 40.4 | **Every page title equals its nav label.** Three had drifted: `/squad` said "Plans", `/builder` said "Squad Builder", `/lineups` said "Predicted line-ups". A test compares the two lists | LIVE |
| 40.5 | **The loading flash is fixed.** Splash decided in an effect whether to show, so the app painted first and the overlay arrived a frame later. It now starts visible and the effect only ever hides it. Hold 1.8s, fade 600ms | LIVE |
| 40.6 | Terminology unified: OWNERSHIP %, GAMETIME %, PTS LAST YEAR, x£, DIFFICULTY. The words "run" and "runs" are gone from every visible string | LIVE |
| 40.7 | The Line-ups coverage line is deleted, and a test bans that shape of internal count from any rendered text. Status and ModelEvidence are exempt, being the surfaces whose purpose is reporting internals | LIVE |

**Two guards were wrong when written and were corrected by testing them against the real string.** The
internals check searched for "has a minutes forecast" where the text says "have a", so it could never have
fired; and its text extraction was catching `!==` comparisons between angle brackets as if they were copy.
Both were proved by planting the exact string Louis objected to and confirming the suite fails.

Retired in passing: `components/HeadlineBoxes.jsx` and `components/PlayerPicker.jsx`, both imported by
nothing and both still in the repo. Added to the tidy workflow.

---

## 39. One replace flow, 27 Jul 2026

There were two buttons for one question. MOVE TO BENCH exchanged a starter with a bench player; REPLACE
HIM opened a transfer. Both answer "who takes his place", so they are one flow whose answer may be
somebody already in the squad or somebody new. **Supersedes 38.1 and 38.2.**

| # | Decision | Status |
|---|---|---|
| 39.1 | One button, **REPLACE HIM**, on both pages. The second button is gone | LIVE |
| 39.2 | Pressing it asks: "Pick who replaces [name]: an outlined player from your squad, or anyone in the list below." Both routes are live at once | LIVE |
| 39.3 | Eligible squad members are outlined in cyan; the list narrows to that position. Clicking the selected player again cancels | LIVE |
| 39.4 | One state, `replacing`, replacing `swapFrom` and `outFor`. Two states for one concept is what made the wording drift apart | LIVE |
| 39.5 | On the Builder, a replacement from the list is same-position, funded by the outgoing player's price, frees a slot at his club, inherits his place in the line-up, and is undoable | LIVE |
| 39.6 | On the Squad screen the same act is a transfer and carries a hit beyond the free ones; filling an empty slot still costs nothing | LIVE |

Clean-up in the same pass: two dead `partners` computations left behind when the buttons stopped naming a
partner, and four stale `setOutFor` references the identifier guard caught. Tests assert neither page
contains MOVE TO BENCH, MOVE TO XI, BENCH FOR or START FOR, and that neither holds two states.

---

## 38. Swapping is two steps, 27 Jul 2026

A button reading "BENCH FOR KONSA" picked the first eligible player. With four on the bench that is
arbitrary, and it hid the choice inside a label.

| # | Decision | Status |
|---|---|---|
| 38.1 | Step one states the intent: **MOVE TO BENCH** or **MOVE TO XI**. No player is named, because none has been chosen | LIVE |
| 38.2 | Step two is a click. Eligible partners are outlined in cyan on both the pitch and the bench, so the choice is visible rather than described | LIVE |
| 38.3 | A prompt reads "Pick who [name] swaps with. The outlined players are eligible." with a CANCEL. Identical wording on both pages | LIVE |
| 38.4 | Clicking the selected player again cancels; clicking anyone ineligible does nothing rather than silently doing something else | LIVE |
| 38.5 | The Builder snapshots for UNDO before completing a swap | LIVE |

A test asserts neither page contains a button that names a guessed partner, and that both use the same
two labels and the same prompt.

---

## 37. The Builder can open drafts again, 27 Jul 2026

Decision 25.4 removed the Drafts tab from the Builder on the reasoning that plans belong on the Squad
screen. It never occurred to me that this left **no way to open a saved draft in the Builder at all**, so
a draft missing a player could not be repaired: the only screen that can add players could not load it.

| # | Decision | Status |
|---|---|---|
| 37.1 | A draft dropdown is the first control in the Builder toolbar. "New draft" plus every saved draft, each labelled with how many players it holds, so a short one is visible before opening it | LIVE |
| 37.2 | Opening hydrates every row from the live player list and reports what is missing: empty slots, and anyone no longer in the league | LIVE |
| 37.3 | Choosing "New draft" resets the squad, locks, exclusions and shortlist, rather than leaving a half-loaded state | LIVE |
| 37.4 | Saving refreshes the dropdown, so a new draft is immediately selectable | LIVE |

**The flow end to end:** Builder creates and repairs a fifteen and saves it as a draft. Squad loads any
draft, plans transfers per gameweek on a working copy, and saves changes as a NEW draft. Neither screen
can silently damage the other's work.

Also, the empty slot's alignment, third attempt and the first one done properly. The previous two nudged
margins by eye. The dashed square now sits inside a container of exactly the Kit footprint,
`{ width: KIT_SIZE, height: KIT_SIZE * 0.9 }`, and is centred within it, so its centre is the same number
as a shirt's by construction. The test asserts there is no hand-tuned offset, because that is what kept
getting it wrong.

---

## 36. Squad edits are a working copy, 27 Jul 2026

Louis loaded a draft and found a defender missing. Two faults combined: the drag bug wrote a squad short
of a player, and **the Squad screen was writing straight to the stored plan**, so the damage was
persisted into the Builder draft it came from. The drag mechanism is already gone; this closes the second
half.

| # | Decision | Status |
|---|---|---|
| 36.1 | Selecting a plan takes a **deep working copy**. Every edit changes the copy. The original draft is never modified from this screen | LIVE |
| 36.2 | **SAVE AS NEW DRAFT** sends no identifier, so the API creates a new row rather than updating one. A test asserts the save body carries no id | LIVE |
| 36.3 | An "Unsaved. The original is untouched." marker appears as soon as the copy diverges | LIVE |
| 36.4 | **MANAGE DRAFTS** lists every draft with its player count, OPEN and DELETE | LIVE |
| 36.5 | A draft holding fewer than fifteen players says so in pink and invites the empty slots to be filled, rather than silently drawing a gap | LIVE |
| 36.6 | Filling an empty slot adds to the base fifteen and **costs nothing**: nobody is leaving, so it is not a transfer and carries no hit. Only an exchange for an existing player can | LIVE |

**The division of labour, as Louis defined it:** the Builder creates a draft with no transfer plan; the
Squad screen builds the transfer plan on top of a draft, and anything it changes becomes a new draft.

Also corrected: the empty slot's dashed box was sized to the Kit container, 39.6px, but Kit draws its
shirt inside a 40 by 36 viewBox starting at y=2, so the visible shirt is 35.2px tall beginning 2.2px
down. The box is now 35px with a 4px offset, so the two centres line up.

---

## 35. Drag and drop removed everywhere, 27 Jul 2026

Dragging a bench player repeatedly made a starting player disappear. The cause is inherent to the
mechanism as it was written: a drop handler fired against a target captured when the drag began, so a
rapid sequence could write a squad short of a player. Removal was silent, which is the worst kind.

| # | Decision | Status |
|---|---|---|
| 35.1 | **Drag and drop is removed from every surface.** Selecting a player and pressing a button cannot lose one | LIVE |
| 35.2 | Bench and start are buttons in the player menu, next to captain and remove, naming the exact player being exchanged: "BENCH FOR CALAFIORI" | LIVE |
| 35.3 | A swap is a same-position **exchange written as one starting list**, never a removal followed by an addition. Both ids are named in a single write | LIVE |
| 35.4 | The Squad screen has the same menu as the Builder: MAKE CAPTAIN, MAKE VICE, bench or start, REPLACE HIM. The armband could not be changed there before | LIVE |
| 35.5 | Captain and vice are mutually exclusive on both pages: making a vice captain clears the vice | LIVE |
| 35.6 | One shared `CELL` box, 84 by 132, for a filled shirt and an empty slot, content top-aligned. The empty square used to jump upward when a player left, because a filled cell carries a kit, a name, a price row, a fixture tag and a page link, and an empty one carried a box and a label | LIVE |

Tests assert no surface contains `draggable`, `onDragStart`, `onDragOver` or `onDrop`, that a swap names
both sides, and that both cell types share the same box.

---

## 34. Extraction dropped two module constants, 27 Jul 2026

Pulling `Candidates` out of BuilderClient left behind two module-scope constants it depends on: `RULES`
and `POS_ORDER`. Both crashed the Squad screen the moment a plan was selected, in two separate
deliveries, because the component only renders once a squad exists.

The identifier guard missed both, and each miss taught it something:

| Miss | Why the guard did not see it | Fix |
|---|---|---|
| `RULES.composition` | The guard only checked identifiers that were CALLED, `name(` | Also check property access |
| `POS_ORDER[pos]` | Dot access was checked, bracket access was not | Also check `[` |
| `for (const x of POS_ORDER)` | Neither dot nor bracket | Also check `of` and `in` |

Comments are now stripped before scanning, because a sentence like "THE SQUAD SCREEN." read as a
reference to an object called SQUAD. Stripping string literals as well was tried and reverted: an
apostrophe in JSX prose made the regex swallow real code, so genuine local functions looked undefined.
The one prose token that survives, `GW1`, is listed explicitly rather than solved with a more fragile
pattern.

The widened guard was **verified by reintroducing the exact bug**: removing the `POS_ORDER` declaration
makes the suite fail. Every component was then audited for the same fault and none remain.

---

## 33. One pitch, one player list, both pages, 27 Jul 2026

| # | Decision | Status |
|---|---|---|
| 33.1 | `Candidates` extracted from BuilderClient into `components/Candidates.jsx` and used by both pages. The Squad screen had a modal transfer picker: a different interaction, different filters and different sorting for the same job | LIVE |
| 33.2 | Swapping on the Squad screen: click a player on the pitch, then ADD on anyone in the list at the bottom. Same list, same filters, same sorts as the Builder | LIVE |
| 33.3 | `components/HeadlineBoxes.jsx`: **xPTS** and **FREE TRANSFERS** as two large stacked boxes at the top-left of the pitch on Squad. The Builder gets the xPTS box only, live as picks change | LIVE |
| 33.4 | **A plan on the Squad screen is a settled team**, not a blank slate. One free transfer per gameweek banking to five; every move beyond that costs four points, shown as a red `-4` tag on the xPTS box, on the free-transfer box, and against the offending transfer in the list. Two extra moves reads `-8` | LIVE |
| 33.5 | xPTS shows the NET figure with the gross beneath it, so the cost of a hit is legible rather than hidden in one number | LIVE |
| 33.6 | Retired: `PlanList`, `PlanTimeline`, `TransferPicker`. All three superseded by the shared pitch and list. `tidy` removes them | LIVE |

Team 4812 remains read-only throughout: no player list, no transfer controls, no hit arithmetic, because
there is nothing to transfer until the API returns picks.

---

## 32. Team 4812 shows the empty pitch, 27 Jul 2026

Louis asked for this three times. Decision 25.2 recorded the opposite, on my reasoning that a fifteen of
blank shirts is an empty state dressed as data. He overruled it, and he is right that the Builder already
draws exactly these empty slots for an unstarted squad, so showing them here is consistent rather than
invented. **Supersedes 25.2.**

| # | Decision | Status |
|---|---|---|
| 32.1 | Team 4812 renders the same empty pitch the Builder shows for a blank squad, with the position placeholders | LIVE |
| 32.2 | It is **read-only**: clicking a slot or a player does nothing, and the transfer controls do not appear. Those players are not his to choose until the API returns them | LIVE |
| 32.3 | The team dropdown is centred and large, 56px tall, 320px minimum, above a centred pitch capped at 980px | LIVE |

One line remains under the read-only pitch, stating that it syncs at the first deadline. That is a fact
about what the surface will do, not a promise standing in for a missing feature.

---

## 31. The Squad screen is a pitch, 27 Jul 2026

Second correction on the same screen. Louis asked for the Builder's visual language: a squad on a pitch.
I delivered a grid of summary cards twice, which told him nothing he could not read faster from a pitch.

| # | Decision | Status |
|---|---|---|
| 31.1 | The Squad screen draws **the same `BuilderPitch` component as the Builder**. A squad looks identical wherever it appears | LIVE |
| 31.2 | **Team 4812 is permanently the first entry in a dropdown**, followed by every plan. Click to select; the pitch redraws. No dragging | LIVE |
| 31.3 | Gameweek arrows bounded by the published fixture list, both ends | LIVE |
| 31.4 | PLAN A TRANSFER opens the picker; transfers for the shown gameweek are listed with sale value and an UNDO | LIVE |
| 31.5 | The card list (`PlanList`) is no longer used by any page. Superseded by 31.1 | LIVE |

**The NaN and the broken shirts had one cause.** Migration 021 copied `squad_drafts.squad->'picks'`, which
stores only `{ fpl_id, position, starting }`: no price, no club. So spend arithmetic produced NaN and
every shirt resolved to the fallback colour. Every plan row is now hydrated from the live player list
before anything renders, and a player no longer in the league drops out rather than rendering blank. A
test enforces the hydration, because trusting a stored row is the mistake that produced both symptoms.

---

## 30. The Squad screen actually replaced, 27 Jul 2026

Decision 25.1 said the Squad screen lists plans. It did not, and Louis found it the moment he saved a
draft. The plan list was rendered **inside a `!current || !squad` branch**, so as soon as a plan of
record existed the old screen returned: a team-ID connect box, a chip planner listing blank and double
gameweeks for clubs he does not own, a live feedback rail and a replacement drawer. The plan list was
sitting behind the very thing it was meant to replace.

`app/squad/SquadClient.jsx` rewritten, 491 lines down to 196. It now does exactly two things: list
plans, or show one plan's timeline. Everything else is deleted rather than moved. Chips already exist on
the timeline per gameweek, which is the only place chip timing carries meaning; a page-level chip
planner listing every club in the league never did.

Also fixed: **plans store `team_id`, but the shirt component needs the club's short name**, so every
shirt on a plan card fell back to the default purple. A `clubOf` resolver is threaded through, which is
also why an unrecognisable "WES" tag appeared.

---

## 29. The silently discarded accessors, 27 Jul 2026

The Line-ups page crashed on `model.startProbOf is not a function`. The accessor had been added to
**buildScorer's options object** instead of to what `loadModel` returns. buildScorer ignores options it
does not recognise, so nothing threw: `startProbOf` and `minutesOf` were simply undefined.

The page crash was the visible half. The invisible half is worse: the auto-build passes
`startProbOf: model.startProbOf`, so **the minimum-start-probability filter that keeps non-starters out
of the eleven has been receiving undefined and doing nothing.** The solver reads a missing accessor as
"no minutes information", which falls back to allowing anyone with a positive xP. That is why cheap
non-starters could still turn up.

Fixed by moving `minutesForecasts`, `minutesOf` and `startProbOf` onto the returned model.

A guard now walks every page and component, collects every `model.x` access, and fails if `loadModel`
does not return `x`. This class of bug is invisible at build time and at runtime until the exact line
runs, so it needed a test rather than more care.

---

## 28. Final additions, 27 Jul 2026

| # | Decision | Status | File |
|---|---|---|---|
| 28.1 | **Predicted line-ups page.** The minutes model is the only validated layer in the product (81.1% start accuracy, Brier 0.125 against 0.202) and its output was only visible as a Start % column. Now a plausible eleven per club with start probability and expected minutes, plus contested places and flagged players. Read-only over data that already existed, no new modelling | LIVE | `app/lineups/` |
| 28.2 | Three horizons at once on the Builder: GW1, next 3, next 6, captain doubled. Judging a squad over six gameweeks previously meant changing the stepper and re-reading | LIVE | `horizonTotals` |
| 28.3 | Data freshness in the nav rail, replacing a decorative PIPELINE STATUS label with how old the numbers actually are | LIVE | `components/Shell.jsx` |
| 28.4 | CI split into parallel test and build jobs with npm and Next caches, and `npm ci` in place of `npm install`. Concurrency cancels superseded runs, so a batch of folder drops produces one result rather than six emails. Markdown and mockup changes no longer trigger a run | LIVE | `.github/workflows/ci.yml` |
| 28.5 | `tidy` workflow: one click in the Actions tab deletes every retired file, verifies nothing references them, runs the suite, then commits. Deletion without a terminal | LIVE | `.github/workflows/tidy.yml` |
| 28.6 | **Declined: a Risk Safe/Balanced/Aggressive control.** There is no honest mapping from those words to model behaviour; it would be three arbitrary multipliers with a confident label. Ownership already tells Louis how exposed he is | DECIDED | |
| 28.7 | **Declined: generated "Why this team" prose.** Confidence the model has not earned yet. Revisit after the backtest | DECIDED | |

---

## 27. Transfers, nav and the consistency pass, 27 Jul 2026 (part 4 of 4)

| # | Decision | Status | File |
|---|---|---|---|
| 27.1 | **Transfers happen in the timeline, not the Builder.** A transfer is one out, one in, which is a far smaller interaction than rebuilding a squad. Changed from the original plan for that reason | LIVE | `components/TransferPicker.jsx` |
| 27.2 | The picker spends SALE VALUE, not current price. A player who has risen 0.4 does not fund a 0.4 upgrade, because FPL returns half a rise | LIVE | `saleValue` |
| 27.3 | Only legal targets are offered: right position, affordable, not owned, not excluded, and within the club limit, which relaxes by one at the outgoing player's club | LIVE | tested |
| 27.4 | Nav order is Builder then Squad, since pre-season the building comes first. Retired legacy routes removed from the nav and its titles. Squad is titled Plans | LIVE | `components/Shell.jsx` |
| 27.5 | Consistency pass: 26 unused imports removed across every component, and a test now fails on any import a file never uses. Each one hid the fact that something had been half-removed | LIVE | `tests/guards.test.mjs` |
| 27.6 | Verified clean: no banned colours, nothing below 13px, no mono above weight 700, no instructional captions, no EP terminology, every live route titled | LIVE | swept |

The four-part plan is complete. 252 tests pass against a fresh clone of the repo.

---

## 26. The gameweek timeline, 27 Jul 2026 (part 3 of 4)

| # | Decision | Status | File |
|---|---|---|---|
| 26.1 | Opening a plan shows it gameweek by gameweek with left and right arrows. Every figure is DERIVED from the base plus the transfer list, so the squad, free transfers and hits cannot disagree | LIVE | `components/PlanTimeline.jsx` |
| 26.2 | Per gameweek: xP for that week with the captain doubled, free transfers remaining, moves made, hit cost, chip, shape, the eleven, and the bench in order | LIVE | |
| 26.3 | Captain and vice are set per gameweek by clicking a player. Setting a captain who is currently vice clears the vice, so the two can never be the same | LIVE | `onSetCaptain` |
| 26.4 | Chips are set per gameweek and validated across the plan: one per half, first set expiring at the GW19 deadline | LIVE | `validateChips` |
| 26.5 | **The timeline ends where the published fixture list ends.** Planning to GW38 when fixtures are not out, and blanks are not confirmed, would invent certainty | LIVE | `maxPlanGw`, navigation clamps |
| 26.6 | Legality, chip errors and staleness are shown per gameweek. Sale value is applied when a transfer shows what a player was sold for | LIVE | `validateAt`, `staleness`, `saleValue` |
| 26.7 | The gameweek is in the URL, so a position survives a refresh and can be linked | LIVE | `/squad?plan=id&gw=n` |

Remaining: part 4, adding transfers from the Builder, the nav reorder, and a full consistency pass.

---

## 25. Squad becomes the plan list, 27 Jul 2026 (part 2 of 4)

| # | Decision | Status | File |
|---|---|---|---|
| 25.1 | Squad screen lists plans as formation cards. The purple explanatory block is deleted and its `Empty` component removed | LIVE | `components/PlanList.jsx`, `app/squad/SquadClient.jsx` |
| 25.2 | **Slot one is reserved for the live team, permanently, and holds no players until the API returns picks.** No blank shirts: before the first deadline there is genuinely no team | LIVE | `LiveSlot`, entry 4812 |
| 25.3 | Each card shows the eleven in shape with a captain marker, players picked, spend, the gameweek span and any hits, plus the first validation error if it is not legal | LIVE | `PlanCard` |
| 25.4 | The Drafts tab is removed from the Builder. Plans are reached from Squad; the Builder opens one with `?plan=id` and saves back to the same row | LIVE | `TABS`, `savePlan` |
| 25.5 | One active plan at a time, enforced by a unique index and by the route | LIVE | `app/api/plans/route.js` |
| 25.6 | The live slot cannot be deleted | LIVE | route refuses `kind = live` |

Remaining: part 3 the gameweek timeline, part 4 the Builder editing a specific gameweek plus the nav
reorder and a full consistency pass.

---

## 24. Retirement instead of deletion, 27 Jul 2026

Louis has no terminal, and a zip can only add or overwrite. So a file removed from the project cannot
leave his repo. CI proved this: the AI-provider guard failed on an Analyst route I had reported as
deleted, which was still live as a deployed endpoint.

**The rule from now on: retired files are overwritten with an inert version that declares itself
RETIRED, never merely reported as deleted.**

| File | Retired state |
|---|---|
| `app/api/analyst/route.js` | Returns 410. No provider reference, no key |
| `components/AskAnalyst.jsx` | Renders null, makes no requests |
| `app/legacy/*` | Redirects to `/` instead of rendering a stale UI |
| `supabase/migration-019.sql` | `select 1`, safe to run, documents how to drop the two tables |
| `jobs/projection_run.mjs` | Exits non-zero so it cannot run by mistake |
| `lib/harness.mjs` | Empty |

`tests/guards.test.mjs` now fails if any of these exists without declaring itself retired, so an older
copy cannot quietly resurrect one. Verified against a fresh clone of the repo with folders copied over
the top: 245 tests pass, build compiles, 14 pages.

---

## 23. Multi-gameweek plans, 27 Jul 2026

Louis's plan, with three changes agreed before building.

| # | Decision | Status | File |
|---|---|---|---|
| 23.1 | **A plan is a base fifteen plus a per-gameweek transfer list.** Never 38 snapshots: with snapshots, GW3 can hold a player never transferred in, free transfers and hits become unknowable, and an illegal plan is easy to save. With diffs, all three fall out of the data | LIVE | `lib/plan.mjs`, `tests/plan.test.mjs` (11 tests) |
| 23.2 | 2026/27 rules verified by search, not assumed: one free transfer per gameweek, banking to FIVE, four points a hit, two chip sets with the first expiring at the GW19 deadline, banked transfers KEPT through a chip | LIVE | `PLAN_RULES` |
| 23.3 | **Sale value is purchase price plus half the rise, rounded DOWN to 0.1**; a fall returns in full. Without this a plan drifts out of budget by GW3 and quietly becomes illegal | LIVE | `saleValue` |
| 23.4 | Slot one is **reserved** for the live team permanently, holding no players until the API returns picks. A saved squad of blank shirts is an empty state dressed as data | PENDING UI | `plans.kind = 'live'`, entry_id 4812 |
| 23.5 | Squad lists plans; clicking one opens its timeline; editing a gameweek opens the Builder. List, timeline, editor: one job per screen | PENDING UI | supersedes the Drafts tab |
| 23.6 | One vocabulary: a **plan** has a base and a timeline, one plan is **active**. Existing drafts convert automatically | LIVE | migration-021 backfills from `drafts` |
| 23.7 | Plans go stale, so every gameweek is re-checked against live prices and availability and the differences reported | LIVE | `staleness()` |
| 23.8 | **Not building** auto-suggested transfer paths. It optimises over the horizon where the model is weakest and would produce confident plans on the least reliable data. Revisit after the backtest | DECIDED | |

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
