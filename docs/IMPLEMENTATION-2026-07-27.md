# Implementation plan: the 27 July feedback pass

This is the binding plan for every change in Louis's feedback of 27 July 2026, cleaned version primary,
raw notes used where they clarify intent. Written before any code is touched, so nothing is rediscovered
or forgotten mid-flight.

**Execution shape: five deliveries.** Each is one zip, self-contained, verified against a fresh clone of
the repo before it is sent. Louis's time per delivery is a folder drag plus a look at the screen, so the
whole pass is inside the 60 to 90 minute budget. No SQL at any point: nothing here changes the schema.

Where this document decides something the feedback left open, the decision and its reason are stated. It
supersedes nothing in `docs/DECISIONS.md`; anything it changes will be recorded there as it ships.

---

## 0. Decisions taken up front

These resolve conflicts or gaps in the feedback so no delivery stalls on a question.

### 0.1 The projected-points label is `xPTS`

The feedback uses `xPTS` throughout. The codebase uses `xP`, enforced by a test asserting the label comes
only from `metricName()` in `lib/solver/score.mjs`. Both cannot be right.

**Decision: `metricName()` returns `"xPTS"`.** One edit, one source, every surface follows. The rule that
no file may write the label directly is unchanged and still tested. `x£` keeps its own name because it is
a different quantity.

### 0.2 Button shape

Louis prefers rounded squares over pills. `S.radiusSm` is already 12.

**Decision: every control uses `borderRadius: S.radiusSm`.** Pills (`999`) are removed from all 58
current uses. The only survivors are shapes that are genuinely circular and are not controls: the small
fixture-difficulty dots, the captain and vice badges on a shirt, and the availability dot. A test will
fail the build on `borderRadius: 999` anywhere outside a named allowlist of those three.

### 0.3 The top-left of the pitch, which the feedback assigns twice

Section 11 puts the formation dropdown at the top-left of the green area. Section 16 puts xPTS and Free
Transfers as two large boxes at the top-left of the pitch. Louis flagged the clash himself and asked for
a judgement.

**Decision:**
- **On the pitch, top-left:** the formation dropdown. Top-right keeps the budget pill. Two controls, one
  per corner, matching each other.
- **Above the pitch, left-aligned:** the xPTS box, and on Squad the Free Transfers box beneath it.

Reason: the formation belongs on the pitch because it describes the shape drawn there. The score is a
readout about the squad, not the pitch, and putting four things in one corner is the overcrowding Louis
warned against. The `XpPill` currently on the pitch is removed, so the number appears once.

### 0.4 What replaces Live Feedback

Louis has rejected this panel four times. The failure has been consistent: it reports state he can
already see (positions filled, players missing) and jargon he has not asked for (ownership, template
percentage).

**Decision: replace it with `CHECKS`, at most four rows, each of which either recommends an action or
names a problem. If a row has nothing to say it does not render.**

| Row | Shows | Renders when |
|---|---|---|
| CAPTAIN | Best captain in the eleven and how many points he beats the next best by | An eleven exists |
| RISK | Flagged players by name, with the chance of playing | At least one is flagged |
| BUDGET | Money left, and the best upgrade it buys, naming the player and the xPTS gained | Money remains and an upgrade exists |
| SHAPE | The formation with the highest xPTS from this fifteen, and the gain over the current one | A better shape exists |

No ownership, no template percentage, no position counters, no bare heading with no number, no
provenance paragraph. Everything is a sentence with a number in it or it is not there.

### 0.5 Analysis page

**Decision: removed from the navigation, kept as a route.** `app/analysis` remains reachable by typing
the URL so nothing is destroyed, and `docs/DECISIONS.md` records that it is archived rather than deleted.
Its Model Evidence half already lives on Status, so nothing is lost from the visible product.

### 0.6 The "558,563 players" number

`app/lineups/LineupsClient.jsx` renders `{covered} of {core.players.length} players have a minutes
forecast`. Both numbers are correct (558 of 563) but they are set in mono with no separator, so they read
as one figure. It is also exactly the internal note Louis has asked to stop seeing.

**Decision: the line is deleted.** The page is being rebuilt anyway. A guard test will fail on any visible
string matching `/\d+ of \d+ (players|rows|fixtures)/`, which is the shape this class of note takes.

### 0.7 Why Fixture Swings is empty

`fixtureSwings()` in `lib/data.js` returns `null` when `teams[0].strength` is null. Club strength is
missing or partial in the database, so the whole feature disappears. This is the same root cause as the
opponent-scale bug fixed in decision 14.

**Decision: the feature is rebuilt on fixture difficulty, which is always available**, because it is
derived from the same coverage-based scale the fixture tags already use. It no longer depends on a single
club's strength field being present, and it no longer uses the words "run" or "runs".

### 0.8 What a review of this plan changed

Louis asked whether this was the best version before starting. Re-reading his feedback against it found
six things, one of them a real design fault:

| Found | Change |
|---|---|
| **VALUE duplicated x£.** My first definition was a rank difference between output and price, which is what x£ already reports | VALUE becomes xPTS per million: forward-looking and in different units, so the two columns measure different things |
| **Two gameweek controls on the Builder.** The toolbar stepper and the new yellow slider could disagree | The stepper is removed; the slider is the only one and drives both the list and Best XI |
| **A third title mismatch.** `/lineups` reads "Predicted line-ups" against a nav label of "Line-ups" | Included in the parity fix, found by comparing the lists rather than by eye |
| **"CHECKS where it applies" was not a decision** | CHECKS is Builder-only, with the reason stated |
| **The Dashboard pitch height had no stated reason** | It keeps a smaller fixed height because that page and Line-ups are two-column comparisons |
| **COMPARE was listed with no behaviour** | Defined: select up to three, side by side, on the same columns |

---

## 1. Delivery one: language, shape and the app-wide sweep

Everything here is global, so it goes first and every later delivery inherits it.

### 1.1 Terminology

One decision per concept, applied everywhere:

| Concept | The word, everywhere | Never |
|---|---|---|
| Projected points | **xPTS** | xP, EP, points projection, expected points |
| Expected price | **x£** | X£ gap, fair price, expected value |
| Value | **VALUE** | value score, points per million |
| Ownership | **OWNERSHIP %** | Own%, owned, EO, effective ownership, template |
| Minutes likelihood | **GAMETIME %** | Start %, p_start, minutes probability |
| Last season's points | **PTS LAST YEAR** | Pts, total points, season points |
| Recent form | **FORM** | form index |
| A saved fifteen | **DRAFT** | plan, plan of record, squad draft |
| The transfer plan built on a draft | **PLAN** | timeline, schedule |
| Fixture hardness | **DIFFICULTY** | run, runs, fixture run, FDR |

`run` and `runs` are removed from every visible string. Files: `app/page.jsx`, `app/players/page.jsx`,
`components/FixtureXP.jsx`, `app/player/[id]/PlayerPage.jsx`.

### 1.2 Internal wording purge

Delete every visible string that reports pipeline or model internals. The full list to remove:

- `{n} of {m} players have a minutes forecast` (Line-ups)
- `Simulation engine for N of M players` and any provenance sentence
- `TARGET BAND NOT FITTED`, `interim`, `not yet run`, `calibration`
- `Run migration NNN`, `Check X_API_KEY is set`, `Actions, workflow, Run`
- Any string containing `null`, `NaN`, `undefined`, `_id`, `_pct`, `p_start`

Model diagnostics stay on `/status`, which is the one page whose purpose is exactly that.

### 1.3 Shape, weight and colour

- Every control: `borderRadius: S.radiusSm` (12). Cards: `S.radius` (18).
- Every control label: capitals, `lang(14, 700)`.
- Colour rules unchanged from `docs/COLOUR.md`, with one addition: **yellow `#FFD400` is the lock
  colour**, used only for the formation lock and player locks. Magenta returns to captain and ×2 only.
- Lock mark: a rounded square, `borderRadius: 6`, filled `#FFD400`, with a black lock glyph centred.
  One component, `components/LockMark.jsx`, used by the formation lock button and by every locked player.

### 1.4 Page titles

`components/Shell.jsx` `TITLES` must equal the nav label for every route. Three current mismatches, all
found by comparing the two lists rather than by eye:

| Route | Nav says | Title says | Becomes |
|---|---|---|---|
| `/squad` | Squad | Plans | **SQUAD** |
| `/builder` | Builder | Squad Builder | **BUILDER** |
| `/lineups` | Line-ups | Predicted line-ups | **LINE-UPS** |

A test compares the two lists and fails on any divergence, so this cannot drift again.

### 1.5 Loading screen flash

`Splash` mounts inside `Shell` and decides in an effect whether to show, so the first paint is the app.

**Fix:** the overlay renders on the server as visible by default, and the effect only ever *hides* it.
Nothing about the app is painted first. Timings: hold 1.8s, fade 600ms. Session-scoped as now, so it
appears once per browser session, not on every navigation.

### 1.6 Checks before moving on

- `npm test` green, `next build` green against a fresh clone.
- `grep -rn "borderRadius: 999"` returns only the three allowlisted shapes.
- `grep -rniE "\brun\b|\bruns\b"` returns nothing in visible strings.
- `metricName()` returns `xPTS` and no file writes the label directly.
- New tests: title parity, pill ban, internal-wording ban, splash renders before hydration.

---

## 2. Delivery two: the Players page

The largest single piece, and self-contained.

### 2.1 Layout

1. **Search**, centred, 56px tall, full width to 720px, placeholder `Search player or club`.
2. **Controls row** beneath it, all 48px, all rounded squares:
   - `POSITION` dropdown: **ANY**, GK, DEF, MID, FWD. ANY is the default.
   - `PRICE` two-handle slider, labelled with its live range.
   - `SORT BY` dropdown, contents in 2.2.
   - `COMPARE` toggle. Turning it on makes a row click select rather than open the player page; up to
     three selected players show side by side beneath the controls, on the columns from 2.4. Turning it
     off clears the selection. This is the existing behaviour, restyled and kept, because the feedback
     lists COMPARE as one of the four controls to retain.
3. **Yellow gameweek slider**, appearing only when SORT BY is xPTS. See 2.3.
4. The table.

Everything else currently on that page is deleted: Club, Ownership, Availability, Fixture run up to,
PROMOTED CLUBS, DIFFERENTIALS, CLEAR ALL, and the three separate range sliders. ANY is the default for
every remaining control.

### 2.2 Sorting

`SORT BY` options, this order, matching the table columns exactly:

`PRICE` (default) · `xPTS` · `VALUE` · `x£` · `FORM` · `PTS LAST YEAR` · `GAMETIME %` · `OWNERSHIP %`

- Default view: every player by PRICE, highest first.
- Choosing anything else, or clicking its column, cycles: **highest first → lowest first → back to the
  default PRICE view.**
- One piece of state, `{ key, direction }`, read by both the dropdown and the column headers, so they
  cannot disagree. The active column header shows an arrow for the direction.
- A test asserts the SORT BY option list and the sortable column list are identical and in the same order.

### 2.3 The xPTS gameweek slider

- Appears directly under the controls when and only when SORT BY is xPTS.
- Yellow `#FFD400`, matching the lock colour as a "this is a live control" accent.
- Range: gameweek 1 to the highest published gameweek, capped at the current gameweek plus 7, because
  that is as far as `scoreForGw` can honestly score. The cap is stated as a number, not explained.
- Default: the next gameweek only.
- Dragging it changes the xPTS column to the **sum across the selected gameweeks**, and the sort follows.
- **The fixture display does not change.** It always shows the next three.

### 2.4 Columns

Row height rises from 58 to 66. Order:

1. **FIXTURES**: the next three. The first is full size with the opponent code and home or away; the
   second and third are smaller. Fixed content, independent of the xPTS slider.
2. **xPTS** - for the selected gameweek range.
3. **PRICE**
4. **VALUE** - projected points per million, `xPTS / price`, to two decimals.

   **Corrected on review.** My first definition was a rank difference between output and price, which is
   almost exactly what `x£` already reports, so the table would have carried the same idea twice under two
   names. The two must measure different things:
   - **x£** answers *what he should cost*, from **last season's points** ranked on the real price ladder.
     Backward-looking, in pounds.
   - **VALUE** answers *what this gameweek's projection costs*, from **xPTS** divided by price.
     Forward-looking, in points per million.

   VALUE also moves with the xPTS gameweek slider, because it is built from xPTS. x£ never does.
5. **x£**
6. **FORM**
7. **PTS LAST YEAR**
8. **GAMETIME %**
9. **OWNERSHIP %**
10. **STATUS**

All except FIXTURES and STATUS are sortable and appear in the same order as SORT BY.

### 2.5 Behaviour

Changing any control updates the count immediately. A RESET returns every control to ANY, the sort to
PRICE, and the slider to one gameweek. No control can be left in a state the others do not reflect.

### 2.6 Checks

- Clicking every sortable column three times returns to the default view.
- The dropdown and the headers always show the same key and direction.
- The slider changes xPTS and the sort but never the fixtures.
- RESET clears everything.
- Tests: option and column parity, the three-step cycle, slider bounds, fixtures independent of the slider.

---

## 3. Delivery three: Builder and Squad

These share components, so they change together.

### 3.1 Pitch height

The pitch grows to fill the viewport without scrolling. `BuilderPitch` takes a `height` prop derived from
`calc(100vh - 260px)` with a floor of 520px, and the row spacing distributes across it. The bench stays
inside that height. Applied on Builder and Squad identically.

The Dashboard template and Line-ups use the **same component at a smaller fixed height**, because both
pages put two things side by side: the Dashboard has a right-hand column, and Line-ups shows two teams at
once. Stretching those to full viewport height would break the comparison the pages exist for. The
feedback asks for the styling to carry across "where it makes sense", and the shirts, plates, rounding and
colours do; the height does not.

### 3.2 Builder top controls

One row, left-aligned, capitals, rounded squares, in this order:

`DRAFT ▾` · `UNDO` · `BEST XI` · `GW ± n` · `REBUILD ALL` · `CLEAR` · `COPY PAYLOAD` · `NAME` · `SAVE`

Removed: the `BUILD` tab label, which does nothing now the Drafts tab is gone.

### 3.3 On the pitch

- **Top-left: formation dropdown.** Replaces the row of eight formation chips entirely.
- **Top-right: budget pill**, restyled as a rounded square.
- **Formation lock**: a square button beside the dropdown, yellow with a black lock when on, purple when
  off, using `LockMark`.
- **Locked players**: the same yellow lock mark beside the name. The current pink left border goes.

### 3.4 Above the pitch, left

- Builder: one **xPTS** box, live.
- Squad: **xPTS** box, and **FREE TRANSFERS** beneath it, with the red hit tag as built.
- The `XpPill` on the pitch is removed so the number appears once.

### 3.5 CHECKS replaces Live Feedback

As specified in 0.4. `components/Feedback.jsx` is rewritten to at most four conditional rows.

### 3.6 The Builder player list

The heading becomes **PLAYERS**. It carries the same controls as the Players page: search, POSITION,
PRICE, SORT BY, and the xPTS gameweek slider. `components/Candidates.jsx` is refactored to take the shared
control set so both pages behave identically. Clicking a player adds him to the correct position
automatically, which is the current behaviour and is kept.

**One gameweek control per page. Caught on review.** The Builder toolbar already has a `GW ± n` stepper
that sets the Best XI horizon. Adding the yellow slider as well would put two gameweek controls on one
screen that could disagree, which is exactly the duplication the feedback warns against.

**Decision: the stepper is removed and the yellow slider is the only gameweek control on the Builder.** It
drives the xPTS column in the list *and* the horizon Best XI optimises over. One number, one control, one
meaning: "the gameweeks I am planning for".

The Squad screen's arrows are a different thing and both stay: they choose **which gameweek's squad you
are looking at**, not how many gameweeks to add up. The plan does not conflate them, and neither should the
wording: the slider says `GAMEWEEKS` and the arrows say `GW n`.

### 3.7 Squad parity

Same pitch height, same formation dropdown position (read-only for team 4812), same lock marks, same
control shapes. Title **SQUAD**.

**CHECKS is Builder-only. Decided on review**, where the plan previously said "where it applies", which is
not a decision. The Builder's job is choosing fifteen players, and every CHECKS row is about that choice.
The Squad screen's job is the transfer plan, and it already carries the numbers that matter there: xPTS,
free transfers and the hit. Adding a second advice panel would be the overcrowding the feedback warns
about.

### 3.8 Checks

- Neither page scrolls to show the full squad at 1440 by 900.
- The formation dropdown changes the shape and the eleven re-picks.
- The lock is yellow when on, purple when off, and locked players carry the same mark.
- xPTS appears exactly once per page.
- CHECKS shows no row that has nothing to say.
- Tests: pitch height shared, no `XpPill` on the pitch, CHECKS row count, no banned words in the panel.

---

## 4. Delivery four: Dashboard, News, Line-ups, Analysis

### 4.1 Dashboard

- Delete the `TOP 10` donut from the Market card. It measured effective ownership among top-ranked
  managers, which Louis has never asked for and which reads as a percentage of nothing.
- **Fixture swings rebuilt** as a full-width bottom row, titled `EASIEST FIXTURES` and `HARDEST FIXTURES`,
  three clubs each, showing the next three opponents as difficulty-coloured tags. Built on
  `buildOpponentScale`, so it can never be empty while fixtures exist. No use of the word "run".
- The template card keeps both buttons.

### 4.2 News

- Notices become a **card grid**: `repeat(auto-fill, minmax(300px, 1fr))`, so four across at 1440px.
  Each card is a rounded square with the headline at 15px 700, the player and club beneath, and the change
  as a coloured value. Nothing at 13px.
- Sections reduced to two: **NOTICES** and **PRICE CHANGES**. The empty ones are deleted: press-conference
  signals fold into Notices as a source label, and the observation sections go, since they have never had
  content and Louis has asked for exactly this kind of removal.

### 4.3 Line-ups rebuilt

- Two panels side by side. Left defaults to **Arsenal**, right to **Man City**, each with a team dropdown.
- Each draws a pitch with the same component, showing the predicted eleven with GAMETIME % on each shirt.
- **Bench: the three most likely non-starters**, chosen by gametime, because those are the players who
  would come on. Anyone below 10% is not shown at all, since listing a fourth-choice keeper is noise.
- The per-player list, the club grid, the search and the coverage line are all deleted.

### 4.4 Analysis

Removed from the nav and from `TITLES`. The route stays. Recorded as archived.

### 4.5 Checks

- No card on Dashboard, News or Line-ups renders an empty body.
- Fixture swings shows six clubs.
- News cards are four across at 1440px and nothing is below 13px.
- Line-ups shows two pitches with eleven shirts each and at most three bench players.
- Tests: no empty-section strings, no `/\d+ of \d+/` counts, nav has no Analysis entry.

---

## 5. Delivery five: the points model, then the whole-app review

### 5.1 Promoted players

Currently `promotion_factor` is DEF 0.8168, MID 0.9292, FWD 0.9979, GKP and overall 0.9049, measured
against the six weakest established clubs over five seasons. That measurement stands: it is the only
version that does not double-count the fixture and clean-sheet layers.

The work here is **verification, not re-tuning**:

1. Reproduce the Diop case end to end with the live factor and the current shrinkage, and record where he
   ranks among defenders for GW1. Requirement: outside the top twenty.
2. Confirm no promoted-club player appears in the top ten of any position for GW1.
3. Confirm the factor is not so harsh that a genuine promoted starter is unpickable: a promoted defender
   with a full prior season of Championship minutes and a 90% gametime should still out-score an
   established club's fourth-choice defender.
4. If 1 or 2 fails, the fix is the small-sample shrinkage, not the promotion factor, because the factor is
   measured and the shrinkage constant is interim.

### 5.2 Predictor review

Three checks I can make confidently, with no new modelling:

- **Per-gameweek continuity**: no player's series contains a step outside the 0.7 to 1.4 band. Already
  tested; re-run across the live pool rather than a fixture.
- **Gametime coupling**: no player with gametime below 20% appears in the top fifty of any position.
- **Face validity by position**: the top ten of each position contains no player with fewer than five
  prior-season nineties unless he has an engine projection and a gametime above 70%.

Anything that fails is fixed. Anything that needs the backtest is written down and left, because the
engine is still unvalidated and pretending otherwise is the thing that has cost the most trust here.

### 5.3 Whole-app review

Not a per-page pass. One sweep for:

- Terminology: every term from 1.1 used consistently, no banned synonym anywhere.
- Shape: no pills outside the allowlist. Every card at radius 18, every control at 12.
- Colour: `docs/COLOUR.md` obeyed, yellow only on locks, magenta only on captain.
- Titles: nav and page title identical on every route.
- Empty states: no card renders a heading over nothing.
- Numbers: no NaN, no null, no impossible count, no internal note.
- Controls: every control reflects the current state, and RESET works on every page that has one.

### 5.4 Checks

Full suite plus the new tests, `next build`, and a fresh-clone verification. `docs/DECISIONS.md` updated
with every decision from this plan as it shipped, and `docs/HANDOVER.md` regenerated so a new chat
inherits the current product rather than this one's history.

---

## 6. Files affected, by delivery

| Delivery | Files |
|---|---|
| 1 | `lib/solver/score.mjs`, `lib/ui.jsx`, `components/Shell.jsx`, `components/Splash.jsx`, `components/LockMark.jsx` (new), every `.jsx` for shape and wording, `tests/design-system.test.mjs`, `tests/guards.test.mjs` |
| 2 | `app/players/page.jsx`, `components/PlayerControls.jsx` (new), `components/FixtureXP.jsx`, `tests/players.test.mjs` (new) |
| 3 | `app/builder/BuilderClient.jsx`, `app/squad/SquadClient.jsx`, `components/BuilderPitch.jsx`, `components/Feedback.jsx`, `components/Candidates.jsx`, `tests/plan.test.mjs` |
| 4 | `app/page.jsx`, `app/news/NewsClient.jsx`, `app/lineups/LineupsClient.jsx`, `components/Shell.jsx`, `lib/data.js`, `tests/data.test.mjs` |
| 5 | `config/fitted-params.json` if 5.1 fails, `lib/solver/score.mjs` if 5.2 fails, `docs/DECISIONS.md`, `docs/HANDOVER.md`, `STATUS.md` |

## 7. Dependencies

- Delivery 1 must land first: 2, 3 and 4 all use the shared shape, terminology and `LockMark`.
- Delivery 2 must land before 3.6, because the Builder's player list reuses the Players controls.
- Delivery 4 is independent of 2 and 3 and could move if something needs to be reordered.
- Delivery 5 must be last, because its review checks the other four.

## 8. What is not in this plan

Stated so it is not mistaken for an oversight:

- The engine backtest. It needs historical odds that do not exist. Until it runs, no claim about accuracy
  improves, and 5.2 is the honest substitute.
- Clean-sheet calibration. It accumulates from gameweek one and cannot be done retroactively.
- The strategy study, which fills from real gameweek data.
- Anything in `docs/DECISIONS.md` section 12's declined list: the in-app AI panel, a risk
  Safe/Balanced/Aggressive control, generated "why this team" prose, auto-suggested transfer paths.
