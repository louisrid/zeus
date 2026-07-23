# 02 — Data and Automation

Implements the "Automation pipeline", "Failure handling", and cost-table commitments in `docs/campaign-plan.md`. Self-contained: everything a coding session needs to build ingestion and scheduling is in this file plus `config/rules-2026-27.json`.

**Consistency flag (explicit, per instructions):** the campaign plan's cost table budgets "~$3–6/mo" for Haiku. The computed estimate at expected volume (§6.4) is ~$1–3/mo. This is not a contradiction — the plan figure is the budget envelope and the computed figure sits inside it — but the numbers differ, so it is flagged here rather than silently reconciled. With the Analyst's expected $3–6/mo (§9.4) added, the $14/month project cap holds with margin.

**Cost rule (binding):** all squad scoring, projections, and evaluations run internally (SQL + arithmetic over stored engine output) — **zero AI calls** anywhere in the engine, evaluation services, Refresh path (§8), or tool views. AI spend is exactly two things: the Haiku presser pipeline (§6, scheduled) and the Analyst (§9, fires only on an explicit press, cost displayed per call, capped server-side).

**Auth statement (binding):** every endpoint in §2 is public and requires **no authentication and no stored user credentials**. The only API keys in the system are service keys for The Odds API and Anthropic — provider-issued keys held in GitHub Actions secrets / Supabase secrets, never a personal login, never a session token, never in code or logs. Louis's squad is read from the public post-deadline picks endpoint using his **FPL team ID**, a plain numeric config value (`FPL_ENTRY_ID`, requested once at setup — it is the number in the team's public URL, not a credential). The tool itself has **no login gate**: the browser holds a read-only anon key; every write and every metered action goes through server routes holding the service keys (§7).

---

## 1. Source inventory

| # | Source | Role | Auth | Cost |
|---|---|---|---|---|
| 2.1 | FPL official API | prices, players, fixtures, live points, picks, ownership, native xG/xA | none | $0 |
| 2.2 | Understat | shot-level xG data | none (embedded JSON scrape) | $0 |
| 2.3 | FBref | player/team match logs (xG cross-check, recoveries detail) | none (HTML scrape, rate-limited) | $0 |
| 2.4 | The Odds API | live 1X2 + totals for Layer 0 | API key (secret) | $0 (free tier, 500 credits/mo) |
| 2.5 | football-data.co.uk | historical + fallback closing odds | none (public CSVs) | $0 |
| 2.6 | Team-news pages (FFS team news, BBC injuries, Sky Sports PL) | presser/injury text for Haiku | none (public pages) | $0 (Haiku cost in §6.4) |
| 2.7 | EO proxy scrape (LiveFPL-equivalent) | top-10k effective ownership | none (public page scrape) | $0 |
| 2.8 | Strategy-study sources: vaastav/Fantasy-Premier-League historical dataset (GitHub) + community-scraped top-10k pick archives + FPL `entry/{id}/history` | one-off + monthly analysis inputs (ticket B-18) | none (public repos/endpoints) | $0 |

## 2. Endpoints and field mappings

### 2.1 FPL official API (base: `https://fantasy.premierleague.com/api/`)

| Endpoint | Payload used | Maps to |
|---|---|---|
| `bootstrap-static/` | `elements[]`: `id→players.fpl_id`, `web_name`, `team`, `element_type→position`, `now_cost/10→price`, `status`, `chance_of_playing_next_round`, `news`, `selected_by_percent→selected_by_pct`, `transfers_in_event`/`transfers_out_event→transfer_velocity`, `expected_goals`, `expected_assists`, `expected_goals_conceded`, `saves`, `bps`, `bonus`, `minutes`, defensive-contribution fields (exact 2026/27 field names verified at launch — the ingestion client logs any unmapped fields it sees). `teams[]→teams`. `events[]`: `id→gw`, `deadline_time→deadline_utc`, `finished`, `data_checked`. | `players`, `teams`, `gameweeks`, `transfer_velocity` |
| `fixtures/` | `id`, `event→gw`, `team_h`, `team_a`, `kickoff_time`, `finished`, `team_h_score`, `team_a_score` | `fixtures` |
| `element-summary/{player_id}/` | `history[]` per-GW rows: minutes, goals, assists, saves, bps, bonus, CBI/tackles/recoveries fields, xG/xA | `player_match_stats` |
| `event/{gw}/live/` | per-player in-GW stats incl. live `bps` | `player_match_stats` (live), Monday audit, live GW view |
| `entry/{entry_id}/event/{gw}/picks/` | squad picks, captain, chip, bank, value (public **after** the GW deadline) | `my_squad`, `rival_squads`; with `entry_id = FPL_ENTRY_ID` this is the team-ID pick sync feeding `gw_picks` |
| `entry/{entry_id}/` | overall rank, GW rank | My Team card, pace tracking |
| `entry/{entry_id}/history/` | season-by-season totals + past-season summaries for any entry | champions' season summaries for the strategy study (note: **past seasons' week-by-week picks are NOT exposed here** — only summaries; weekly detail comes from community archives, §2.8) |
| `leagues-classic/{league_id}/standings/` | mini-league standings | race tracker (fun row) |

Notes: no auth on any of the above. Historical seasons beyond element-summary depth come from the community-archived FPL data mirrors of the same API (loaded once into `player_match_stats` with `source` marked); 2018/19 loaded this way for the fatigue study.

### 2.2 Understat (`https://understat.com/league/EPL/{year}` and `/match/{id}`)

Data sits in embedded `JSON.parse('...')` blobs in page HTML. Extract: league player table (npxG, xA, shots, key passes) and per-match shot arrays (`minute`, `xG`, `situation`, `result`, `player_id` mapping maintained in a crosswalk table). Maps to `shots` and enrichment columns on `player_match_stats`. Player-name crosswalk FPL↔Understat maintained as a reviewed table; unmatched names surface on the health page.

### 2.3 FBref (`https://fbref.com/en/comps/9/...`)

Scrape etiquette (binding): **≥ 6 seconds between requests**, honest User-Agent, aggressive local caching, never parallel. FBref rate-limits and blocks aggressive scrapers; treat any 429/403 as a signal to back off for 24h and rely on fallbacks. Role: secondary xG source and recoveries/defensive detail. Maps to `player_match_stats` enrichment. **This source is optional by design** — the pipeline must run complete without it (§4).

### 2.4 The Odds API

Request: `GET https://api.the-odds-api.com/v4/sports/soccer_epl/odds?regions=uk&markets=h2h,totals&oddsFormat=decimal&apiKey=[SECRET]`

- **Credit cost = markets × regions per request → 2 credits per pull** (h2h + totals, one region). Two pulls/week ≈ 16–20 credits/month against a 500 free-tier quota. **Never add markets or regions** — spreads or a second region multiplies cost immediately.
- Every response carries `x-requests-used` / `x-requests-remaining` headers → written to `api_credits` on every call → dashboard counter. Client refuses to fire if `remaining < 50` unless the call is the pre-solve pull (protects quota for the calls that matter).
- Response mapping: per event, take the median across returned bookmakers of h/d/a and over/under 2.5 → `odds_snapshots` (bookmaker='median', plus store Pinnacle-equivalent individually if present).

### 2.5 football-data.co.uk

`https://www.football-data.co.uk/mmz4281/{season}/E0.csv` where season is e.g. `2324`, `2425`, `2526`, `2627`. Columns used: `Date`, `HomeTeam`, `AwayTeam`, `FTHG`, `FTAG`; odds `B365H/B365D/B365A`, `B365>2.5`, `B365<2.5`, and closing columns (`B365CH` etc., Pinnacle `PSCH/PSCD/PSCA`, `PC>2.5`) where present — prefer closing Pinnacle, fall back B365, fall back averages (`AvgCH`…). Team-name crosswalk to FPL teams maintained as a table. Roles: (a) historical odds powering the entire walk-forward backtest; (b) **live fallback for The Odds API** — in-season the current `2627/E0.csv` updates after each round; if the Odds API is down or quota-constrained at solve time, Layer 0 uses the most recent football-data lines with a visible "market data: fallback source" banner instead of a dead end.

### 2.6 Team-news pages (presser pipeline inputs)

Fetched as plain public pages, text-extracted, then passed to Haiku (§6): Fantasy Football Scout team-news page, BBC Sport Premier League injuries page, Sky Sports PL news index. Club-official quotes come through these aggregators; no scraping behind logins, ever.

### 2.7 EO proxy scrape (named build task per campaign plan)

The official API exposes only overall ownership, so top-10k EO comes from a LiveFPL-equivalent public page scrape: fetch the published top-10k EO table weekly post-deadline → `eo_snapshots(scope='top10k_proxy')`. Validation task: cross-check a sample of players against manually computed EO from `rival_squads` sampling on last season's data. If the source page changes or disappears, fallback = compute EO directly from a 1,000-squad random sample of top-10k `entry` IDs via the public picks endpoint (slower, rate-limited politely at 1 req/2s, run overnight).

### 2.8 Strategy-study sources (ticket B-18 inputs)

- **vaastav/Fantasy-Premier-League (GitHub):** season-by-season historical dataset (raw CSVs per season: player GW histories, prices, positions). Loaded once for the structural analyses — best formations by season, value by position/price band, budget structures, bench spend vs return. Fetched as raw files from the public repo; team/player crosswalk reuses the existing tables.
- **Community-scraped top-10k pick archives:** repositories of historical top-10k weekly picks exist on GitHub for recent seasons; the study loads whichever seasons are available and records coverage per season. **Sourcing constraint, explicit:** the official FPL API does **not** expose past seasons' week-by-week picks for any entry — `entry/{id}/history` returns summaries only — so top-manager weekly behaviour must come from these community archives, and any season without an archive is analysed at summary level only.
- **Web-research synthesis:** one written synthesis of proven high-rank strategy findings from public FPL research, delivered as part of B-18 with sources listed; stored alongside the quantitative findings on the Analysis page.

All B-18 findings are stored as data rows (finding, effect size, evidence score, season range, source) — they render on the Analysis page and set the Guided builder's Step-1 defaults, and the relevant ones are included in Analyst payloads (§9).

---

## 3. Cron schedule — consolidated (all times UK)

| Job (src/jobs/) | Schedule | Runner | Purpose | Staleness threshold |
|---|---|---|---|---|
| `evening_pull` | daily 18:00 | GH Actions | bootstrap pull; transfer velocity → rise-risk alerts **before** price changes fire | 26h |
| `nightly_pull` | daily 03:00 (post price-change window 01:30–02:30) | GH Actions | prices, flags, ownership, fixtures; price-change diff → digest | 26h |
| `xg_refresh` | Wed 05:00 | GH Actions | Understat (+FBref if healthy); projection re-fit | 8 days |
| `odds_pull_1` + first-pass solve | Thu 06:00 | GH Actions | 2 credits; first-pass GW projections | odds < 24h at any solve |
| `presser_ingest` | Fri 08:00 (+ daily light scan inside nightly) | GH Actions | Haiku signals → `presser_signals` (the only AI spend) | 30h at projection run |
| `projection_run` | Fri 09:00 | GH Actions | odds pull #2 (2 credits) + full projection + evaluation refresh, written silently to the DB — no doc, no push | — |
| post-deadline checker | **every 5 min** vs `gameweeks.deadline_utc` | **Supabase cron** (pg_cron) | at deadline: freeze projections snapshot; at deadline +30 min: dispatch `post_deadline_snapshot` | — |
| `post_deadline_snapshot` | deadline +30 min (dispatched by the checker) | Supabase cron → GH Actions dispatch | `gw_picks` (pick tracker), `my_squad`, `rival_squads`, EO scrape kick | — |
| `monday_audit` | Mon 07:00, **re-run after scores finalise** (09:00 the day after the GW's final match, read from `fixtures`) | GH Actions | settle `gw_picks` predicted-vs-actual, calibration drift check (systematic misses only) | — |
| `cup_watcher` | inside nightly + Fri deep check | GH Actions | detect emerging blanks/doubles → `gameweeks` flags → chip simulator | — |
| `intl_break_report` | Fri of a break week | GH Actions | who travelled / 180-min loads / flags | — |

**Live GW view is not a cron job:** the dashboard fetches `event/{gw}/live/` on demand through a Vercel API proxy route (FPL API has no CORS), so weekend polling costs zero scheduled minutes.

**GitHub Actions minutes budget:** ~10–15 min/day of jobs ≈ 350–450 min/month, well inside the 2,000-minute free tier for a private repo.

**Deadline-critical placement (the stated jitter position from the campaign plan):** nothing user-facing is deadline-critical any more — **there are no notifications of any kind, by design**. GitHub Actions jitter (15–60 min at peak) is acceptable for every scheduled job above. The one punctuality-sensitive job is the post-deadline pick snapshot (the tracker depends on freezing projections at the deadline and capturing the submitted squad shortly after), which runs off the Supabase pg_cron 5-minute checker; the checker pattern also means no static cron line ever encodes a deadline.

## 4. Fallback chains and heartbeats

| Source | Primary | Fallback 1 | Fallback 2 | Behaviour |
|---|---|---|---|---|
| xG/shots | Understat | FBref (if healthy) | **FPL-native `expected_goals`/`expected_assists` — primary-ready, wired from day one** | Layer 2 runs regardless; status sheet shows which source fed the run |
| Odds | The Odds API | football-data.co.uk latest closing lines | previous-week implied goals | "market data: fallback/stale" banner; never a silent failure |
| Presser signals | Fri Haiku run | most recent signals ≤ 4 days old | FPL `status`/`chance_of_playing` fields only | projection run proceeds with confidence-downgraded minutes |
| EO top-10k | LiveFPL-equivalent scrape | 1,000-squad direct sample | overall ownership | rank-EV confidence flagged accordingly |
| FPL API itself | — | retry ×3 exponential backoff | previous snapshot | if > 26h stale, a red staleness banner sits on every affected page and the status sheet (this is the one source with no substitute) |

Every job upserts `pipeline_heartbeats` on start and success/failure. The status sheet (opened from the tool's freshness strip) shows each job's last success age vs its staleness threshold; any breach = amber, any breach at projection-run time = red on the status sheet and a stale banner on the affected pages. **Nothing is pushed — failures are visible whenever you look, silent otherwise.** You never make a decision on silently broken data (campaign-plan commitment; this is its implementation).

## 5. Rate limits and etiquette (binding)

- FPL API: ≤ 1 req/s sustained; bulk element-summary backfills at 1 req/2s overnight.
- Understat: ≤ 1 req/3s; cache pages 24h.
- FBref: ≥ 6s between requests; 429/403 → 24h back-off; never required for a solve.
- Odds API: 2 credits/pull, 2 pulls/week, hard client-side floor at 50 remaining credits; counter on health page.
- EO/rival sampling: 1 req/2s, overnight windows only.

## 6. Presser/Haiku pipeline

**6.1 Input.** Friday run: fetched text of the three team-news sources (§2.6), cleaned to plain text, chunked per club where the page structure allows. Haiku receives, per chunk: the article text, the club, the GW, the current squad list (names only) for entity resolution, and the fixed instruction to output JSON only.

**6.2 Output schema (exact, validated on ingest):**

```json
{
  "signals": [
    {
      "player": "string (must match provided squad list)",
      "team": "string",
      "signal": "out | doubt | rested | confirmed",
      "confidence": 0.0,
      "expected_absence_gws": null,
      "summary": "one sentence, paraphrased, no quotes",
      "source_url": "string"
    }
  ]
}
```

- `signal` semantics: `out` = ruled out; `doubt` = fitness/selection doubt; `rested` = rotation rest signalled; `confirmed` = manager-confirmed starter/available. `confidence` ∈ [0,1] is Haiku's own calibration of the source language ("definitely out" ≈ 0.95; "we'll assess" ≈ 0.5).
- Rows failing validation (unknown player, bad enum) are logged, not inserted. Signals feed `presser_signals` and thence Layer 3 features; `pen_duty` updates ride the same pipeline when taker news appears.

**6.3 Daily light scan.** Inside the nightly pull, the BBC injuries page alone is diffed; only changed sections go to Haiku. Keeps signal freshness through the week and through international breaks at minimal cost.

**6.4 Cost estimate at expected volume.** Friday run ≈ 20 club-chunks × ~2.5k input tokens ≈ 50k in; daily scans ≈ 12k in × 7 ≈ 84k in; outputs ≈ 15k/week. At Haiku-class pricing (order $1/M input, $5/M output): ≈ $0.15–0.25/week ≈ **$1/month**, with retries, double GWs, and break reports comfortably inside **$1–3/month** — within the plan's $3–6 envelope (see consistency flag at top).

## 7. Security posture (implementation of the campaign-plan rules)

- No FPL login exists anywhere in the system. Transfers are entered by Louis in the official app.
- Secrets: `ODDS_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_KEY` in GitHub Actions secrets; Vercel server routes and edge functions read their own secret stores. `FPL_ENTRY_ID` is plain config (a public number, not a secret). Nothing in repo files, migrations, logs, or error messages — job logging redacts anything matching a key pattern.
- **No login gate (deliberate):** the tool is personal and opens instantly. The browser ships only the Supabase anon key under read-only RLS policies; all writes (`squad_drafts`, `chip_plan`) and all metered actions (Refresh, Ask) are server routes holding service keys. Because the URL is the only barrier, it is deployed at an unguessable path, the Refresh route keeps its 60s debounce, and the Analyst route enforces the monthly spend cap in §9 — so discovery of the URL can waste nothing but patience.
- All jobs are read-only against external services. Nothing in this system can move money, submit a team, or act on an FPL account.

## 8. On-demand Refresh endpoint

The tool's single Refresh button (03 §2.0, 04 §1) hits `POST /api/refresh` on Vercel.

- **What it does:** re-pulls FPL API data on demand — bootstrap-static deltas (prices, flags, ownership, transfer counts), fixtures, and `event/{gw}/live` during live gameweeks — then recomputes the derived aggregates behind the tool's views (trending form, fixture swings, my-team scoring, squad/draft evaluations). All recomputation is SQL + arithmetic over stored engine output: **zero AI calls, zero odds credits, on this path — ever.** A test enforces that no code reachable from this route imports the Odds API client or any AI client.
- **What it deliberately does not touch:** The Odds API (scheduled Thu/Fri pulls only, credit protection — the freshness strip shows the odds vintage instead), Understat/FBref scrapes, and the Haiku pipeline, which all stay on their schedules in §3.
- **Debounce:** 60 seconds server-side per source group; a Refresh inside the window returns the current freshness map without firing requests, and the UI shows "already fresh". Keeps the FPL etiquette limits in §5 unbreachable from the UI.
- **Response:** a per-source freshness map (`source → last_success_at, stale: bool`) that the header strip renders; failures return the previous snapshot's map with the failing source marked, never an empty screen.

## 9. The Analyst (on-demand Claude Sonnet)

An **Ask** action on every screen (03 §4). Fires **only on an explicit press — no scheduled calls exist anywhere in the codebase** (guard test asserts the Anthropic Sonnet client is imported only by the Ask route and the payload builder's cost estimator). Cost per call is displayed before and after every press.

### 9.1 Payload builder (shared, single source of truth)

One module assembles the context for **both** routes — the API call and the Copy Analyst Payload export — so they can never drift. Per call it gathers, as structured text:

1. Current squad + bank + chips remaining (from `gw_picks` / plan-of-record draft).
2. Full current-GW projections **with distributions** (mean, sd, p5/p25/p50/p75/p95, P(12+)) for owned players and the top candidates per position; team covariance notes.
3. Fixture context (next 6 per relevant team, FDR, odds-implied goals + vintage of the odds snapshot).
4. Relevant strategy-study findings (matched to the asking screen: Builder → structure findings; Squad → captaincy/template findings; etc.).
5. The screen asked from, and its current on-screen selection (e.g. the draft being compared, the player whose sell/replace sheet is open).
6. MEMORY records (§9.2), most recent and most relevant first, token-capped.
7. The user's typed question, if any; otherwise the screen-default question.

Payload size is token-capped (~20k input target); the builder trims candidate lists and memory before ever trimming the user's squad or the question.

### 9.2 Memory (database-resident, not chat-resident)

Table `analyst_memory` (schema in doc 01 §2). Two writers:
- **Post-GW code** (Monday audit extension) appends structured records: Louis's decisions vs the model's evaluations that week, predicted-vs-actual per pick, captaincy outcomes, and component misses flagged by calibration.
- **The Analyst itself:** each response may end with a fenced `MEMORY` JSON block containing conclusions worth persisting; the Ask route parses and stores them (`created_by='analyst'`). Malformed blocks are dropped, never inserted.

Every future payload includes the token-capped memory digest, so the Analyst learns across the season.

### 9.3 System prompt (verbatim — this exact text ships)

```
You are THE ANALYST: an elite FPL quantitative analyst embedded in a
season-long campaign targeting overall rank #1. You are addressing the
expert manager who built the projection system whose output you are
reading. Rules, absolute:

1. No basic explanations. Never define FPL terms, mechanics, or
   statistical concepts. The reader knows.
2. No hedging, no generic advice. Every claim ties to a specific number
   in the payload, quoted with its value. If the payload lacks the
   number, say "not in payload" rather than guessing.
3. Think in rank-EV and full distributions, not point estimates. Tails,
   covariance, and effective ownership drive conclusions; say which.
4. Where you disagree with the model's own evaluations in the payload,
   flag it explicitly: state the disagreement and the numbers driving it.
5. Use MEMORY when relevant: cite the specific record (gw, kind) you are
   drawing on. Do not repeat memory back without using it.
6. Dense and direct. No preamble, no restating the question, no summary
   close.
7. End with THE LEVER: the single highest-leverage action available, if
   one exists. If none does, end with "No lever."
8. If conclusions worth persisting emerged, append a fenced ```MEMORY```
   JSON block: [{"kind":"analyst_conclusion","note":"...","refs":[...]}].
```

### 9.4 Cost accounting and cap

- **Open item (Louis, before B-22 build):** ~$0.10/call was flagged as too expensive. Evaluate a cheaper model for the Analyst — Haiku at the same payload lands ~$0.01–0.02/call — and/or a slimmer payload (~5k tokens → ~$0.03 on Sonnet). The Copy Analyst Payload route (§9.5) is already the zero-cost default. Model choice is Louis's call; the spec below is model-agnostic apart from the rate maths.
- Estimated cost shown on the button (payload tokens × the chosen model's input rate + typical output); actual cost computed from usage in the API response and written to `analyst_calls` with the response text.
- Month-to-date spend renders in the drawer footer and on the status panel. **Server-side monthly cap** (`ANALYST_MONTHLY_CAP`, default $8): the route refuses over-cap calls with the spend figure and points at the zero-cost path.

### 9.5 Copy Analyst Payload (zero-API-cost path)

A button beside Ask assembles the **identical** payload as formatted text (system prompt included as a header block) onto the clipboard, for pasting into Louis's own Claude Project on his existing plan. No API call, no cost, same single payload builder.
