> **DATES SUPERSEDED.** Every deadline in this document was rewritten on 26 Jul 2026.
> The binding schedule is `config/schedule.json` and `docs/DECISIONS.md` section 14:
> working MVP 26 Jul, complete project 28 Jul 22:00. Any date below is indicative only.

# 01 — Architecture and Model

Implements the "projection engine (locked spec)", "calibration", and architecture commitments in `docs/campaign-plan.md`. No strategy content here; if a design decision looks strategic, the campaign plan is authoritative.

**Consistency check:** no contradictions found between this document and the campaign plan. All dates, thresholds, and layer definitions match.

**Stack decision (binding):** Python 3.12 for ingestion, engine, and solver (numpy, scipy, pandas, lightgbm, supabase-py). TypeScript / Next.js (App Router) for the dashboard. Supabase Postgres as the single datastore. GitHub Actions + Supabase cron (pg_cron) as schedulers.

---

## 1. System architecture

```
                        ┌────────────────────────── SOURCES ──────────────────────────┐
                        │                                                              │
  FPL official API      Understat        FBref         The Odds API    football-data  │
  (bootstrap-static,    (shot/xG JSON)   (match logs,   (live 1X2 +     .co.uk         │
   fixtures, element-                     rate-limited)  totals)        (historical    │
   summary, event/live,                                                  closing odds) │
   entry picks)                                                                        │
        │                   │                │               │               │         │
  Team-news pages (FFS team news, BBC injuries, Sky Sports) ──► Haiku presser pipeline │
        │                   │                │               │               │    │    │
        ▼                   ▼                ▼               ▼               ▼    ▼    │
┌───────────────────────────────── INGESTION (src/ingestion, GH Actions) ─────────────┐
│ per-source clients · retries · fallback chain · heartbeat write · credit counter    │
└──────────────────────────────────────────┬──────────────────────────────────────────┘
                                           ▼
┌─────────────────────────────── SUPABASE POSTGRES ───────────────────────────────────┐
│ raw + derived tables (schema §2) · pg_cron for deadline-critical triggers · RLS on  │
└──────────────────────────────────────────┬──────────────────────────────────────────┘
                                           ▼
┌──────────────────────────────── ENGINE (src/engine) ────────────────────────────────┐
│ Layer 0  odds → implied team goals (market)                                         │
│ Layer 1  Dixon-Coles joint scoreline + game-state trajectories                      │
│ Layer 2  intra-team allocation (npxG shares, pens, finishing, xA)                   │
│ Layer 3  minutes hazard model (P(start), sub curves, P(60+))                        │
│ Layer 4  joint match simulation incl. BPS race → per-player distributions + covar   │
│ Calibration harness (walk-forward, CRPS, reliability, ablation)                     │
└──────────────────────────────────────────┬──────────────────────────────────────────┘
                                           ▼
┌────────────── EVALUATION + SOLVER (src/solver — pure SQL/numpy, zero AI calls) ─────┐
│ squad evaluation (four readouts) · transfer comparison · captain/vice · bench order │
│ hit evaluation · chip season-sim · field model (EO proxy / rival squads)            │
│ → dual points-EV + rank-EV on every evaluation                                      │
└──────────────────────────────────────────┬──────────────────────────────────────────┘
                                           ▼
┌───────────────────────── TOOL (Next.js on Vercel, desktop-only) ────────────────────┐
│ dashboard · squad builder (guided/free/drafts) · squad · players · analysis · news  │
│ on-demand Refresh route (FPL pulls only; odds excluded) · live GW via Vercel proxy  │
│ THE ANALYST: Ask route → payload builder → an OpenRouter model (on-press only, capped)    │
│              + Copy Analyst Payload export (same builder, zero cost)                │
│ writes back: squad drafts, chip plan, analyst calls/memory · pick tracker fed by    │
│              the team-ID post-deadline snapshot                                     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Data flows one way: sources → ingestion → Postgres → engine → evaluation/solver → tool. The tool writes only squad drafts, the chip plan, and Analyst call/memory rows back to Postgres; the pick tracker (`gw_picks`) is fed automatically by the post-deadline snapshot using the configured FPL team ID (`FPL_ENTRY_ID` — a public number, not a credential). Every interactive computation in the tool is SQL + arithmetic over stored engine output — zero AI calls; the only AI spends are the scheduled Haiku presser pipeline and the on-press Analyst (an OpenRouter model, server-capped, doc 02 §9). There is no login gate: the browser holds a read-only anon key; writes and metered actions run through server routes holding the service keys. Nothing in the system holds FPL credentials; the only secrets are the Odds API key, Anthropic API key, and the Supabase service key, all stored in GitHub Actions / Vercel / Supabase secret stores.

---

## 2. Supabase schema draft

Conventions: `id` = bigint identity PK unless stated; timestamps are `timestamptz` UTC; `model_version` is a text tag like `v1.3+ruleset-2026.27.1`. RLS enabled on all tables. **Access model (no login gate):** the browser uses the anon key under read-only RLS policies on every table; all writes — `squad_drafts`, `chip_plan`, `analyst_calls`, `analyst_memory`, picks and settlements — happen in server routes and jobs holding the service key.

### Reference / raw

| Table | Key columns | Notes |
|---|---|---|
| `teams` | `id`, `fpl_id` (unique), `name`, `short_name` | From bootstrap-static. |
| `players` | `id`, `fpl_id` (unique), `team_id` FK, `position` (GKP/DEF/MID/FWD), `name`, `web_name`, `price` numeric(4,1), `status`, `chance_of_playing`, `news`, `selected_by_pct`, `updated_at` | Current snapshot; history in `player_price_history` and `player_gw_stats`. |
| `gameweeks` | `id`, `gw` int unique, `deadline_utc`, `finished` bool, `data_checked` bool, `is_blank` bool, `is_double` bool | `deadline_utc` drives Supabase cron triggers. |
| `fixtures` | `id`, `fpl_id` unique, `gw` FK, `home_team` FK, `away_team` FK, `kickoff_utc`, `finished`, `home_goals`, `away_goals` | Blank/double detection reads this. |
| `player_match_stats` | PK (`player_id`,`fixture_id`); `minutes`, `goals`, `assists`, `xg`, `xa`, `shots`, `shots_on_target`, `key_passes`, `saves`, `goals_conceded`, `clearances_blocks_interceptions`, `tackles`, `recoveries`, `defcon_points`, `yellow`, `red`, `own_goals`, `pens_taken`, `pens_scored`, `pens_saved`, `bps`, `bonus`, `total_points`, `started` bool, `sub_on_min`, `sub_off_min`, `source` | The event archive. Populated from FPL element-summary + event/live, enriched with Understat shot data. Covers 2023/24–2026/27; 2018/19 loaded separately for the fatigue study. |
| `shots` | `id`, `player_id`, `fixture_id`, `minute`, `xg`, `situation`, `result`, `is_penalty`, `is_big_chance`, `source` | Understat shot-level; feeds npxG shares and save-quality splits. |
| `player_gw_points` (view) | per (`player_id`,`gw`): points, minutes, goals, assists, cs | Derived view over `player_match_stats`; powers form bars and season counters everywhere in the UI. |
| `lineups` | PK (`fixture_id`,`player_id`); `started`, `sub_on_min`, `sub_off_min`, `manager_id` FK | Derived view over `player_match_stats`; feeds rotation matrices. |
| `managers` | `id`, `team_id` FK, `name`, `appointed_date` | Rotation priors are per manager, not per club. |

### Market / odds

| Table | Key columns | Notes |
|---|---|---|
| `odds_snapshots` | `id`, `fixture_id` FK, `source` ('oddsapi'/'footballdata'), `fetched_at`, `h`, `d`, `a`, `over25`, `under25`, `bookmaker` | Raw decimal odds. |
| `implied_goals` | `id`, `fixture_id` FK, `odds_snapshot_id` FK, `lambda_home`, `lambda_away`, `deoverround_method`, `fit_residual`, `computed_at` | Layer 0 output. |
| `api_credits` | `id`, `source`, `used`, `remaining`, `captured_at` | From Odds API response headers on every call; powers the dashboard counter. |

### Signals / forecasts

| Table | Key columns | Notes |
|---|---|---|
| `presser_signals` | `id`, `player_id` FK, `gw`, `signal` ('out'/'doubt'/'rested'/'confirmed'), `confidence` numeric, `source_url`, `summary`, `captured_at` | Haiku output (schema in doc 02 §6). |
| `set_piece_duty` | `id`, `team_id` FK, `player_id` FK, `kind` ('pen'/'fk_direct'/'corner'), `rank` int, `as_of`, `source` ('presser'/'observed') | Full taker hierarchy per team, all three kinds; updated by the presser pipeline + observed kicks. Penalties are the most concentrated point source in the game — this powers the Set-piece matrix (C-13). |
| `minutes_forecasts` | PK (`player_id`,`gw`,`model_version`); `p_start`, `p_cameo`, `p60`, `exp_min_start`, `exp_min_cameo`, `wc_load_flag` bool | Layer 3 output. |
| `projections` | PK (`player_id`,`gw`,`model_version`); `ep_mean`, `ep_sd`, `p_goal`, `p_assist`, `p_cs`, `e_bonus`, `e_defcon`, `quantiles` jsonb (p5/p25/p50/p75/p95), `p_12plus`, `ep_home`, `ep_away`, `prior_blend` numeric (0–1, promoted-prior weight; UI shows the low-sample marker while > 0), `computed_at` | Layer 4 summary per player, incl. venue-conditioned xP and promoted-prior blend weight. |
| `sim_artifacts` | `id`, `gw`, `model_version`, `fixture_id`, `payload_path` | Pointer to compressed per-sim matrices (stored in Supabase Storage) used for covariance and rank-EV; summary covariances also in `team_covariances` (`gw`, `model_version`, `team_id`, `matrix` jsonb). |

### Prices / ownership / field

| Table | Key columns | Notes |
|---|---|---|
| `transfer_velocity` | `id`, `player_id` FK, `captured_at`, `transfers_in_event`, `transfers_out_event`, `net_rate_per_hr`, `rise_risk` ('low'/'med'/'high') | From evening + nightly pulls; powers pre-rise alerts. |
| `player_price_history` | `id`, `player_id` FK, `date`, `old_price`, `new_price` | Detected by the 03:00 pull diff. |
| `eo_snapshots` | PK (`gw`,`scope`,`player_id`); `eo` numeric, `captured_at`; `scope` in ('overall','top10k_proxy','top1k_proxy') | Overall from bootstrap; top-10k from the EO scrape (doc 02 §2.7). |
| `rival_squads` | PK (`gw`,`entry_id`); `rank`, `picks` jsonb, `chip` text, `captured_at` | Post-deadline public API; sampling armed at 50k trigger. |
| `my_squad` | PK (`gw`); `entry_id`, `picks` jsonb, `bank`, `team_value`, `chip`, `captured_at` | Louis's own team, read from the public post-deadline endpoint. |

### Decisions / ops

| Table | Key columns | Notes |
|---|---|---|
| `strategy_findings` | `id`, `study_version`, `section` ('structures'/'value_bands'/'premium_count'/'ownership'/'behaviour'), `payload` jsonb, `computed_at`, `next_refresh_gw` | Output of the strategy study job (B-18); the Analysis page renders these rows directly — every number on that page maps here. |
| `transfer_plans` | `id`, `moves` jsonb (array of {gw, out_player_id, in_player_id}), `ft_banked_path` jsonb (per-GW banked FT count toward the 5-cap), `eval` jsonb (projected gain per move, hits), `conflict_flags` jsonb (price-change / fixture-swing collisions), `status` ('active'/'done'/'abandoned'), `created_at`, `updated_at` | Multi-GW transfer planner (C-15). |
| `squad_drafts` | `id`, `name`, `mode` ('guided'/'free'), `squad` jsonb (15 picks + intended XI/captain), `eval_cache` jsonb (four readouts, invalidated on new projections), `is_plan_of_record` bool, `created_at`, `updated_at` | Squad Builder drafts; the GW1 pure/moderate/spicy variants live here. |
| `gw_picks` | PK `gw`; `entry_id`, `picks` jsonb (XI + bench order), `captain`, `vice`, `chip`, `frozen_projections` jsonb (per picked player, snapshotted at the deadline), `predicted_total` (computed once, never revised), `actual_total`, `settled_at`, `captured_at` | The pick tracker: written by the team-ID post-deadline snapshot (`entry_id = FPL_ENTRY_ID`), settled by the Monday audit after scores finalise. |
| `analyst_memory` | `id`, `gw`, `kind` ('decision_outcome'/'pick_result'/'captaincy_outcome'/'component_miss'/'analyst_conclusion'), `payload` jsonb, `refs` jsonb, `created_by` ('system'/'analyst'), `created_at` | The Analyst's season memory (doc 02 §9.2): post-GW audit appends system records; the Ask route appends parsed `MEMORY` blocks from responses. Read into every payload, token-capped, recency/relevance ordered. |
| `analyst_calls` | `id`, `asked_at`, `screen`, `question`, `payload_tokens`, `output_tokens`, `cost_usd`, `response` text, `memory_written` bool | One row per Ask press; powers the per-call cost display, the month-to-date spend meter, and the server-side monthly cap. |
| `chip_plan` | `id`, `chip_set` (1/2), `chip`, `planned_gw`, `status` ('skeleton'/'committed'/'played'/'expired'), `updated_at` | Both sets; set 1 hard expiry read from rules JSON. |
| `calibration_metrics` | `id`, `model_version`, `component`, `metric` ('logloss'/'crps'/'reliability_bucket'), `window`, `value`, `computed_at` | Backtest + live monitoring. |
| `pipeline_heartbeats` | PK `job_name`; `last_success_at`, `last_run_at`, `status`, `message` | Every job upserts; the status sheet reads. |
| `rulesets` | PK `version`; `verified_at`, `payload` jsonb, `notes` | `config/rules-2026-27.json` is loaded here at deploy; launch-day verification flips statuses and bumps version. |
| `model_versions` | PK `version`; `created_at`, `git_sha`, `data_snapshot_at`, `ruleset_version`, `notes` | Reproducibility stamp on every solve. |

---

## 3. The projection engine, implementable detail

All scoring/BPS/DefCon constants are read from `config/rules-2026-27.json` (via the `rulesets` table) at runtime. Nothing below hard-codes a rule value.

### 3.0 Layer 0 — market-implied team goals

Input: latest `odds_snapshots` row per fixture (h, d, a, over25, under25).

1. **De-overround 1X2** with the power method: find `k` such that `Σ_i (1/o_i)^k = 1`; implied `p_i = (1/o_i)^k`. If the solver fails to converge (tolerance 1e-8, bisection on k ∈ [0.5, 2]), fall back to proportional normalisation `p_i = (1/o_i) / Σ (1/o_j)` and record `deoverround_method`.
2. **De-overround totals** (two-outcome) proportionally → `p_over`.
3. **Solve (λh, λa):** minimise weighted squared error between model-implied `{P(H), P(D), P(A), P(total > 2.5)}` and market `{p_H, p_D, p_A, p_over}` where model probabilities are computed from the Dixon-Coles grid (§3.1) with ρ fixed at its calibrated value. Optimise over `(log λh, log λa)` with L-BFGS-B; initialise from the totals line (find `m` with `P(Poisson(m) > 2.5) = p_over`, split `m` between home/away by the H/A win-probability ratio). Store `fit_residual`; residual above the calibrated tolerance flags the snapshot for review on the health page.

Backtest mode uses football-data.co.uk closing lines identically — same code path, `source='footballdata'`.

### 3.1 Layer 1 — Dixon-Coles scoreline model

- Joint PMF: `P(x, y) = τ(x, y) · Pois(x; λh) · Pois(y; λa)` with the standard DC low-score correction `τ` applying to (0,0), (1,0), (0,1), (1,1) via parameter ρ.
- **ρ is fit once per calibration run** by maximum likelihood over the three historical seasons, using each match's *historical-odds-implied* (λh, λa) from Layer 0 — so ρ captures residual low-score dependence beyond what the market means explain. Re-fit at each walk-forward step; live value frozen per model version.
- Score grid: 0–10 goals each side (mass beyond is negligible; verify in calibration and record truncation error).
- Outputs per fixture: full scoreline distribution; `P(CS_home) = P(y=0)`, `P(CS_away) = P(x=0)`; expected goals conceded distribution for the −1-per-2 term.
- **Game-state trajectories:** for each simulated scoreline (Layer 4), goal times are drawn as an inhomogeneous-free simplification — order statistics of Uniform(0, 94) per goal (calibrate against archive goal-minute distribution; if archive shows material late-goal skew, switch to the empirical minute distribution). From goal times, compute each team's time spent leading/level/trailing; these shares condition shots faced, CBIT, and attacking volume in Layer 4.

### 3.2 Layer 2 — intra-team allocation

- **npxG share:** raw share `s_i` = player npxG / team npxG over trailing window (current season, backfilled with prior season decayed ×0.5). Shrinkage: `share_i = (m_i·s_i + k_pos·π_pos) / (m_i + k_pos)` where `m_i` = 90s played in window, `π_pos` = positional prior (computed from archive: average share by position bucket), `k_pos` tuned by cross-validation in the calibration harness. Shares renormalise to 1 within expected XI. Manual role-change flags (new signing, position change) reset `m_i` toward 0 so the prior dominates until evidence accumulates.
- **Goals:** player goal count | team scores `n` (non-pen): multinomial over shares. Marginal per-player goal distribution is Poisson-binomial mixture over the team goal distribution; Layer 4 handles this by simulation, so no closed form needed. Braces/hat-tricks priced automatically.
- **Penalties:** `pen EV = P(pen awarded to team in fixture) × P(player takes) × conversion`. `P(pen to team)` = team per-match pen-award rate from archive, adjusted for opponent's box-defending style (opponent pens conceded per match, shrunk to league mean). `P(player takes)` from `pen_duty` rank (rank 1 gets duty probability estimated from archive duty-holder consistency; updated on every presser signal and every observed kick). Conversion = league prior computed from the archive, shrunk toward player's own record by attempt count. No hard-coded conversion number anywhere.
- **Finishing skill:** multiplier `1 + w·r_i` on scoring probability where `r_i` = career (G − xG)/xG, `w = n_shots/(n_shots + K)`, `K` tuned in calibration, multiplier clamped to a bounded range set in calibration (spec intent: small; the clamp value comes out of the backtest, not this doc).
- **Assists:** xA/90 conditioned on opponent (opponent xGA style adjustment), scaled by expected finisher quality of teammates (team conversion vs league). Assist events allocated in simulation alongside goals with `P(no assist)` from archive.

### 3.3 Layer 3 — minutes hazard model

- **P(start):** LightGBM binary classifier, isotonic-calibrated. Features: last-5 starts, rolling minutes share, days since last club match, cup fixture within 3 days (from `fixtures` + cup watcher), presser signal (+confidence), price band, season minutes share, new-signing flag, **World Cup load flag (GW1–4 only)** from the fatigue study deliverable. Trained walk-forward on the archive.
- **Lineup coherence:** for each team and GW, generate the `M = 50` most probable XIs (beam search over P(start) respecting formation minimums from rules JSON); assign each a probability; Layer 4 samples an XI per simulation so teammate minutes are correlated (two strikers competing for one slot never both start in the same sim).
- **Sub-off hazard:** per-manager empirical survival curves `P(still on at minute t | started, game-state bucket)` from `lineups`, blended with the league curve by manager sample size. Gives `P(60+ | start)` and expected minutes.
- **Cameo:** `P(cameo) = P(appears) − P(start)`, with `P(appears)` from the same classifier family (target: minutes > 0). Expected cameo minutes from the manager's sub-timing distribution. `E[pts | cameo]` uses 1 appearance point, no CS eligibility, and attacking rates scaled by `exp_min_cameo / 90` (per campaign plan).
- **P(60+) total** = `P(start)·P(no sub-off before 60) + P(cameo)·P(sub-on before minute 30)` — the second term computed from the sub-on timing distribution, small but included.

### 3.4 Layer 4 — joint match simulation

`N = 10,000` sims per fixture per solve (raise if runtime allows; record N in `model_versions`).

Per simulation:
1. Sample an XI + sub events per team from Layer 3 lineup scenarios and hazards.
2. Draw scoreline from Layer 1; draw goal minutes (§3.1); derive game-state shares.
3. Draw penalty events; assign takers from `pen_duty` among on-pitch players; resolve conversion. Allocate remaining (non-pen) goals by multinomial over Layer 2 shares among on-pitch players, weighting by minutes on pitch. Allocate assists.
4. Generate defensive events: opponent shot count from λ and archive shots-per-xG rate conditioned on game state; shots on target split; saves = SoT − goals; in-box/out-box and big-chance flags by archive proportions. CBIT and recoveries per player: negative binomial draws with means = player per-90 rates × minutes × game-state multiplier (teams trailing/defending accumulate more CBIT; multiplier estimated from archive) × opponent box-entry factor. DefCon threshold points computed from rules JSON.
5. Cards: Bernoulli per player from per-90 rates × minutes. Own goals, pen misses: per-90 archive rates.
6. **BPS race:** compute BPS per player from simulated events using the rules JSON BPS table (2026/27: saves +2 any / +1 in-box / +1 big chance; no tackled penalty; CBI 1-per-3). Rank all players in the fixture; award bonus 3/2/1 with FPL tie-handling as encoded in rules JSON.
7. FPL points per player from rules JSON scoring table.

Aggregation: per-player distribution summary → `projections`; full per-sim player-points matrix per fixture → `sim_artifacts` (compressed) for covariance and rank-EV; within-team covariance matrix → `team_covariances`.

### 3.5 Evaluation services + solver (consumes the engine; decision rules live in the campaign plan)

Everything here is pure SQL/numpy over stored engine output — zero AI calls; results are pre-computed by the scheduled projection run and served instantly to the tool.

- **Squad evaluation service:** the Builder's exact four readouts for any legal 15 — (1) projected points over a 1–12 GW horizon (sums stored per-GW projections with fixture adjustment; distribution via stored covariances), (2) captaincy strength (best in-squad captain EV + P(12+)), (3) risk flags (minutes/injury from `minutes_forecasts` + `presser_signals`), (4) structure (budget spread + bench quality). Target round-trip <300ms from DB.
- **Transfer comparison service:** for any owned player, ranked same-position replacements with projection fans, price, rise risk, and net squad EV delta — powers the Squad page sell/replace sheet.
- **Transfer plan search:** beam search over transfer sequences, horizon 6 GWs, states = (squad, bank, free transfers ≤ 5), objective = Σ discounted E[points] + rank-EV term; hits admitted only past the calibrated threshold. Bench order maximises floor EV × P(non-start of starters) with formation-legal autosub paths checked against rules JSON.
- **Field model for rank-EV:** sample K field squads from `eo_snapshots` (proxy) or `rival_squads` (post-50k); score them on the *same* simulation draws as Louis's squad so correlation is exact; rank-EV = expected rank movement per evaluation.
- **Captaincy:** per candidate — E[2×pts], P(12+ as captain), EO-adjusted rank-EV; the calibrated differential tolerance surfaced alongside, informationally.
- **Chip season-sim:** simulate remaining season under candidate chip placements (fixture list + blank/double flags from cup watcher); enforce set-1 expiry from rules JSON; Free Hit valued on single-week dislocation as per campaign plan; placement grids cached for the Squad-page chip tools.
- **Guided-builder ranking:** structure options scored from the formation/structure study findings; candidate lists ranked by EP within the chosen structure's budget envelope.

---

### 3.9 Promoted-club shrinkage priors (named model feature)

Understat has no Championship coverage, so promoted-club players (2026/27: SUN, LEE, BUR) enter the season with near-zero usable xG history. Handling is explicit, not incidental:

- Player-level attacking rates are shrunk toward a **promoted-team prior** fitted on the last five promoted cohorts (position- and price-band-conditioned).
- The blend weight starts at 1.0 in GW1 and decays linearly to 0 by **GW10** as PL minutes accumulate; the live weight is stored per player in `projections.prior_blend`.
- While `prior_blend > 0`, every surface that shows the player's profile renders the **LOW SAMPLE · PROMOTED PRIORS ACTIVE** marker, and `ep_sd` is inflated accordingly — the model says "wide," the UI says why.
- This is an edge zone by design: public tools systematically misprice promoted players early, and the calibration harness scores this cohort separately so the prior itself gets audited.

## 4. Calibration protocol

1. **Data:** seasons 2023/24, 2024/25, 2025/26 (event archive + football-data closing odds). 2018/19 loaded additionally for the fatigue study only.
2. **Walk-forward:** for each season, train all fitted components on data through GW t, predict GW t+1, roll t = 5…37 (first 4 GWs warm-up). No look-ahead anywhere — feature builders must take an `as_of` timestamp.
3. **Metrics:** log-loss on binaries (start, appearance, CS, ≥1 goal); sample-based CRPS on the per-player points distribution; reliability curves in 10 probability buckets per binary (bucketed predicted vs realised frequency).
4. **Benchmarks:** (a) naive = trailing season-average points; (b) market-only = Layer 0/1 with flat positional allocation and flat minutes; (c) one public projection source, ingested for the overlap window.
5. **Ablation ladder:** Layer 0 → +1 → +2 → +3 → +4. Each layer must improve out-of-sample CRPS (and not degrade reliability) over the previous, or it is cut. Results to `calibration_metrics`.
6. **Derived thresholds (deliverable 28 Jul, per campaign plan):** captaincy differential tolerance; transfer-hit threshold; Layer 0 fit-residual tolerance; finishing-skill clamp; `k_pos` and `K` shrinkage constants.
7. **Live monitoring:** the same metrics computed weekly over rolling windows; a component whose rolling calibration drifts beyond its backtest band is re-fit; the BPS component is explicitly re-validated against live bonus data weekly through October (edge-expiry window per campaign plan). Attribution runs on multi-week drift only; single-week misses are logged as variance (audit discipline per campaign plan).
8. **Reproducibility:** every projection run writes `model_versions` (git SHA + data snapshot timestamp + ruleset version). Any projection or evaluation set can be regenerated bit-for-bit.

---

## 5. Repo folder structure

```
fpl-campaign/
├── README.md
├── docs/
│   ├── campaign-plan.md
│   ├── build/ (01…04)
│   └── tickets.md
├── config/
│   └── rules-2026-27.json
├── src/
│   ├── common/          # db client, heartbeat, alerts, as_of utilities, secrets access
│   ├── ingestion/       # fpl.py, understat.py, fbref.py, oddsapi.py, footballdata.py,
│   │                    # pressers.py, eo_scrape.py, rivals.py, cup_watcher.py,
│   │                    # vaastav.py + top10k_archives.py (strategy-study loaders)
│   ├── engine/
│   │   ├── layer0_market.py
│   │   ├── layer1_scoreline.py
│   │   ├── layer2_allocation.py
│   │   ├── layer3_minutes.py
│   │   ├── layer4_simulation.py
│   │   ├── bps.py       # rules-driven BPS engine (also used by the 28 Jul backtest)
│   │   └── calibration/ # walk_forward.py, metrics.py, ablation.py, thresholds.py
│   ├── solver/          # transfers.py, captaincy.py, bench.py, chips.py, field_model.py
│   └── jobs/            # entrypoints, one per cron job (doc 02 §3)
├── dashboard/           # Next.js app (doc 03); lib/analyst/ = payload builder + system
│                        # prompt + Ask route + memory parser (doc 02 §9), shared by the
│                        # API call and the Copy Analyst Payload export
├── supabase/
│   ├── migrations/
│   └── cron/            # pg_cron SQL: post-deadline checker (projection freeze + snapshot dispatch)
└── .github/
    └── workflows/       # one YAML per scheduled job + CI (lint, tests, migration check)
```

## Opponent strength scale (FPLBot's own, replaces FDR)

Implemented in `lib/opponent.js`, rendered only through `components/Opp.jsx`, so every surface
shares one definition by construction.

    threat(opponent) = 0.60 · norm(strength) + 0.40 · norm(xg_for)     when xg_for is present
                     = norm(strength)                                  when it is not

    norm(v) is min-max across the twenty current (non-archive) clubs only, so the scale
    re-centres itself as the season progresses and never hard-codes club tiers.

    venue    = -0.08 when the player is at home, +0.08 when away
    difficulty = clamp(0..100) of (threat + venue) · 100

Bands are cut on difficulty, not club identity: 0-19 very easy, 20-39 easy, 40-59 average,
60-79 hard, 80-100 very hard. Tones green, pale green, white, pale pink, pink.

A fixture run (default six) reports the mean difficulty of its members.

When the odds pipeline populates implied goals, pass `impliedGoalsByTeamId` to
`buildOpponentScale` and it takes precedence over strength and xG entirely. The tag's tooltip
states which basis produced the number, so the source is always visible.

Surfaces using it: Players table, player profile, comparison drawer, Squad rows, Squad pitch,
Dashboard template pitch, Builder pitch, Builder candidate lists.
