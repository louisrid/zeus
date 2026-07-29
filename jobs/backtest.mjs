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
const RULES = readJson("../config/rules-2026-27.json");
const FITTED = readJson("../config/fitted-params.json");

const SEASON = process.env.SEASON || "2025/26";
const FROM_GW = Number(process.env.FROM_GW) || 8;   // needs a few gameweeks of history to learn from
const TO_GW = Number(process.env.TO_GW) || 38;
const SHRINKAGE = process.env.SHRINKAGE === undefined
  ? FITTED.rate_shrinkage.S_nineties
  : Number(process.env.SHRINKAGE);

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
  console.log(`Backtest of ${SEASON}, GW${FROM_GW} to GW${TO_GW}, shrinkage ${SHRINKAGE}.`);
  console.log("Each gameweek is projected using only the gameweeks before it.\n");

  const rows = await all(client, "history_player_gw",
    "gw, element, player_name, position, team, minutes, started, total_points, goals, assists, saves, price",
    (q) => q.eq("season", SEASON).eq("competition", "PL").order("gw"));

  if (!rows.length) throw new Error(`No rows for season ${SEASON}. Has the archive job run?`);
  console.log(`${rows.length} player-gameweek rows loaded.\n`);

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

  const errors = [];        // { position, band, predicted, actual, err, absErr, baseAbsErr }
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

      errors.push({
        position: now.position, band: band(now.price),
        predicted, actual, err: predicted - actual, absErr: Math.abs(predicted - actual),
        baseAbsErr: baseline === null ? null : Math.abs(baseline - actual),
      });
    }
  }

  if (!errors.length) throw new Error("No comparable player-gameweeks. Check the season and gameweek range.");

  const report = (label, subset) => {
    if (!subset.length) return;
    const mae = mean(subset.map((e) => e.absErr));
    const bias = mean(subset.map((e) => e.err));
    const withBase = subset.filter((e) => e.baseAbsErr !== null);
    const baseMae = withBase.length ? mean(withBase.map((e) => e.baseAbsErr)) : null;
    const better = baseMae === null ? "—" : `${(((baseMae - mae) / baseMae) * 100).toFixed(1)}%`;
    console.log(`  ${label.padEnd(16)} n ${String(subset.length).padStart(6)}   MAE ${n2(mae)}   bias ${bias > 0 ? "+" : ""}${n2(bias)}   baseline MAE ${n2(baseMae)}   better by ${better}`);
  };

  console.log(`OVERALL`);
  report("all", errors);
  console.log("");
  console.log(`BY POSITION`);
  for (const pos of ["GKP", "DEF", "MID", "FWD"]) report(pos, errors.filter((e) => e.position === pos));
  console.log("");
  console.log(`BY PRICE`);
  for (const b of ["under 5.0", "5.0 to 6.5", "6.5 to 8.5", "8.5 to 11.0", "11.0 and up"]) {
    report(b, errors.filter((e) => e.band === b));
  }
  console.log("");

  const bias = mean(errors.map((e) => e.err));
  console.log(`READING IT`);
  console.log(`  A positive bias means the model projects HIGHER than players actually score.`);
  if (bias > 0.3) {
    console.log(`  Bias is +${n2(bias)}, so this model is systematically too high by that much per player per`);
    console.log(`  gameweek. Across an eleven that is roughly ${n2(bias * 11)} points of phantom score a week.`);
  } else if (bias < -0.3) {
    console.log(`  Bias is ${n2(bias)}, so this model is systematically too low.`);
  } else {
    console.log(`  Bias is ${n2(bias)}, which is close enough to zero to call unbiased overall.`);
  }
  const worst = ["GKP", "DEF", "MID", "FWD"]
    .map((pos) => ({ pos, bias: mean(errors.filter((e) => e.position === pos).map((e) => e.err)) }))
    .filter((x) => x.bias !== null)
    .sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias))[0];
  if (worst) console.log(`  The worst position is ${worst.pos} at ${worst.bias > 0 ? "+" : ""}${n2(worst.bias)}.`);
  if (capped) console.log(`  ${capped} archive rates exceeded the plausibility ceiling and were capped.`);
  console.log("");
  console.log(`  Run again with SHRINKAGE set to another value and compare MAE. Lower is better, and a change`);
  console.log(`  that lowers MAE is an improvement whatever anyone argues. That is the point of this job.`);
}

/* Only run when invoked directly. Importing this file to reuse a helper must not trigger a database run. */
const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirect) {
  main().catch((e) => { console.error(`Backtest failed: ${e.message}`); process.exit(1); });
}

export { main as runBacktest };
