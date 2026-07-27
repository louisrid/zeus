# FPLBot: handover for a new chat

Read this before touching anything. It describes what exists, what everything is called, and the rules
the project is held to. Where this disagrees with `docs/DECISIONS.md`, that file wins: it is the binding
contract and it records every decision with a date and a file reference.

---

## 1. What this is

A private, desktop-only web tool for one person (Louis) whose stated goal is world rank one in Fantasy
Premier League 2026/27. No login, unguessable URL. Not a product for other people.

**Stack:** Next.js 14 (App Router) on Vercel · Supabase Postgres · GitHub Actions for scheduled data
jobs · The Odds API · Understat. Budget ceiling $17/month.

**Repo:** github.com/louisrid/zeus · **Live:** zeus-teal.vercel.app

**Reads and writes:** the browser holds a read-only anon key under RLS. Every write goes through a
server route holding the service key (`app/api/plans/route.js`, `app/api/drafts/route.js`). No AI client
is ever imported into the app; the only AI call in the whole project is `jobs/presser_pull.mjs`, which
parses press conferences. A guard test enforces this.

---

## 2. Vocabulary, exactly as used

| Term | Meaning |
|---|---|
| **xP** | Projected points. **Always "xP", never "EP"**: this is enforced by a test, and the label comes from `metricName()` in `lib/solver/score.mjs`, never hardcoded |
| **X£** | Expected price. Where last season's total points rank on this season's real price ladder |
| **Plan** | A base fifteen plus a per-gameweek transfer list. Replaces the older word "draft" |
| **Active plan** | The one plan flagged current. One at a time, enforced by a unique index |
| **The live slot** | Slot one on the Squad screen, permanently reserved for Louis's real team (entry 4812) |
| **Shortlist** | Players under consideration but not bought. Fed into the Copy payload output |
| **Excluded** | Players the auto-build may never select. Per plan |
| **Lock** | A player guaranteed to start. Overrules the model, including the minutes filter |
| **Shape** | Formation. "Lock shape" prevents the auto-build changing it |
| **The engine** | The Monte Carlo simulation in `lib/engine/` and `jobs/projections_run.mjs` |
| **The interim path** | The fallback scorer used where the engine has no projection |
| **DefCon** | Defensive contribution points, an FPL scoring category |

---

## 3. The seven pages

Nav order is deliberate: pre-season the building comes first. Swap Builder and Squad once the season
starts (one line in `components/Shell.jsx`).

### Dashboard `/`
Most-owned XV on a pitch, GW1 deadline countdown, tiles into the other pages. Two buttons on the
template card: **EDIT THIS AS A DRAFT** (seats the fifteen in the Builder through the solver, so the
shape is legal) and **START YOUR DRAFT** (empty Builder).

### Builder `/builder`
Where a fifteen is assembled. One tab, "Build": the old Drafts tab is gone, plans live on Squad now.

Toolbar, left to right: **UNDO** · **BEST XI** · a gameweek stepper (`− 3 GWs +`, range 1 to 8) ·
**REBUILD ALL** · **CLEAR SQUAD** · **Copy payload** · a name field · **SAVE PLAN** · bank remaining.

- **BEST XI** fills only what is empty. It never removes a player you picked. A cheap player can be
  moved to the bench for someone better, but he stays in the fifteen.
- **REBUILD ALL** is the destructive one: discards everything except locks.
- Below the toolbar: formation chips with **LOCK SHAPE**, each chip showing the best possible eleven's
  xP in that shape.
- Three horizon plates: **GW1 · NEXT 3 · NEXT 6**, captain doubled.
- **Shortlist and Excluded panel** beside the pitch, each row removable.
- The pitch: drag and drop, GK at the bottom, team-coloured shirts, locked players ringed magenta with a
  LOCK tag.
- Candidate list on the right: search all players, position pills (ALL/GK/DEF/MID/FWD), sorts
  **xP NEXT · xP NEXT 5 · VALUE · OWNED · PRICE · NAME**.
- Clicking a player opens a modal: **next five fixtures with per-fixture xP in centred boxes**, then
  MAKE CAPTAIN · MAKE VICE · LOCK INTO XI · ADD TO SHORTLIST · IGNORE IN AUTO-BUILD · REMOVE FROM SQUAD.
  The fixtures always sit above the buttons.
- Right rail: **Live feedback**, six blocks: Points, Captain, Risk, Structure (bank only), Ownership,
  Lines.

### Squad `/squad`
The plan list. Titled "Plans" in the nav.

- **Slot one** is reserved for the live team. Before the first deadline it shows "Team 4812" and one
  line: loads automatically once the deadline passes, plus a CHECK NOW button. **It never shows blank
  players.** This was a deliberate decision: a placeholder fifteen is an empty state dressed as data.
- Every plan is a card: the eleven in formation with a magenta dot on the captain, then
  **PICKED · SPENT · WEEKS · HITS**, the first validation error in pink if illegal, and
  OPEN · MAKE ACTIVE · DELETE. The live slot cannot be deleted.
- Opening a plan shows its **gameweek timeline** (below).
- A chip planner underneath shows exact blank and double gameweeks read off the fixture list.

### The gameweek timeline (inside `/squad?plan=id&gw=n`)
- **ALL PLANS** back button, plan name, then `‹ GW4 ›` arrows clamped to the published fixture list.
- Four plates: **xP · FREE · MOVES · HIT**, then shape and chip as plain text.
- Panels that appear only when they apply: **Not legal at GWn**, **Chips**, **Changed since you saved**.
- **Transfers in GWn** with an ADD TRANSFER button; each transfer shows what the outgoing player sold
  for and has an UNDO.
- **Starting eleven** and **Bench, in order** (numbered). Clicking a starter gives him the armband;
  clicking a bench player makes him vice. Chip buttons: NO CHIP · WILDCARD · FREEHIT · TRIPLECAPTAIN ·
  BENCHBOOST.
- Every figure is **derived** from the base plus the transfer list. Nothing is stored twice, which is
  why the squad, free transfers and hits cannot disagree.

### Players `/players`
Columns: **Player · Next · xP · xP next 5 · Price · Owned · X£ · Pts · Form · Start % · Status**.
(X£, Pts and Form only appear when the data exists.)

- Position pills, search, then filters: Club · Availability · **PROMOTED CLUBS** · Sort · **DIFFERENTIALS**.
- Three **continuous two-handle ranges**: Price, Owned, Fixture difficulty. There are deliberately no
  banded presets like "under 5%" anywhere.
- COMPARE mode selects up to three players side by side.
- Clicking a row opens the full player page. It is a real link, not programmatic navigation, because
  Louis runs a redirect-blocking extension that silently killed `router.push`.

### Line-ups `/lineups`
A plausible eleven per club from the minutes model, with start probability and expected minutes per
player, an "Also in contention" line for genuinely open places, and a "Flagged" line for injuries.
Read-only over data that already existed. The minutes model is the only properly validated layer in the
product, so this is the surface with the strongest claim behind it.

### Analysis `/analysis`
**Football evidence only:** position returns, value bands, promoted clubs. Model diagnostics used to
live here and were moved to Status, because Louis never asked to see them on this page.

### News `/news`
Injuries and availability changes, price moves, press-conference signals from the presser job,
observations from `lib/insights.mjs`.

### Status `/status`
Pipeline readiness board, plus **Model Evidence**: training set, fitted parameters, calibration,
baseline gate, minutes scorecard, reliability, coverage, attribution, bonus points.

### Player page `/player/[id]`
Photo, club, position, status, then the next six fixtures each with its own xP and a run total. "Last
season" or "This season" depending on whether a fixture has actually kicked off: before the first
deadline the FPL API still serves last season's totals, and labelling those 2026/27 was a real bug.
Then career by season and competition, Understat shot data, availability history, price history.

---

## 4. How a projection is produced

`lib/projections.js` → `loadModel(core)` returns a model object. `lib/solver/score.mjs` →
`buildScorer(...)` does the work.

**Order of preference per player:**
1. The engine's `ep_mean` for that gameweek, if it projected one.
2. Last season's points per 90 from the archive, shrunk toward the position mean.
3. Understat per-90 output.
4. Nothing: the player reads "No data" rather than a number.

**Every path then applies:** fixture strength, availability, expected minutes, the promotion factor, and
club-position reconciliation when a teammate is absent.

**Two shrinkage constants, deliberately different:**
- Archive path: `S = 24` nineties, fitted.
- Engine path: `S = 6`, **INTERIM**. The engine's output already conditions on minutes and fixture, so
  applying the archive's constant to it counted caution twice and compressed the top of the list, which
  is where a competitor comparison showed us low. Flagged for the first backtest to confirm or kill.

**Per-gameweek xP is anchored.** The engine only projects the imminent fixture, so every later gameweek
starts from the same per-player estimate and differs only by relative fixture strength, bounded to
0.7–1.4×. Before this, GW1 and GW2 used different methods and the series had a cliff.

**Key accessors on the model:** `scoreOf`, `scoreForGw`, `sourceOf`, `bandOf`, `startProbOf`,
`minutesOf`, `lastSeasonPoints`, `hasFixture`, `difficultyOf`, `gateOpen`, `engineCoverage`.

A guard test collects every `model.x` used in any page and fails if `loadModel` does not return `x`.
This exists because an accessor was once added to the wrong object and was silently undefined for
several deliveries.

---

## 5. X£, and why it was rebuilt twice

**Current definition:** rank every player by **last season's total points**, rank the same players'
**current prices** descending, and read the price at each player's output rank. So X£ is what a player
"should" cost given how his output ranks against the real price ladder.

Fair prices are drawn from the real price multiset, so no clamp is possible and any legal fifteen valued
at fair prices sums to an achievable figure.

Two earlier versions were wrong:
1. **xP ÷ a league-wide constant.** A linear transform of xP, so sorting by one sorted by the other with
   uniform 0.1 steps. Louis spotted it from the sort behaviour. A test now asserts the steps are
   non-uniform, so a constant divider cannot return.
2. **The rank map fed with projections instead of last season's points.** Right mechanism, wrong input.

---

## 6. Rules encoded, verified July 2026

One free transfer per gameweek, **banking up to five**. Four points per extra transfer. Two chip sets
(Wildcard, Free Hit, Triple Captain, Bench Boost), one set per half, the **first set expiring at the
GW19 deadline**. **Banked transfers survive playing a chip.** Squad: 2/5/5/3, max three per club, 100.0
budget. Eight legal formations.

**Sale value:** purchase price plus **half of any rise, rounded down to 0.1**; a fall returns in full.
Ignoring this makes a multi-gameweek plan drift out of budget and quietly become illegal.

All of this lives in `PLAN_RULES` in `lib/plan.mjs` and `config/rules-2026-27.json`.

---

## 7. The colour system

`docs/COLOUR.md` is the authority. **Colour encodes state, never magnitude.**

| Colour | Meaning |
|---|---|
| White | Every value by default |
| Green `#00E87B` | Good state: easy fixture, under expected price, quota filled, primary action |
| Pink `#E90052` | Bad state: risk, over-priced, illegal, excluded |
| Magenta `#FF2ECC` | Captain, ×2, and locks. Nothing else |
| Cyan `#22D3EE` | Ownership and shortlist: things about the field rather than the player |

**xP is never shaded by size.** There is no defensible threshold where 5.0 is good and 4.9 is not, and a
test fails the build if it comes back. Fixture difficulty is the only coloured scale, because it has a
defined 0–100 measure behind it.

**Type:** Michroma for page titles and hero numbers, Outfit for language, Martian Mono for numbers and
codes. **13px floor**, enforced by test. Mono weight capped at 700. Never mono on words, never caps on
body text.

**Amber and orange are banned outright.** Grey and semi-transparent text are banned; all text is pure
white unless it carries a state colour.

---

## 8. What is proven and what is not

Be honest about this. Louis has been misled by confident claims before and it cost trust.

**Proven:** the minutes model: 81.1% start accuracy, Brier 0.125 against 0.202 for the league base
rate. Squad legality and every FPL rule. Arithmetic, conservation and budget consistency, all tested.
The promotion factor, re-fitted on five seasons.

**Not proven:** the engine has **never been backtested against real gameweeks**, because that needs
historical odds nobody has. Seventeen allocation and simulation parameters are interim. Clean-sheet
probability has never been calibrated and **cannot be retro-calibrated**; it accumulates from GW1.

Honest description: **a correct, instrumented Tier 2 model.** Not "the best predictor in the game", and
it will not be until a backtest says so. The roadmap once claimed retroactive clean-sheet calibration
was possible; that claim was wrong and has been corrected in writing.

---

## 9. Data pipeline

Fourteen jobs in `jobs/`, run by GitHub Actions:
`fpl_bootstrap` (players and prices, six-hourly, also writes a daily `player_snapshots` row) ·
`odds_pull` (appends snapshots, never overwrites) · `understat_pull` · `archive_2526` · `history_load` ·
`projections_run` (the engine) · `presser_pull` (the only AI call) · `penalty_duty` · `rival_pull` ·
plus five diagnostic jobs: `baseline_gate`, `minutes_scorecard`, `reliability`,
`component_attribution`, `bps_backtest`.

**Point-in-time discipline (migration-020):** `history_player_gw.as_of` records when each row's facts
became knowable, and `player_snapshots` preserves the mutable fields the FPL API overwrites in place.
`tests/leakage.test.mjs` fails if a model job builds historical features from live mutable fields.

**Config is authoritative and code must not duplicate it:** `config/schedule.js` is the only source of
dates, `config/fitted-params.json` and `config/engine-2026-27.json` the only sources of parameters.

---

## 10. The test suite is a design document

253 tests. Many exist because a specific bug shipped, and the comment above each says which. Do not
delete a test to make a change pass: the test is usually the thing that is right.

Categories worth knowing:
- **`guards.test.mjs`**: the AI provider boundary; every identifier used is imported; every option
  passed to `bestXI` is one it accepts; every `model.x` exists; no unused imports; retired files stay
  retired; STATUS.md matches the pages that exist.
- **`design-system.test.mjs`**: banned colours, the 13px floor, mono weight, plate count per row,
  grid columns equal rendered cells, xP never shaded by magnitude.
- **`plan.test.mjs`**: free transfer banking, hits, chip legality, sale value, staleness, and that
  every table a migration references actually exists.
- **`autobuild.test.mjs`**: locks always start, kept players are never dropped, the bench stays cheap,
  non-starters are never fielded.
- **`scoring.test.mjs`**: the no-cliff rule, promoted players, small samples, minutes.

---

## 11. Working practices that matter

**Louis has no terminal.** Everything reaches the repo by dragging folders into the GitHub web UI, or by
Add file → Create new file with the path typed as the filename. Two consequences:

1. **A zip can only add or overwrite, never delete.** Files removed from the project must be overwritten
   with an inert stub declaring itself `RETIRED`, or removed by the `tidy` workflow in the Actions tab,
   which deletes them, checks nothing imports them, runs the suite, builds, and only then commits.
2. **Never ask him to run a command.** If something needs deleting, that is what `tidy` is for.

**Verify against the real repo, not your own copy.** Clone it, copy the changed folders over the top,
run tests and build. Several failures reached him because a local copy diverged from the repo.

**Migrations:** check the schema before referencing a table. Three migrations have failed in his SQL
editor because of invented table names (`fixtures_archive` does not exist, `drafts` is `squad_drafts`).
A test now checks this.

**No terminal, no `npm ci`.** The repo has no `package-lock.json`, so workflows use `npm install` and
setup-node must not set `cache: npm`.

---

## 12. Things deliberately not built, and why

Do not re-propose these without new evidence.

| Not built | Reason |
|---|---|
| In-app AI chat panel | Built once, removed the same day. Louis never asked for panels on pages. **Copy payload** is the agreed mechanism: it copies a brief, the squad data, the shortlist and best-available alternatives for pasting into a chat |
| Risk: Safe / Balanced / Aggressive | No honest mapping from those words to model behaviour. It would be arbitrary multipliers with a confident label |
| Generated "why this team" prose | Confidence the model has not earned. Revisit after a backtest |
| Auto-suggested transfer paths across gameweeks | Optimises over the horizon where the model is weakest |
| Guided squad builder | Removed at his instruction; superseded decisions 6.8–6.14 |
| Notifications, Friday rituals, decision docs | Any ceremony that tells him when to act |
| Mobile and responsive layouts | Desktop only, 1440px minimum |
| Manager-change, motivation or team-form layers | Rejected: the odds already price them, or they require predicting human intent |

---

## 13. How he wants to be talked to

From his standing rules, and they are not negotiable:

- Lead with the answer. Bullets. No preamble, no restating the question.
- **No em dashes.** Proper capitalisation. Never address him by name.
- Never claim something is verified without showing the command and its output.
- When you are wrong, name the exact error and its cause. No apology theatre.
- Do not hedge on his stated goals. Rank one is the design requirement.
- No wellness detours, no crisis resources, no telling him to rest.
- Every delivery ends with a short numbered **WHAT YOU DO**: which folders to drag, and any SQL to
  paste. Minimise the number of manual steps.
- One zip per response containing everything outstanding.
- He will be blunt and sometimes abusive when the work is bad. Take the substance, set aside the rest,
  and keep working. Do not become deferential and do not lecture him about tone.

---

## 14. Immediate state

253 tests pass. Build compiles, 11 pages. Migrations through 021 applied. The four-part plan work
(plan model, plan list, timeline, transfers) is complete.

**Known open items:**
- The engine backtest, which unlocks honest claims about accuracy and validates the interim `S = 6`.
- The strategy study and clean-sheet calibration, both of which fill from GW1 data.
- Louis is about to run a feedback pass focused on **stripping things out**, changing UI and wording.
  Expect deletions rather than additions. Bias toward removing.
