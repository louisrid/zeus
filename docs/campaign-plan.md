> **DATES SUPERSEDED.** Every deadline in this document was rewritten on 26 Jul 2026.
> The binding schedule is `config/schedule.json` and `docs/DECISIONS.md` section 14:
> working MVP 26 Jul, complete project 28 Jul 22:00. Any date below is indicative only.

# FPL 2026/27: The Definitive Campaign Plan (v-final)

Everything from every session, consolidated, plus the gaps found on final review: transfer-hit rules, bench/autosub optimisation, team value strategy, pipeline failure handling, international breaks, blank/double detection, and the fixes from two independent technical reviews (historical odds sourcing, credit maths, price-change timing, scraper fallbacks, launch-day rules verification, Free Hit, the GW19 gate, cron jitter, EO sourcing, audit discipline). Interaction model v3 (this revision): open-anytime and pull-based — you open the desktop tool when you want, press Refresh, and make every decision yourself; nothing is ever pushed at you; the on-demand Analyst answers only when you press Ask. This is the complete document.

## Objective and doctrine

- Sole goal: **#1 in the world.** Mini-league is a byproduct; any conflict resolves toward #1. Standing decision, logged.
- Four edges by decay speed: **BPS repricing** (dead ~October, extract by GW8), **World Cup fatigue** (dead ~GW5), **minutes model** (compounds all season), **rank-EV vs the actual field** (grows as rank improves). Effort follows leverage: minutes multiply everything, so minutes get the most investment.
- Dual **points-EV / rank-EV** lines on every decision, GW1 to GW38. Rank-EV wins divergences.
- **You make every call.** The tool is intelligence, not a boss: it never pushes, reminds, or notifies. Nothing auto-submits. Your actual picks are logged automatically every GW via your FPL team ID (public post-deadline endpoint, no login stored) with projections frozen at the deadline, and predicted-vs-actual for your choices is tracked across the season, scored in May.
- No invented numbers anywhere: sizes come out of the backtests on stated dates.

## Cost and architecture (hard cap $17/month)

| Piece | Tool | Cost |
|---|---|---|
| Database | Supabase free tier | $0 |
| Dashboard | Next.js on Vercel free tier | $0 |
| Scheduled jobs | GitHub Actions (+ Supabase cron for the post-deadline pick snapshot) | $0 |
| FPL data | Official public API | $0 |
| xG/shots | FBref + Understat scrapes; FPL-native xG as primary-ready fallback | $0 |
| Live odds | The Odds API free tier — credits = markets × regions per request, so h2h + totals in one region = 2 credits per pull; 2 pulls/week ≈ 16–20 credits/month, comfortably inside 500. No spreads, no extra regions, ever | $0 |
| Historical odds | football-data.co.uk free CSV archives (closing 1X2 + over/under, every EPL match, years back) | $0 |
| News/presser ingestion | Claude Haiku API | ~$3–6/mo |
| The Analyst | an OpenRouter model API, on-demand only — fires solely on your press, cost displayed per call, server-side monthly cap | ~$3–6/mo at expected usage |

**Cost rule, binding:** all squad scoring, projections, and evaluations are internally coded (SQL + arithmetic over stored engine output) against the database — **zero AI API calls** in the engine, evaluation services, Refresh path, or tool views. AI spend is exactly two things: the Haiku presser pipeline and the on-demand Analyst. Expected total ≈ $6–12/month against the $17 cap.

**Security rules, non-negotiable:** public read-only endpoints only; no stored FPL login, no credential automation, no session tokens; you enter transfers in the official app yourself. Supabase project locked down (RLS on, service key only in GitHub Actions secrets).

**Failure handling:** every scheduled job writes a heartbeat; the dashboard shows pipeline health and flags stale data. Fallback chain, explicit: **xG** — if FBref (aggressive rate-limiting, blocks scrapers) and Understat both die, Layer 2 runs on the official FPL API's per-player expected_goals and expected_assists; this fallback is built primary-ready, not as an afterthought. **Odds** — if The Odds API fails or the credit budget is at risk, Layer 0 falls back to football-data.co.uk's latest closing lines, so "market data stale" has a recovery path, not just a warning. A live Odds API credit counter sits on the model-health screen. You never make a decision on silently broken data.

## The projection engine (locked spec)

**EP = P(start) × E[pts|start] + P(cameo) × E[pts|cameo]**, cameo term explicit: 1pt appearance under 60', no CS eligibility, rates scaled to expected sub length from the manager's sub-timing history.

**Scoring table (verified at launch, see launch tasks):** goals 6/5/4 (GK-DEF/MID/FWD); assists 3; CS 4 GK/DEF, 1 MID; −1 per 2 conceded (GK/DEF); saves 1 per 3; DefCon 2pts at thresholds (10 CBIT DEF, 12 CBIT+recoveries MID); appearance = 2×P(60+) + 1×P(1–59).

- **Layer 0 — market:** strip overround from 1X2 + over/under, solve the two Poisson means reproducing both → implied team xG for/against. Live source: The Odds API; backtest and fallback source: football-data.co.uk archives. Market wins all team-level disagreements; our edge is intra-team allocation, which bookmakers don't price.
- **Layer 1 — scoreline:** Dixon-Coles fitted to market means → joint scoreline distribution; P(CS) inherited weighted by **P(60+)**; game-state distribution drives saves/DefCon/attacking volume.
- **Layer 2 — allocation:** goal rate = team λ × shrunken npxG share (empirical Bayes toward positional priors, adjusted for role changes and opponent zonal weakness); **full Poisson over goal counts** so braces/hat-tricks are priced; **penalty EV broken out** (P(pen to team) × duty probability × conversion), duty updated every presser and every kick; finishing-skill shrinkage on career goals−xG, small and bounded; xA conditioned on opponent, scaled by finisher quality.
- **Layer 3 — minutes as hazard:** P(start), sub-on/off hazard curves by manager and game state, P(60+). Inputs: manager rotation priors from historical lineups, presser signals, congestion (days rest, upcoming cup ties), **World Cup load flags GW1–4**.
- **Layer 4 — joint simulation:** draw scoreline, allocate events, generate shots faced/saves/CBIT/cards by game state, **run the 2026/27 BPS race inside each simulated match** (saves +2 any/+1 in-box/+1 big chance, tackle penalty removed, CBI 1-per-3). Bonus is a 22-player rank competition; only joint simulation prices it. Negatives explicit: cards × −1, own-goal and pen-miss EVs from per-90 rates.
- **Output:** full distribution + teammate covariance per player. Spiky 5.0 ≠ steady 5.0; captaincy consumes tails, bench consumes floors, triple-ups are priced as the correlated bets they are.
- **Calibration:** walk-forward over three seasons (train through GW t, predict t+1) with **historical closing odds from football-data.co.uk powering Layer 0 throughout**, so the ablation ladder is validated end to end; log-loss on binaries, CRPS on distributions, reliability curves per bucket; benchmarked against naive, market-only, and one public projection source; **any layer that doesn't beat the previous one out-of-sample is cut**. Live: same metrics weekly, degrading components re-fit, BPS component re-validated against live bonus through October. **Model versioning:** every solve stamped with model version + data snapshot + verified ruleset version, so any recommendation can be reproduced and audited.
- **Ceiling, stated once:** single-week projection-to-actual correlation tops out ~0.3–0.4. Accuracy is real in the ranking and the 38-week sum. Trust the ordering, decide on the distributions, treat no single gameweek as evidence of anything.

## Decision rules

- **Transfer hits:** a −4 is taken only when the solver's expected gain over the planning horizon clears the cost with margin; threshold set from the calibration run (28 Jul), applied mechanically. Default posture: bank toward the 5-cap, especially GW1–4 when noise is highest.
- **Captaincy:** differential taken when within the points-EV tolerance (set from backtest, 28 Jul) and materially lower in effective ownership. Vice-captain chosen by EV-if-captain-blanks, not habit.
- **Bench order and autosubs:** optimised on floor EV × P(non-start of starters), not on projected points alone. Formation-legal autosub paths checked in the solve.
- **Team value:** early-season price rises are real but secondary; the solver never chases value at the cost of points-EV, but ties break toward the rising asset. The price-risk jobs (timing below) surface rise risk on the News page before changes fire, protecting planned transfers from overnight rises.
- **Effective ownership:** aggregated top-10k EO from a **LiveFPL-equivalent scrape — a named build task, not an assumption**, since the official API only exposes overall ownership. Built and validated pre-season. **Live rival-squad sampling switches on when you cross 50k**, at which point the solver optimises against the specific squads above you, including deliberate anti-correlation on captains and chips where the maths supports it.

## Automation pipeline

- **Early evening (~18:00):** FPL API pull with **rise-prediction signal** — net transfer velocity per player from the API — so rise-risk flags for held or targeted players land on the News page **while transfers can still be made ahead of a rise**, not after it.
- **Nightly 03:00** (moved from 00:30 — FPL price changes fire ~01:30–02:30 UK, so the pull now learns them the moment they've landed): prices, flags, ownership, fixtures; overnight-change digest to the News page.
- **Wed:** xG/shot refresh, projection re-fit.
- **Thu:** odds pull #1 (h2h + totals, one region, 2 credits), first-pass GW projections.
- **Fri AM:** presser ingestion (Haiku → structured minutes signals: out/doubt/rested/confirmed), odds pull #2 (2 credits), full projection + evaluation refresh (transfer comparisons, captaincy, chip placements, hit evaluation all pre-computed), dual EV lines throughout — written silently to the database. Nothing is pushed; it's all sitting there whenever you open the tool.
- **On-demand Refresh:** one button in the tool re-pulls FPL API data (prices, flags, ownership, fixtures, live points) whenever you want it, debounced; **odds stay on the scheduled pulls to protect credits**, with their vintage always visible on the freshness strip.
- **Cron jitter, stated position:** GitHub Actions schedules can run 15–60 minutes late at peak — acceptable for every job, because nothing user-facing is deadline-critical any more. **There are no notifications of any kind, by design**; deadline awareness is a passive countdown in the tool header, and deadlines are your responsibility on purpose. The one punctuality-sensitive job — the post-deadline pick snapshot that feeds the tracker — runs on Supabase cron (still $0), which fires promptly.
- **Post-deadline:** your submitted squad is logged automatically to the pick tracker (projections frozen at the deadline, predicted total computed and never revised) + rival snapshots from the public API; live GW view on.
- **Mon:** auto-audit — **systematic misses only**: attribution runs on rolling calibration drift over multi-week windows, per component; single-week misses are logged as variance and explicitly not "explained." Forcing attribution onto noise breeds false lessons, so the audit refuses to do it.
- **Cup-schedule watcher:** monitors FA Cup/League Cup rounds and fixture announcements; flags emerging blanks and doubles the day they become knowable, feeding the chip simulator automatically. This watcher exists primarily to serve **Free Hit and Bench Boost timing**.
- **International breaks:** injury-news ingestion continues through breaks; a break-return report lands the Friday after (who travelled, who played 180 minutes, who's flagged).

## The tool (yours alone)

Next.js, premium dark, FPL-official-but-elevated (Premier League purple/green DNA), **desktop-only — designed for a big display, no mobile compromises**, no auth gate (personal tool at an unguessable URL; metered routes capped server-side). **Open-anytime, pull-based:** you open it whenever you want and press one **Refresh** button that updates all data on demand (FPL API refreshes on demand; odds stay on the scheduled pulls to protect credits). No decision docs, no accept/override ceremony, no notifications — **the tool is intelligence, not a boss**. It logs your picks each GW automatically via your team ID and tracks predicted vs actual for your choices over the season. All scoring, projections, and evaluations are computed internally against the database — zero AI calls; AI spend is only the presser pipeline and the Analyst. Six pages: **Dashboard** (quadrant of large cards: trending back-to-back form, my team projected-vs-actual with lineup graphic, fixture swings, player-database preview with inline position filter). **Squad Builder** — the flagship, for the GW1 squad from zero and every Wildcard/Free Hit: Guided (structure from historical + current-season evidence, then position group by position group with ranked candidates), Free Build (assemble anything, live evaluation), Drafts (save versions, compare side by side); every draft gets exactly four live readouts — projected points with a 1–12 GW horizon slider, captaincy strength, risk flags, structure. **Squad** (pitch view of the current 15 with projections on shirts; captaincy comparison and chip tools built in; click any player for sell/replace comparisons). **Players** (full database, filters and sorts including points-per-price, expert-grade raw data, profiles with distribution, next 6 fixtures, form, minutes risk). **Analysis** (the deep page: best formations historically and this season, value by position and price band, budget structures, template vs differential, top-manager behaviour — the strategy study's findings live here as data and set the Guided builder's defaults). **News** (injuries, presser signals, price changes — kept off the dashboard). Plus **the Analyst**: an Ask action on every screen — on-demand model, fires only on your press with cost displayed per call, context assembled by code (squad, projections with distributions, fixtures/odds, strategy findings, its own database-resident memory of your season), a verbatim quant-analyst system prompt in the build spec, and a Copy Analyst Payload button that puts the identical context on the clipboard for your own Claude Project at zero API cost. Fun is a requirement: the GW1 pure/moderate/spicy variants live as Builder drafts, everything visual, nothing hidden.

## Chip strategy

Two sets of four (Wildcard, Free Hit, Triple Captain, Bench Boost); first set expires at the GW19 deadline, 2 January. **First set:** Wildcard on the fixture swing the simulation names by end of September; TC and BB placed by simulation inside the hard expiry, nothing dies unused; **Free Hit held for the best single-week dislocation in the half — an early blank, a fixture pile-up, or a week where the solver finds a one-week team miles from your own; if no dislocation emerges, the sim burns it on the highest single-GW EV before 2 January rather than letting it expire.** **Second set:** deliberately unallocated until the cup-watcher confirms the blank/double structure; **Free Hit is the primary blank-GW weapon** and Bench Boost the double-GW weapon, Wildcard positioned to build into the doubles, TC on the best double-fixture captain the simulation finds. Committed the moment the structure is knowable and not a week later than optimal.

## Season timeline

**Now → launch (28 Jul):** data spine live; **BPS backtest delivered 28 Jul** (repricing table with per-player sizes: keepers up, dribblers up, DefCon CBs down, plus the captaincy threshold and hit threshold); **fatigue study delivered 28 Jul** (2018/19 deep-run comp → GW1–4 load prior, or the finding that the market's fear is a buyable discount, either is actionable); **strategy study delivered 28 Jul** — (a) top-manager behaviour from community-scraped archives of historical top-10k picks plus champions' season summaries from the FPL API history endpoint (past seasons' week-by-week picks are not available from the official API, so sourcing is explicit), (b) structural analyses on the vaastav historical dataset (best formations by season, value by position/price band, budget structures, bench spend vs return), (c) one web-research synthesis of proven high-rank strategy findings — landing on the Analysis page as data and setting the Guided builder's defaults; football-data.co.uk archives loaded and Layer 0 backtest validated on them; EO scrape built and validated.

**Launch day, named task — full rules verification:** re-read the official FPL rules page and verify the complete scoring table, every BPS value, DefCon thresholds, and the entire chip ruleset (confirm the two-set structure carried over as announced, confirm whether Assistant Manager or any new chip exists in 2026/27). Stamp the model version with the verified ruleset and update the chip simulator **before the GW1 draft ships**. One wrong hard-coded value poisons every projection silently; this task exists so that can't happen. Prices/positions ingested same day with same-day mispricing flags.

**Launch → GW1 (~28 Jul):** three-season calibration run with layer ablation on historical odds; minutes model v1 with friendlies feeding daily; tool v1 (Dashboard + Squad Builder minimum); **GW1 draft: three variants built and compared in the Builder's Drafts mode, you pick the opening posture, 28 Jul**; first-set chip skeleton from confirmed fixtures; rival scraper built, validated on 2025/26, parked for the 50k trigger.

**GW1–8, extraction:** spend the BPS and fatigue edges in full: premium keeper, tackled-dribbler mids, DefCon CBs only where DefCon points alone justify price. Bank transfers, off-template captaincy from week one when the threshold triggers, Monday audits validating repricing against live bonus.

**GW9–19, first chip burn:** campaign runs on minutes + rank-EV. Wildcard window held to unless injuries force early; TC, BB, and first Free Hit placed by simulation inside the 2 January expiry. Rival sampling live if rank justifies. **GW19 variance gate, pre-committed now:** from ~11M entrants, rank 1 requires being roughly top 50k by mid-season to be live at all. If outside ~100k at GW19, the rank-EV weighting ramps **then**, on a schedule agreed in writing before GW15 — higher-variance captains and structures immediately, not in March. Inside 100k, the standard weighting holds to the second gate.

**GW20–38, the run:** second chip set deploys when the cup-watcher confirms the blank/double structure — Free Hit onto the blank, Bench Boost onto the double — not a week later than optimal. Solver objective sharpens to beating the specific managers above you. **GW28 checkpoint, signed in writing by GW25 (the second gate):** inside the threshold → variance ramps further on the pre-committed schedule; outside → finish clean as a validation run and enter 2027/28 with a proven machine. Both branches chosen now so neither becomes a tilt.

**GW38 + one week:** season review delivered: final calibration report, pick tracker settled (where your judgement beat the projections and where it didn't), edge post-mortem, and the 2027/28 build list.

## Your workload

None required, ever. You open the tool whenever you feel like it, press Refresh, and read; every projection, comparison, and chip placement is pre-computed and waiting, and the Analyst answers on demand when you press Ask — cost shown per call, or free via the payload-copy route into your own Claude Project. Decisions are yours alone, made in the official FPL app in a couple of minutes when you choose. Picks are logged and settled automatically whether you show up or not. Typical sessions: a 2-minute check-in, a 10-minute transfer think, a longer Builder session for a Wildcard or Free Hit. The machine does the hours; you keep the game — and it never taps you on the shoulder.

## First two weeks

**Week 1:** Supabase schema + FPL/FBref/Understat ingestion live, with the FPL-native xG fallback wired from day one; football-data.co.uk archives loaded; 2025/26 event archive loaded; **BPS backtest out 28 Jul**; odds pipeline tested with the credit counter live; heartbeat monitoring on from day one.
**Week 2:** **fatigue study out 28 Jul**; **strategy study out 28 Jul**; minutes model v1; calibration + ablation complete on historical odds; EO scrape validated; tool v1 on Vercel (Dashboard + Builder); **three GW1 variants out 28 Jul as Builder drafts** (after launch-day rules verification stamps the ruleset); chip skeleton v1 including Free Hit; Analyst v1 live with memory and payload export; rival scraper parked and armed.

The field opens on last season's BPS, season-average xG, gut-feel minutes, and template captains. You open with market-priced fixtures backtested on years of closing lines, a repriced bonus model, a minutes engine, correlated simulations, rise-risk flags that land before the price moves instead of after, a quant analyst on call that learns your season, and an interface nobody else on the planet has — for less than a round at the pub each month. Say go; the schema gets built today.
