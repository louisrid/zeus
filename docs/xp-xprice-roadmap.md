# X£ teardown and the four-batch roadmap

Written 26 Jul 2026. Survives losing the chat. Read with `docs/DECISIONS.md`, which is binding.

Evidence labels: **CONFIRMED** means a file, line, table or config value is cited. **INFERRED** means
implied by what exists but not directly verified. **UNKNOWN** means not in the project.

---

# JOB 1 — X£ FORENSIC TEARDOWN

## 1. The function, verbatim

**CONFIRMED** — `lib/xprice.mjs`, lines 41 to 92.

```js
const MIN_PRICE = 3.8;   // the lowest price the game has ever issued
const MAX_PRICE = 16.0;  // above any price the game has issued, so the clamp never binds in practice

export function buildXPrice(pool, scoreOf) {
  if (!pool || !pool.length || typeof scoreOf !== "function") return null;

  const rateOver = (list) => {
    if (list.length < 8) return null;
    const output = list.reduce((a, p) => a + Math.max(0, Number(scoreOf(p)) || 0), 0);
    const spend  = list.reduce((a, p) => a + Number(p.price), 0);
    return output > 0 && spend > 0 ? output / spend : null;
  };

  const priced = pool.filter((p) => Number(p.price) > 0);
  const leagueRate = rateOver(priced);
  if (!leagueRate) return null;

  const rates = {};
  for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
    const r = rateOver(priced.filter((p) => p.position === pos));
    if (r) rates[pos] = r;
  }

  const clamp = (v) => Math.min(MAX_PRICE, Math.max(MIN_PRICE, v));

  const of = (p) => {
    const price = Number(p.price);
    if (!(price > 0)) return null;
    const output = Number(scoreOf(p));
    if (!Number.isFinite(output)) return null;

    const fair = clamp(output / leagueRate);
    const gap  = fair - price;

    const posRate = rates[p.position];
    const within  = posRate ? clamp(output / posRate) : null;

    return {
      xprice: Math.round(fair * 10) / 10,
      gap:    Math.round(gap * 10) / 10,
      verdict: gap > 0.4 ? "under" : gap < -0.4 ? "over" : "fair",
      withinPosition:    within === null ? null : Math.round(within * 10) / 10,
      withinPositionGap: within === null ? null : Math.round((within - price) * 10) / 10,
    };
  };

  return { of, leagueRate, rates, minPrice: MIN_PRICE, maxPrice: MAX_PRICE };
}
```

**Inputs:** `pool` (live players with `price`, `position`, `fpl_id`), `scoreOf` from
`lib/solver/score.mjs → buildScorer`. **Constants:** `MIN_PRICE = 3.8`, `MAX_PRICE = 16.0`,
verdict thresholds `±0.4`, minimum sample `8`.

## 2. The clamp

**CONFIRMED.** 16.0 is a hard cap, line 65: `Math.min(MAX_PRICE, Math.max(MIN_PRICE, v))`. The
comment on line 42 claims it "never binds in practice". That comment is wrong.

Reconstructing the real pool shape (558 players, realistic price distribution, and the roughly 60%
who have no usable history so `scoreOf` returns 0):

```
league rate                       0.3206 points per £m
projected score needed to hit 16.0  5.13
at the 16.0 ceiling                3.3% of players
at the 3.8 floor                  59.6% of players
raw uncapped value, Haaland-like  25.3
```

**The clamp destroys information at both ends, and the floor is far worse than the ceiling.**

- **Ceiling:** any player projecting above 5.13 collapses to 16.0. That is why Haaland, Fernandes,
  Raya, Gabriel, Guéhi and Rice are all exactly 16.0. Six of your thirteen.
- **Floor:** roughly 60% of the pool sits at 3.8, not because they are worth 3.8 but because
  `scoreOf` returned 0 for no data. **CONFIRMED**: `lib/solver/score.mjs` returns 0 and
  `sourceOf()` returns `"none"` for a player with no projection, fewer than 2 archive nineties and
  under 180 Understat minutes. X£ ignores `sourceOf` entirely and treats missing data as zero output.

**Root cause of the ceiling.** `leagueRate` divides total output by total price across *all* priced
players. Around 380 of them contribute zero output but roughly 1,700 of price. That deflates the rate
by about a third, which inflates every real player's X£ by the same factor and pushes everyone decent
into the cap. The metric is being poisoned by the players it cannot score.

## 3. Brobbey versus Porro

**CONFIRMED: X£ does not use season points at all.** The `Pts` column beside it is total season
points. X£ reads `scoreOf`, which on the archive path is **points per 90** (`score.mjs`:
`a.pointsPer90 * fx * avail`, shrunk toward the position mean, then multiplied by expected minutes).

Traced:

| | Brobbey | Porro |
|---|---|---|
| Price | 6.0 | 5.5 |
| Season points, the `Pts` column | 92 | 117 |
| What X£ actually reads | points **per 90**, shrunk | points **per 90**, shrunk |
| Implied output, X£ × league rate | 13.7 × 0.32 ≈ **4.4** | 9.5 × 0.32 ≈ **3.0** |
| X£ | 13.7 | 9.5 |

**The input that inverts them is minutes.** Brobbey scored 92 points in materially fewer minutes than
Porro's 117, so his rate is around 45% higher. X£ is not inverted; it is measuring a rate while the
column next to it shows a volume, and nothing on screen says so. That is a presentation failure as
much as a maths one.

## 4. Verdict

**Delete the mechanism and rebuild it: the clamp destroys 63% of the column, missing data is silently
scored as zero, and the absolute-value output is unreadable next to a volume stat.**

## 5. The replacement, three candidates

### (a) Position-blind points-to-price curve

X points over a window maps to Y fair price regardless of position.

```
fair(p) = f(output(p))     one monotone f for the whole league
```

**Defensible, and it is the right instinct.** The objection that positional ceilings differ
structurally is real but does not break it, because the differences are small in the direction that
matters. **CONFIRMED** from three seasons of `history_player_gw`: points per million per gameweek is
GKP 0.202, DEF 0.231, MID 0.248, FWD 0.230 — inside 20% of each other. And at every price point a
defender out-scores a forward (£5: 1.78 against 1.01). A position-blind curve surfaces exactly that.
A position-relative one hides it.

**Failure mode:** goalkeepers cluster near the bottom of the output distribution and therefore near
the bottom of the fair-price ladder. That is arguably correct rather than a fault, but it means X£
will rarely flag a keeper as a bargain even when he is the best keeper available.

### (b) Position-relative fair price

Fit price against production within position. This is what is live now.

**Rejected.** It answers "cheap among defenders", which is the narrower question, and it structurally
cannot tell you a £6.0 defender beats a £6.0 forward. It also does nothing about the clamp, which is
the actual defect.

**Failure mode:** reports a £6.0 defender projecting 4.4 and a £6.0 forward projecting 3.0 as both
fairly priced, hiding a real edge.

### (c) Budget-consistent fair price

Fair prices must be solvable against the real 100.0 budget for 15 players, so the column sums to
something coherent.

**This is the strongest idea and it has a clean implementation that also solves the clamp.** Rather
than fitting a rate and normalising afterwards, map the ranks:

```
1. Take every player with usable data, i.e. sourceOf(p) !== "none".
2. Sort them by projected output, descending.          rank_out(p)
3. Take the same players' real prices, sort descending. price_ladder
4. fair(p) = price_ladder[rank_out(p)]
```

X£ becomes: **the price of the player who sits at the same position in the price ladder as you sit in
the output ladder.**

Why this is the right answer:

- **No clamp is possible.** Fair prices are drawn from the real price multiset, so the output can never
  leave the range the game issues. The 16.0 ceiling and 3.8 floor both disappear by construction.
- **Budget-consistent automatically.** The multiset of fair prices *is* the multiset of real prices, so
  any legal 15 valued at fair prices sums to a real, achievable figure. Nothing drifts.
- **Position-blind**, so it keeps the defender-versus-forward edge from (a).
- **No information destroyed.** Full ordering preserved across all ranks.
- **Directly interpretable.** The gap is "how many places up or down the price ladder you belong".

**Failure mode, stated plainly:** it is purely relative. It cannot say "the whole market is
under-priced" because it forces the fair distribution to equal the actual distribution. For an index
whose job is to find *relative* mispricing, that is acceptable. It is not a valuation.

### Recommendation

**(c), rank-mapped against the real price ladder, computed position-blind.**

**What it claims:** this player's output ranks where a more, or less, expensive player's output
usually ranks.

**What it does not claim:** that his price will change, that he is worth this in any absolute sense,
or that the market as a whole is mispriced.

## 6. Output shape

**Delta, not the absolute number. Confirmed as the better surface.**

An absolute X£ of 7.5 next to a price of 6.0 makes you do the arithmetic, and sitting beside a
volume-based `Pts` column it invites exactly the misreading in section 3.

Spec:

| Property | Decision |
|---|---|
| Column header | `X£ gap` |
| Value | `fair − price`, one decimal |
| Sign | Positive means under-priced, i.e. worth more than he costs |
| Format | `+1.5`, `−2.0`, `0.0`. Explicit plus sign |
| Colour | Green above `+0.5`, pink below `−0.5`, white between. Reuses the existing tone rule |
| No data | `No data`, never a number. Driven by `sourceOf(p) === "none"` |
| Absolute X£ | Player page only, beside real price, where there is room to show both |
| Sort | On the gap, descending, so the biggest bargains lead |

## 7. Input window

**No new logic needed, and no discontinuity, because `scoreOf` already handles this. CONFIRMED.**

| Period | What `scoreOf` uses |
|---|---|
| Pre-season | Prior-season points per 90 from the archive, shrunk toward the position mean by `n/(n+24)`, times expected minutes. Understat xG+xA per 90 as the fallback. Promotion factor 0.7511 applied per position |
| GW1 to 5 | Blend of prior-season rate and current-season rate, weight `m/(m+1000)` where `m` is minutes played this season. At GW3 with 270 minutes the current season carries 21% |
| GW6 onward | Same formula, current season progressively dominates. At 1,000 minutes it is 50%, at 2,000 it is 67% |

The transition is continuous by construction: one formula, one fitted constant, weight moving with
minutes. **The `k = 1000` value is fitted** (`config/fitted-params.json`, grid search on eight
training transitions), so this is not a hand-tuned ramp.

One change needed: X£ must exclude players whose `sourceOf` is `"none"` from the ranking entirely,
rather than ranking them at zero. Otherwise the pre-season ladder is dominated by 380 players who
have no data.

## 8. Sanity test on your thirteen rows

Ranking by season points as a stand-in for projected output, and using these thirteen prices as the
ladder. **On the full 558-player pool the spread will be wider**, because the ladder has more rungs.

| Player | Pos | Price | Pts | Output rank | X£ | X£ gap |
|---|---|---|---|---|---|---|
| Haaland | FWD | 15.5 | 239 | 1 | **15.5** | 0.0 |
| B.Fernandes | MID | 12.0 | 235 | 2 | **12.0** | 0.0 |
| Gabriel | DEF | 8.0 | 209 | 3 | **8.0** | 0.0 |
| Rice | MID | 7.5 | 184 | 4 | **7.5** | 0.0 |
| Guéhi | DEF | 6.0 | 179 | 5 | **7.5** | **+1.5** |
| João Pedro | FWD | 7.5 | 177 | 6 | **7.5** | 0.0 |
| Rogers | MID | 7.5 | 169 | 7 | **7.0** | −0.5 |
| Raya | GK | 6.0 | 162 | 8 | **6.5** | **+0.5** |
| Szoboszlai | MID | 7.0 | 160 | 9 | **6.0** | **−1.0** |
| O'Reilly | DEF | 6.5 | 160 | 10 | **6.0** | −0.5 |
| Pedro Porro | DEF | 5.5 | 117 | 11 | **6.0** | **+0.5** |
| Dubravka | GK | 4.0 | 96 | 12 | **5.5** | **+1.5** |
| Brobbey | FWD | 6.0 | 92 | 13 | **4.0** | **−2.0** |

**Haaland 15.5, Guéhi 7.5. Eight apart. The design passes the test.**

Reads sensibly throughout: Guéhi at 6.0 with 179 points is the clearest bargain, Brobbey at 6.0 with
92 points the clearest trap, and nothing is pinned at a ceiling.

---

# JOB 2 — THE FOUR-BATCH ROADMAP

## Correcting the premise

Your premise is right. **CONFIRMED**: `jobs/baseline_gate.mjs` line 6 states it grades the interim
scorer, not the engine, because no historical odds snapshots exist. The five-layer engine has never
been measured against anything.

**Ceiling reachable in four to five prompts:** every known structural fault fixed, every uncalibrated
confident-looking output either calibrated or removed, X£ rebuilt, and odds snapshots being stored
from now on so the engine becomes backtestable after one season.

**Still unproven afterwards:** whether the engine beats its own fallback, or beats a free public
projection. That is not a work problem. It needs a season of odds snapshots that do not exist yet.

**Is "best points predictor in the game" reachable?** No.

**The honest target:** a correct, internally consistent Tier 2 model with its known faults fixed, its
unverifiable claims deleted, and the instrumentation in place to prove or disprove itself after one
season. Competitive with good free public projections; not demonstrably better until measured.

## Ordering

By accuracy gain per prompt, not by ease.

| Batch | Immediate accuracy gain | Notes |
|---|---|---|
| 1 | High | Affects every projection involving an absence, and half the player list |
| 2 | Zero to output, high to trust | Removes actively misleading numbers, fixes X£ |
| 3 | Zero now, unlocks everything later | The only path to ever validating the engine |
| 4 | Moderate | Calibration plus chip timing |

Batch 3 has no immediate accuracy gain and I am not pretending otherwise. It is third rather than
first only because your GW1 deadline is 25 days away, so nothing irreversible is lost this week. If
that changes, it moves to first.

---

## Batch 1 — Reallocation and reconciliation

**Goal:** an absent player's role transfers instead of vanishing, and the fallback path reconciles to
team totals.

**Files touched:** `lib/engine/layer2_allocation.mjs`, `jobs/projections_run.mjs`,
`lib/solver/score.mjs`, `lib/projections.js`.
**Files created:** `tests/reconciliation.test.mjs`.

**What breaks if it goes wrong:** projections shift for every player at a club with an injury. A bad
reconciliation could scale a whole team's outputs wrongly, which would be visible as a club's players
all moving together.
**Rollback:** revert the four files; `role_reallocation.mjs` is currently unused so reverting removes
the change entirely.

**Verification, and what should move:**
- Sum allocated goal share per club. **Should equal 1.000 before and after introducing an absence.**
  It currently does on the engine path and does not exist on the fallback path.
- With a starter marked unavailable, his teammates' shares **must rise**, and the club total must stay
  at 1.000. Today they stay flat and the club total drops below 1.
- Baseline gate ranking: **should not move**, because the gate grades the fallback scorer on
  historical rows where availability is already known. If it moves materially, the reconciliation has
  changed something it should not have.

**New data needed:** none.

---

## Batch 2 — X£ rebuild and the deletions

**Goal:** X£ becomes a rank-mapped gap column, and every uncalibrated confident-looking output is
removed.

**Files touched:** `lib/xprice.mjs` (rewrite), `app/players/page.jsx`,
`app/player/[id]/PlayerPage.jsx`, `lib/insights.mjs`, `jobs/projections_run.mjs`, `components/Fan.jsx`.
**Files created:** none. **Files deleted:** `lib/harness.mjs`.

Deletions in this pass, per section 9 of the audit:

| Item | Action | Why |
|---|---|---|
| `p_12plus` display | **Remove from the UI**, keep the column in the database | Presented as a tail probability, never calibrated against frequency |
| Quantile band shown as a range | **Remove the visible band**, keep `ep_sd` stored | Simulation spread never checked against outcomes |
| `team_covariances` write | **Delete the write** | Written every run, read by nothing |
| `lib/harness.mjs` | **Delete** | Correct, unused, and a second implementation waiting to diverge from the four hand-rolled loops |

**What breaks if it goes wrong:** the Players table is the most-used screen; a bad rank map shows a
wrong X£ on every row. The deletions touch the captaincy fan and the feedback panel.
**Rollback:** revert the six files and restore `harness.mjs` from git history.

**Verification, and what should move:**
- **Players pinned at 16.0 must go from 6 of 13 to 0.** This is the headline check.
- **Players reading 3.8 with no data must go from roughly 60% to 0%**, replaced by `No data`.
- Haaland and Guéhi must be **more than 1.0 apart**. Expected around 8.0.
- Sum of X£ across any legal 15 must land inside the real price range, i.e. no squad valued above
  roughly 105 or below 60.
- Test count **rises**; the four X£ tests asserting per-position behaviour get replaced.

**New data needed:** none.

---

## Batch 3 — Timestamping and odds capture

**Goal:** make future validation possible, and stop losing odds forever.

**Files touched:** `jobs/fpl_bootstrap.mjs`, `jobs/odds_pull.mjs`, `jobs/baseline_gate.mjs`,
`jobs/minutes_scorecard.mjs`, `jobs/reliability.mjs`.
**Files created:** `supabase/migration-019.sql`, `tests/leakage.test.mjs`.

- `as_of` column on `history_player_gw`, backfilled from fixture kickoff.
- Daily snapshot of the mutable `players` fields into a new `player_snapshots` table, since `form`,
  `ppg`, `minutes` and `xg_fpl` are currently overwritten every six hours with no history.
- Persist every `odds_pull` result with its capture timestamp so a deadline-time market state is
  recoverable.
- A test that fails if any model job reads the live `players` table for a historical feature.

**What breaks if it goes wrong:** a migration on a 244k-row table. A bad backfill could set `as_of`
wrongly and quietly invalidate every future backtest.
**Rollback:** `as_of` is additive, so drop the column. The snapshot table is new. No existing read
path changes.

**Verification, and what should move:**
- **The baseline gate ranking should get slightly WORSE.** It is currently reading whole-season
  aggregates that a pre-deadline model could not have known.
- **If it does not move at all, we had no leakage on that path and I will say so plainly rather than
  claim a fix.** If it improves, something is wrong with the change and it gets reverted.
- `player_snapshots` row count should be roughly the live player count per day.
- `odds_snapshots` should gain rows on every scheduled run rather than being overwritten.

**New data needed:** none. It is all your own data, previously discarded.

---

## Batch 4 — Clean-sheet calibration and blank/double detection

**Goal:** calibrate the one engine probability that can be calibrated, and unlock chip timing.

**Files touched:** `app/analysis/AnalysisClient.jsx`, `lib/data.js`,
`components/TeamAndChips.jsx`.
**Files created:** `jobs/cs_calibration.mjs`, `supabase/migration-020.sql`,
`.github/workflows/cs-calibration.yml`, `tests/blankdouble.test.mjs`.

- Grade engine `p_cs` against actual clean sheets in the 2025/26 archive, now that both sides of every
  fixture and the scoreline are stored. Reliability bands, same shape as the existing report.
- Detect blank and double gameweeks from the fixtures table by counting fixtures per club per
  gameweek, and surface them in the chip planner.

**What breaks if it goes wrong:** the chip planner shows wrong blank or double flags, which is worse
than showing none. The calibration job is read-only against history.
**Rollback:** revert the three touched files; the new job and migration are additive.

**Verification, and what should move:**
- Clean-sheet reliability bands appear on Analysis with real counts. **If `p_cs` is well calibrated the
  bias per band sits inside ±0.05; the audit's expectation is that it will not, and that is the point
  of measuring.**
- Blank and double counts must match a manual check of the fixture list for two known gameweeks.
- The chip planner's "blanks and doubles are not shown" note **must be removed** once the detection is
  live, not left contradicting the new feature.

**New data needed:** none.

---

## Staying dead

Not to be quietly re-added: Dixon-Coles refinement (fitted, rejected on evidence, 272 goalless draws
against 230 expected but only 200 one-alls against 255), team strength ratings (2.4% worse than a flat
league mean out of sample), fatigue modelling (`wc_prior` null applies no effect, which is correct),
the in-app Analyst (payload export covers it).

---

## Uncertainties I am flagging rather than hiding

1. **The sanity table in section 8 uses season points as a stand-in for projected output**, because I
   cannot read your live `scoreOf` values from here. The ranking will differ somewhat. The mechanism
   and the Haaland-Guéhi separation will not.
2. **The 3.3% ceiling and 59.6% floor figures come from a reconstructed pool**, not your live table.
   The real numbers are in the same territory — six of your thirteen visible rows are pinned, which is
   46% of a top-ownership sample — but I have not queried your database.
3. **Batch 3's expectation that the gate score worsens is a prediction, not a certainty.** If it does
   not move, the honest conclusion is that the path was already clean, and I will report that rather
   than claim credit.
4. **The rank map assumes the real price distribution is a reasonable target shape.** If FPL's pricing
   is itself badly calibrated in a season, X£ inherits that. It is a relative index and cannot escape
   this.
