/* THE BACKTEST.
 *
 * Every parameter in this model has been defended with reasoning and none has been measured. Shrinkage is 6
 * because a variance ratio implies it. Fixture swing is halved because appearance points do not move. The
 * levels match published tools across eight archetypes. All of that is argument, and argument is how a model
 * ends up projecting a defender at eleven points a week while every test passes.
 *
 * This measures instead. It walks last season gameweek by gameweek. At each one it builds the model from
 * ONLY the gameweeks before it, projects every player who actually featured, and compares the projection to
 * what he really scored. No future information is used at any point, which is the whole discipline: a model
 * tuned on data it has already seen will look excellent and predict nothing.
 *
 * What it reports:
 *   MAE          mean absolute error, the average distance between projection and reality
 *   bias         mean signed error. Positive means the model is systematically too high, which is the
 *                specific complaint that prompted this
 *   by position  because a model can be right overall and badly wrong about defenders
 *   by band      because being right about cheap players and wrong about premiums is the expensive way round
 *   baseline     the same numbers for a model that just predicts each player's own average so far. A
 *                projection that cannot beat that is not a projection.
 *
 * Run it with different parameters and the numbers say which is better. That is the point: it replaces my
 * judgement with a measurement.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY. Optional SEASON, FROM_GW, TO_GW, SHRINKAGE.
 */
import { createClient } from "@supabase/supabase-js";
import { buildScorer } from "../lib/solver/score.mjs";
import { readFileSync } from "node:fs";

/* Read rather than import: a bare JSON import throws under plain node in Actions, which has broken twice. */
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
/* VERSION A AND VERSION B.
 *
 * A is this season's ruleset, which the live model uses. B is last season's, which is what the archive's
 * actual points were scored under. A backtest must use B: scoring last season's outcomes with this season's
 * values measures the wrong thing, and the first version of this job did exactly that.
 *
 * B lives in config/rules-2025-26.json where it exists. Where it does not, this says so and falls back to A
 * rather than silently mixing them, and jobs/derive_rules.mjs will solve B out of the archive itself. */
const RULES_A = readJson("../config/rules-2026-27.json");
let RULES_B = null;
try { RULES_B = readJson("../config/rules-2025-26.json"); } catch { RULES_B = null; }
const RULES = RULES_B || RULES_A;
const FITTED = readJson("../config/fitted-params.json");

/* The archive job writes "2025-26" with a hyphen. Accept either spelling rather than failing on a slash. */
const SEASON_INPUT = (process.env.SEASON || "2025-26").trim();
const SEASON_FORMS = [...new Set([SEASON_INPUT, SEASON_INPUT.replace("/", "-"), SEASON_INPUT.replace("-", "/")])];
const FROM_GW = Number(process.env.FROM_GW) || 8;   // needs a few gameweeks of history to learn from
const TO_GW = Number(process.env.TO_GW) || 38;
/* A blank workflow input arrives as an empty string, not as undefined, so a plain Number() turned it into
   zero and silently backtested a model with no shrinkage at all. */
const shrinkArg = (process.env.SHRINKAGE || "").trim();
const SHRINKAGE = shrinkArg === "" || !Number.isFinite(Number(shrinkArg))
  ? FITTED.rate_shrinkage.S_nineties
  : Number(shrinkArg);

function db() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function all(client, table, select, filter) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = client.from(table).select(select).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const n2 = (v) => (v === null ? "—" : Number(v).toFixed(2));

/* Price bands, because being accurate about 4.5m players and wrong about 12m ones is the expensive failure. */
const BANDS = ["under 5.0", "5.0 to 6.5", "6.5 to 8.5", "8.5 to 11.0", "11.0 and up"];

function band(price) {
  const p = Number(price);
  if (!Number.isFinite(p)) return "unknown";
  if (p < 5) return "under 5.0";
  if (p < 6.5) return "5.0 to 6.5";
  if (p < 8.5) return "6.5 to 8.5";
  if (p < 11) return "8.5 to 11.0";
  return "11.0 and up";
}

async function main() {
  const client = db();
  console.log(`Backtest of ${SEASON_FORMS.join(" or ")}, GW${FROM_GW} to GW${TO_GW}, shrinkage ${SHRINKAGE}.`);
  console.log("Each gameweek is projected using only the gameweeks before it.");
  console.log(RULES_B
    ? "Scored against LAST season's rules, which is what the archive's points were awarded under."
    : "WARNING: config/rules-2025-26.json is missing, so this is scoring last season's outcomes with THIS\n"
      + "season's rule values. That measures the wrong thing. Run the derive-rules job and add that file.");
  console.log("");

  const cols = "gw, element, player_name, position, team, minutes, started, total_points, goals, assists, saves, price, season";
  let rows = [];
  let season = null;
  for (const form of SEASON_FORMS) {
    rows = await all(client, "history_player_gw", cols,
      (q) => q.eq("season", form).eq("competition", "PL").order("gw"));
    if (rows.length) { season = form; break; }
  }

  if (!rows.length) {
    /* Say what the table actually holds rather than only that the guess was wrong: the label differing by a
       slash is far more likely than the archive never having run. */
    const sample = await all(client, "history_player_gw", "season, competition",
      (q) => q.limit(4000));
    const seasons = [...new Set(sample.map((r) => `${r.season} (${r.competition})`))].sort();
    throw new Error(
      `No rows for ${SEASON_FORMS.join(" or ")}. `
      + (seasons.length
        ? `The table holds: ${seasons.join(", ")}. Pass one of those as the season input.`
        : "The table is empty, so the archive job has never run."),
    );
  }
  console.log(`${rows.length} player-gameweek rows loaded for season ${season}.\n`);

  /* Group by player, so history up to any gameweek is a slice rather than a scan. */
  const byPlayer = new Map();
  for (const r of rows) {
    const key = r.element ?? r.player_name;
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key).push(r);
  }
  for (const list of byPlayer.values()) list.sort((a, b) => a.gw - b.gw);

  const goalPoints = {
    GKP: RULES.scoring.goal_gkp?.value ?? 10, DEF: RULES.scoring.goal_def?.value ?? 6,
    MID: RULES.scoring.goal_mid?.value ?? 5, FWD: RULES.scoring.goal_fwd?.value ?? 4,
  };

  const errors = [];
  /* Grouped by gameweek too, so the top-twenty hit rate can be computed one gameweek at a time rather than
     across the whole season, which would be meaningless. */
  const byGw = new Map();
  let capped = 0;

  for (let gw = FROM_GW; gw <= TO_GW; gw++) {
    /* Who actually played this gameweek. Projecting players who did not feature would measure the minutes
       model rather than the points model, and those are separate questions. */
    const playing = [];
    for (const [key, list] of byPlayer) {
      const now = list.find((r) => r.gw === gw);
      if (!now || Number(now.minutes) < 60) continue;   // a starter, so appearance points are settled
      const past = list.filter((r) => r.gw < gw);
      if (past.length < 4) continue;                     // needs some history to project from
      playing.push({ key, now, past });
    }
    if (!playing.length) continue;

    /* Build the archive exactly as the live model does, but from prior gameweeks only. */
    const players = playing.map(({ key, now }) => ({
      fpl_id: key, web_name: now.player_name, name: now.player_name,
      position: now.position, team_id: now.team, status: "a", chance_of_playing: null,
      price: Number(now.price),
    }));

    const archive = new Map();
    const minutes = new Map();
    for (const { key, past, now } of playing) {
      const mins = past.reduce((a, r) => a + (Number(r.minutes) || 0), 0);
      const nineties = mins / 90;
      const pts = past.reduce((a, r) => a + (Number(r.total_points) || 0), 0);
      if (nineties <= 0) continue;

      const goalPts = goalPoints[now.position] ?? 4;
      const starts = past.filter((r) => r.started).length;
      const starts60 = past.filter((r) => r.started && Number(r.minutes) >= 60).length;
      const cameos = past.filter((r) => !r.started && Number(r.minutes) > 0).length;
      const appearance = starts60 * 2 + Math.max(0, starts - starts60) + cameos;
      const attacking = past.reduce((a, r) => a + (Number(r.goals) || 0) * goalPts + (Number(r.assists) || 0) * 3, 0);
      const savePts = Math.floor(past.reduce((a, r) => a + (Number(r.saves) || 0), 0) / 3);
      const rest = Math.max(0, pts - appearance - attacking - savePts);

      archive.set(key, {
        pointsPer90: pts / nineties, nineties, points: pts,
        appearPer90: appearance / nineties,
        attackPer90: attacking / nineties,
        defencePer90: (rest + savePts) / nineties,
      });
      /* He started this gameweek and played an hour, so the minutes question is answered. Holding it fixed
         isolates the points model, which is what is being measured. */
      minutes.set(key, { p_start: 1, exp_min_start: 90, p_cameo: 0, exp_min_cameo: 0 });
    }

    const scorer = buildScorer({
      projections: new Map(), perGw: new Map(), archivePer90: archive, understat: new Map(),
      envByTeam: null, leagueMeanGoals: null,
      goalPoints, assistPoints: RULES.scoring.assist?.value ?? 3,
      appearancePoints: RULES.scoring.appearance_60_plus?.value ?? 2,
      shrinkageNineties: SHRINKAGE,
      positionMeans: FITTED.position_points_per_start,
      promotionFactor: FITTED.promotion_factor,
      players, minutesForecasts: minutes,
    });
    capped += scorer.rateCapped ? scorer.rateCapped() : 0;

    for (const { key, now, past } of playing) {
      const p = players.find((x) => x.fpl_id === key);
      const predicted = Number(scorer.scoreOf(p));
      if (!Number.isFinite(predicted)) continue;
      const actual = Number(now.total_points) || 0;

      /* The baseline: his own average so far. Anything that cannot beat this is not worth running. */
      const playedBefore = past.filter((r) => Number(r.minutes) >= 60);
      const baseline = playedBefore.length
        ? mean(playedBefore.map((r) => Number(r.total_points) || 0))
        : null;

      /* How nailed he was BEFORE this gameweek. A model can be accurate on players who always start and
         useless on rotation risks, and those are different problems with different fixes. */
      const startRate = past.length ? past.filter((r) => r.started).length / past.length : 0;

      const row = {
        key, position: now.position, band: band(now.price), startRate,
        predicted, actual, err: predicted - actual, absErr: Math.abs(predicted - actual),
        baseAbsErr: baseline === null ? null : Math.abs(baseline - actual),
      };
      errors.push(row);
      if (!byGw.has(gw)) byGw.set(gw, []);
      byGw.get(gw).push(row);
    }
  }

  if (!errors.length) throw new Error("No comparable player-gameweeks. Check the season and gameweek range.");

  /* ── THE DIAGNOSTICS ──────────────────────────────────────────────────────────────────────────────
   *
   * MAE by position answers almost nothing. A model can be accurate on cheap defenders and useless on the
   * players a manager actually chooses between, and a single average hides that completely. So this reports:
   *
   *   calibration   when the model says six, do those players really average six? This is the single most
   *                 revealing table. A model can have a good MAE and still be systematically wrong at the
   *                 top end, which is exactly where every transfer decision is made.
   *   rank skill    Spearman correlation. For FPL, ordering matters more than absolute accuracy: nobody
   *                 needs to know a player will score 5.8 rather than 6.1, they need to know who is better.
   *   top-N hit     of the twenty highest projections, how many were really in the twenty highest scorers.
   *                 The practical test, because that is how the tool is used.
   *   position x price   crossed, not separate, because a premium forward and a cheap forward are different
   *                 problems and averaging them together conceals both.
   *   by reliability     nailed starters against rotation risks, from how often each player started before
   *                 the gameweek being projected.
   *   by outcome         did it see the hauls, and did it avoid recommending blanks.
   */
  const spearman = (pairs) => {
    if (pairs.length < 10) return null;
    const rank = (vals) => {
      const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
      const r = new Array(vals.length);
      for (let k = 0; k < idx.length;) {
        let m = k;
        while (m + 1 < idx.length && idx[m + 1][0] === idx[k][0]) m++;
        const avg = (k + m) / 2 + 1;
        for (let t = k; t <= m; t++) r[idx[t][1]] = avg;
        k = m + 1;
      }
      return r;
    };
    const rp = rank(pairs.map((p) => p[0]));
    const ra = rank(pairs.map((p) => p[1]));
    const n = pairs.length;
    const mp = mean(rp), ma = mean(ra);
    let num = 0, dp = 0, da = 0;
    for (let k = 0; k < n; k++) {
      num += (rp[k] - mp) * (ra[k] - ma);
      dp += (rp[k] - mp) ** 2;
      da += (ra[k] - ma) ** 2;
    }
    return dp && da ? num / Math.sqrt(dp * da) : null;
  };

  const line = (label, subset) => {
    if (subset.length < 20) return;
    const mae = mean(subset.map((e) => e.absErr));
    const bias = mean(subset.map((e) => e.err));
    const withBase = subset.filter((e) => e.baseAbsErr !== null);
    const baseMae = withBase.length ? mean(withBase.map((e) => e.baseAbsErr)) : null;
    const better = baseMae === null ? "—" : `${(((baseMae - mae) / baseMae) * 100).toFixed(1)}%`;
    const rho = spearman(subset.map((e) => [e.predicted, e.actual]));
    console.log(`  ${label.padEnd(22)} n ${String(subset.length).padStart(5)}  MAE ${n2(mae)}  bias ${bias >= 0 ? "+" : ""}${n2(bias)}  vs baseline ${better.padStart(7)}  rank ${rho === null ? "—" : rho.toFixed(3)}`);
  };

  console.log(`OVERALL`);
  line("all", errors);
  console.log("");

  /* CALIBRATION. The most important table here. */
  console.log(`CALIBRATION, does a projection of X actually produce X`);
  console.log(`  projected range        n      mean projected   mean actual   gap`);
  const buckets = [[0, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 99]];
  for (const [lo, hi] of buckets) {
    const set = errors.filter((e) => e.predicted >= lo && e.predicted < hi);
    if (set.length < 20) continue;
    const mp = mean(set.map((e) => e.predicted));
    const ma = mean(set.map((e) => e.actual));
    const gap = mp - ma;
    const flag = Math.abs(gap) > 0.75 ? (gap > 0 ? "  TOO HIGH" : "  TOO LOW") : "";
    console.log(`  ${(hi === 99 ? `${lo} and up` : `${lo} to ${hi}`).padEnd(22)} ${String(set.length).padStart(5)}      ${n2(mp).padStart(6)}         ${n2(ma).padStart(6)}      ${gap >= 0 ? "+" : ""}${n2(gap)}${flag}`);
  }
  console.log("");

  console.log(`BY POSITION`);
  for (const pos of ["GKP", "DEF", "MID", "FWD"]) line(pos, errors.filter((e) => e.position === pos));
  console.log("");

  console.log(`POSITION CROSSED WITH PRICE, because a premium forward is not a cheap one`);
  for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
    for (const b of BANDS) {
      line(`${pos} ${b}`, errors.filter((e) => e.position === pos && e.band === b));
    }
  }
  console.log("");

  console.log(`BY HOW NAILED HE IS, from starts before the gameweek projected`);
  for (const [label, lo, hi] of [
    ["nailed, 90%+ starts", 0.9, 1.01], ["regular, 70 to 90%", 0.7, 0.9],
    ["rotated, 40 to 70%", 0.4, 0.7], ["fringe, under 40%", 0, 0.4],
  ]) line(label, errors.filter((e) => e.startRate >= lo && e.startRate < hi));
  console.log("");

  console.log(`BY WHAT HE ACTUALLY SCORED, so misses and hauls are separated`);
  for (const [label, lo, hi] of [
    ["blank, 0 to 2", -99, 3], ["ordinary, 3 to 5", 3, 6],
    ["good, 6 to 9", 6, 10], ["haul, 10 or more", 10, 999],
  ]) line(label, errors.filter((e) => e.actual >= lo && e.actual < hi));
  console.log("");

  /* THE PRACTICAL TEST. Of the twenty highest projections in a gameweek, how many were really top twenty. */
  const hits = [];
  for (const [gw, set] of byGw) {
    if (set.length < 60) continue;
    const topPred = new Set([...set].sort((a, b) => b.predicted - a.predicted).slice(0, 20).map((e) => e.key));
    const topReal = new Set([...set].sort((a, b) => b.actual - a.actual).slice(0, 20).map((e) => e.key));
    let hit = 0;
    for (const k of topPred) if (topReal.has(k)) hit++;
    hits.push(hit);
  }
  if (hits.length) {
    console.log(`TOP TWENTY HIT RATE, the practical test`);
    console.log(`  Of the twenty highest projections each gameweek, ${n2(mean(hits))} were really in the top twenty.`);
    console.log(`  Random picking would land about 20 x 20 / n, so roughly 1 or 2. Anything near that is no skill.`);
    console.log("");
  }

  const bias = mean(errors.map((e) => e.err));
  const rho = spearman(errors.map((e) => [e.predicted, e.actual]));
  console.log(`READING IT`);
  console.log(`  bias is the model minus reality, so positive means it projects too high.`);
  console.log(`  Overall bias ${bias >= 0 ? "+" : ""}${n2(bias)}, which across an eleven is ${n2(bias * 11)} points a week of phantom score.`);
  if (rho !== null) {
    console.log(`  Rank correlation ${rho.toFixed(3)}. Below about 0.25 the ordering is barely better than chance,`);
    console.log(`  and ordering is what actually matters when choosing between players.`);
  }
  const worstBucket = buckets
    .map(([lo, hi]) => {
      const set = errors.filter((e) => e.predicted >= lo && e.predicted < hi);
      return set.length >= 20 ? { lo, hi, gap: mean(set.map((e) => e.predicted)) - mean(set.map((e) => e.actual)) } : null;
    })
    .filter(Boolean).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0];
  if (worstBucket) {
    console.log(`  Worst calibrated band is ${worstBucket.lo} to ${worstBucket.hi === 99 ? "up" : worstBucket.hi},`);
    console.log(`  off by ${worstBucket.gap >= 0 ? "+" : ""}${n2(worstBucket.gap)}. Fix the band the decisions are made in first.`);
  }
  if (capped) console.log(`  ${capped} archive rates were impossible and had to be capped.`);
  console.log("");
  console.log(`  Change one parameter, run again, and compare. Lower MAE and higher rank correlation is better,`);
  console.log(`  and calibration closer to zero across every band is better still.`);
}

/* Only run when invoked directly. Importing this to reuse a helper must not trigger a database run. */
const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirect) {
  main().catch((e) => { console.error(`Backtest failed: ${e.message}`); process.exit(1); });
}

export { main as runBacktest };
