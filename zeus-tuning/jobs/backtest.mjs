/* THE BACKTEST.
 *
 * Every parameter in this model used to be defended with reasoning and none had been measured. This measures
 * instead. It walks the archive gameweek by gameweek. At each one it builds the model from ONLY the
 * gameweeks before it, projects every player being judged, and compares the projection to what he really
 * scored. No future information is used at any point, which is the whole discipline: a model tuned on data
 * it has already seen will look excellent and predict nothing.
 *
 * What it reports:
 *   MAE          mean absolute error, the average distance between projection and reality
 *   bias         mean signed error. Positive means the model is systematically too high
 *   calibration  when it says six, do those players really score six
 *   rank skill   Spearman correlation, which is what matters when choosing between players
 *   top twenty   of the twenty highest projections, how many were really in the twenty highest scorers
 *   baseline     the same numbers for a model that just predicts each player's own average so far
 *
 * The heavy lifting now lives in lib/solver/backtest_core.mjs so that jobs/sweep.mjs can try thousands of
 * parameter settings against ONE database read. This job is the readable single-run report.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY. Optional SEASON, FROM_GW, TO_GW, SHRINKAGE, POPULATION, FIXTURES.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  indexRows, sliceFor, evaluate, metricsFor, mean, spearman, BANDS,
  calibrationBands, generaliseVerdict,
} from "../lib/solver/backtest_core.mjs";
import { tuningFrom, fittedCount, calibrationFrom, TUNING_SPEC } from "../lib/solver/tuning.mjs";

/* Read rather than import: a bare JSON import throws under plain node in Actions, which has broken twice. */
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));

/* VERSION A AND VERSION B.
 *
 * A is this season's ruleset, which the live model uses. B is last season's, which is what the archive's
 * actual points were scored under. A backtest must use B: scoring last season's outcomes with this season's
 * values measures the wrong thing, and the first version of this job did exactly that. */
const RULES_A = readJson("../config/rules-2026-27.json");
let RULES_B = null;
try { RULES_B = readJson("../config/rules-2025-26.json"); } catch { RULES_B = null; }
const RULES = RULES_B || RULES_A;
const FITTED = readJson("../config/fitted-params.json");

/* TUNE ON SEVERAL SEASONS, TEST ON ONE IT HAS NEVER SEEN.
 *
 * 2019-20 and 2020-21 were played behind closed doors, so home advantage nearly vanished and tuning on them
 * teaches something false. 2016-17 to 2018-19 are a different game with a different bonus system. That
 * leaves four clean seasons to tune on and one to test on, and the test season is never tuned on. */
const TUNE_SEASONS = (process.env.TUNE_SEASONS || "2021-22,2022-23,2023-24,2024-25")
  .split(",").map((x) => x.trim()).filter(Boolean);
const TEST_SEASON = (process.env.TEST_SEASON || "2025-26").trim();
const SEASON_INPUT = (process.env.SEASON || "").trim();
const FROM_GW = Number(process.env.FROM_GW) || 8;   // needs a few gameweeks of history to learn from
const TO_GW = Number(process.env.TO_GW) || 38;
/* A blank workflow input arrives as an empty string, not as undefined, so a plain Number() turned it into
   zero and silently backtested a model with no shrinkage at all. */
const shrinkArg = (process.env.SHRINKAGE || "").trim();
const SHRINKAGE = shrinkArg === "" || !Number.isFinite(Number(shrinkArg))
  ? FITTED.rate_shrinkage.S_nineties
  : Number(shrinkArg);
/* Defaults hold the report where it has always been: players who started, minutes certain, no opponent
   strength inside the harness. Both switches exist because the sweep needs the wider version to measure the
   rotation and fixture parameters at all, and the two sets of numbers are not comparable. */
const POPULATION = (process.env.POPULATION || "starters").trim() === "all" ? "all" : "starters";
const USE_FIXTURES = (process.env.FIXTURES || "").trim() === "1";

export function db() {
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

const COLS = "gw, element, player_name, position, team, opponent_team, was_home, minutes, started,"
  + " total_points, goals, assists, saves, bonus, xg, xa, goals_conceded, clean_sheets, price, season";

/* One read of the archive, shared by this job and the sweep. */
export async function loadHistory(client) {
  return all(client, "history_player_gw", COLS, (q) => q.eq("competition", "PL").order("gw"));
}

export function goalPointsFrom(rules) {
  return {
    GKP: rules.scoring.goal_gkp?.value ?? 10, DEF: rules.scoring.goal_def?.value ?? 6,
    MID: rules.scoring.goal_mid?.value ?? 5, FWD: rules.scoring.goal_fwd?.value ?? 4,
  };
}

export function seasonPlanFrom(available) {
  const useSeasons = SEASON_INPUT
    ? available.filter((x) => x === SEASON_INPUT || x === SEASON_INPUT.replace("/", "-") || x === SEASON_INPUT.replace("-", "/"))
    : [...TUNE_SEASONS, TEST_SEASON].filter((x) => available.includes(x));
  const missing = (SEASON_INPUT ? [SEASON_INPUT] : [...TUNE_SEASONS, TEST_SEASON]).filter((x) => !available.includes(x));
  return { useSeasons, missing };
}

export const settings = {
  tuneSeasons: TUNE_SEASONS, testSeason: TEST_SEASON, fromGw: FROM_GW, toGw: TO_GW,
  shrinkage: SHRINKAGE, population: POPULATION, useFixtures: USE_FIXTURES, rules: RULES, fitted: FITTED,
};

const n2 = (v) => (v === null || v === undefined ? "—" : Number(v).toFixed(2));

async function main(opts = {}) {
  const quiet = opts.quiet === true;
  const say = quiet ? () => {} : (...a) => console.log(...a);
  const client = db();
  say("Each gameweek is projected using only the gameweeks before it.");
  say(RULES_B
    ? "Scored against LAST season's rules, which is what the archive's points were awarded under."
    : "WARNING: config/rules-2025-26.json is missing, so this is scoring last season's outcomes with THIS\n"
      + "season's rule values. That measures the wrong thing. Run the derive-rules job and add that file.");
  say("");

  const everything = await loadHistory(client);
  const available = [...new Set(everything.map((r) => r.season))].sort();
  const { useSeasons, missing } = seasonPlanFrom(available);
  if (missing.length) say(`  Not in the table, so skipped: ${missing.join(", ")}. Available: ${available.join(", ")}.`);

  const rows = everything.filter((r) => useSeasons.includes(r.season));
  if (!rows.length) {
    throw new Error(
      `No rows for ${useSeasons.join(", ") || "any requested season"}. `
      + (available.length
        ? `The table holds: ${available.join(", ")}. Pass one of those as the season input.`
        : "The table is empty, so the archive job has never run."),
    );
  }
  say(`${rows.length} player-gameweek rows loaded for ${useSeasons.join(", ")}.\n`);

  const goalPoints = goalPointsFrom(RULES);
  const index = indexRows(rows, goalPoints);
  const slices = sliceFor(index, { seasons: useSeasons, fromGw: FROM_GW, toGw: TO_GW, population: POPULATION });

  const tuning = tuningFrom(FITTED);
  const nFitted = fittedCount(FITTED);
  const calibration = calibrationFrom(FITTED);

  say(`SETTINGS IN USE`);
  say(`  population ${POPULATION === "all" ? "every player with a fixture, minutes forecast from his record"
    : "players who started and played an hour, minutes held certain"}`);
  say(`  shrinkage ${SHRINKAGE}`);
  for (const s of TUNING_SPEC) {
    const entry = FITTED.tuning && FITTED.tuning[s.key];
    const status = entry && entry.status === "MEASURED" ? "measured" : "not measured yet";
    say(`  ${s.key.padEnd(20)} ${String(tuning[s.key]).padStart(5)}   ${status}`);
  }
  say(`  band correction ${calibration ? "measured and applied" : "not measured yet"}`);
  say("");

  const { errors, capped, envHits, envMisses } = evaluate(slices, tuning, {
    shrinkage: SHRINKAGE, positionMeans: FITTED.position_points_per_start,
    promotionFactor: FITTED.promotion_factor, goalPoints,
    assistPoints: RULES.scoring.assist?.value ?? 3,
    appearancePoints: RULES.scoring.appearance_60_plus?.value ?? 2,
    testSeason: TEST_SEASON, population: POPULATION, useFixtures: USE_FIXTURES, calibration,
  });

  if (!errors.length) throw new Error("No comparable player-gameweeks. Check the season and gameweek range.");
  say(`${errors.length} player-gameweeks scored.`);
  if (USE_FIXTURES) {
    say(`  Opponent strength read for ${envHits} of ${envHits + envMisses} of them.`);
    for (const season of useSeasons) {
      const S = index.bySeason.get(season);
      if (S) say(`  ${season}: ${S.identified} of ${S.teamCount} clubs matched to an opponent number.`);
    }
  }
  say("");

  const byGw = new Map();
  for (const e of errors) {
    const k = `${e.season}|${e.gw}`;
    if (!byGw.has(k)) byGw.set(k, []);
    byGw.get(k).push(e);
  }

  const line = (label, subset) => {
    if (subset.length < 20) return;
    const m = metricsFor(subset);
    const better = m.vsBase === null ? "—" : `${m.vsBase.toFixed(1)}%`;
    say(`  ${label.padEnd(22)} n ${String(subset.length).padStart(5)}  MAE ${n2(m.mae)}  bias ${m.bias >= 0 ? "+" : ""}${n2(m.bias)}  vs baseline ${better.padStart(7)}  rank ${m.rank === null ? "—" : m.rank.toFixed(3)}`);
  };

  /* THE ONLY NUMBER THAT PROVES ANYTHING. The tuning seasons tell you how well the model fits data it was
     allowed to see. The test season tells you whether it predicts. */
  const tune = errors.filter((e) => !e.isTest);
  const test = errors.filter((e) => e.isTest);

  say(`OVERALL`);
  line("everything", errors);
  if (tune.length && test.length) {
    line("tuning seasons", tune);
    line(`held-out ${TEST_SEASON}`, test);
  }
  say("");

  if (tune.length > 100 && test.length > 100) {
    const tMae = mean(tune.map((e) => e.absErr));
    const sMae = mean(test.map((e) => e.absErr));
    const tRho = spearman(tune.map((e) => [e.predicted, e.actual]));
    const sRho = spearman(test.map((e) => [e.predicted, e.actual]));
    say(`DOES IT GENERALISE`);
    say(`  Error on seasons it tuned on ${n2(tMae)}, on the season it never saw ${n2(sMae)}.`);
    if (tRho !== null && sRho !== null) {
      say(`  Ordering on seasons it tuned on ${tRho.toFixed(3)}, on the season it never saw ${sRho.toFixed(3)}.`);
      say(`  ${nFitted === 0 ? "No parameter has been fitted to the tuning seasons." : `${nFitted} parameters were fitted to the tuning seasons.`}`);
      const v = generaliseVerdict({ tuneRank: tRho, testRank: sRho, fittedCount: nFitted });
      if (v) for (const l of v.say) say(`  ${l}`);
    }
    say("");
  }

  say(`CALIBRATION, does a projection of X actually produce X`);
  say(`  projected range        n      mean projected   mean actual   gap`);
  for (const b of calibrationBands(errors)) {
    const flag = Math.abs(b.gap) > 0.75 ? (b.gap > 0 ? "  TOO HIGH" : "  TOO LOW") : "";
    const label = b.hi === 99 ? `${b.lo} and up` : `${b.lo} to ${b.hi}`;
    say(`  ${label.padEnd(22)} ${String(b.n).padStart(5)}      ${n2(b.projected).padStart(6)}         ${n2(b.actual).padStart(6)}      ${b.gap >= 0 ? "+" : ""}${n2(b.gap)}${flag}`);
  }
  say("");

  const judged = test.length > 200 ? test : errors;
  say(`BY POSITION, on the held-out season only, because that is the honest measure`);
  for (const pos of ["GKP", "DEF", "MID", "FWD"]) line(pos, judged.filter((e) => e.position === pos));
  say("");

  say(`POSITION CROSSED WITH PRICE, because a premium forward is not a cheap one`);
  for (const pos of ["GKP", "DEF", "MID", "FWD"]) {
    for (const b of BANDS) line(`${pos} ${b}`, judged.filter((e) => e.position === pos && e.band === b));
  }
  say("");

  say(`BY HOW NAILED HE IS, from starts before the gameweek projected`);
  for (const [label, lo, hi] of [
    ["nailed, 90%+ starts", 0.9, 1.01], ["regular, 70 to 90%", 0.7, 0.9],
    ["rotated, 40 to 70%", 0.4, 0.7], ["fringe, under 40%", 0, 0.4],
  ]) line(label, errors.filter((e) => e.startRate >= lo && e.startRate < hi));
  say("");

  say(`BY WHAT HE ACTUALLY SCORED, so misses and hauls are separated`);
  for (const [label, lo, hi] of [
    ["blank, 0 to 2", -99, 3], ["ordinary, 3 to 5", 3, 6],
    ["good, 6 to 9", 6, 10], ["haul, 10 or more", 10, 999],
  ]) line(label, errors.filter((e) => e.actual >= lo && e.actual < hi));
  say("");

  /* THE PRACTICAL TEST. Of the twenty highest projections in a gameweek, how many were really top twenty. */
  const hits = [];
  for (const [, set] of byGw) {
    if (set.length < 60) continue;
    const topPred = new Set([...set].sort((a, b) => b.predicted - a.predicted).slice(0, 20).map((e) => e.key));
    const topReal = new Set([...set].sort((a, b) => b.actual - a.actual).slice(0, 20).map((e) => e.key));
    let hit = 0;
    for (const k of topPred) if (topReal.has(k)) hit++;
    hits.push(hit);
  }
  if (hits.length) {
    say(`TOP TWENTY HIT RATE, the practical test`);
    say(`  Of the twenty highest projections each gameweek, ${n2(mean(hits))} were really in the top twenty.`);
    say(`  Random picking would land about 20 x 20 / n, so roughly 1 or 2. Anything near that is no skill.`);
    say("");
  }

  const overall = metricsFor(errors);
  say(`READING IT`);
  say(`  bias is the model minus reality, so positive means it projects too high.`);
  say(`  Overall bias ${overall.bias >= 0 ? "+" : ""}${n2(overall.bias)}, which across an eleven is ${n2(overall.bias * 11)} points a week of phantom score.`);
  if (overall.rank !== null) {
    say(`  Rank correlation ${overall.rank.toFixed(3)}. Below about 0.25 the ordering is barely better than chance,`);
    say(`  and ordering is what actually matters when choosing between players.`);
  }
  const worst = calibrationBands(errors).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0];
  if (worst) {
    say(`  Worst calibrated band is ${worst.lo} to ${worst.hi === 99 ? "up" : worst.hi},`);
    say(`  off by ${worst.gap >= 0 ? "+" : ""}${n2(worst.gap)}. Fix the band the decisions are made in first.`);
  }
  if (capped) say(`  ${capped} archive rates were impossible and had to be capped.`);
  say("");
  say(`  To change a parameter, run the sweep. It tries thousands of settings against the tuning seasons and`);
  say(`  judges every one on the held-out season, then writes the winner into config/fitted-params.json.`);

  /* What a sweep compares, from the HELD-OUT season where one exists. */
  const scoreOn = test.length > 200 ? test : errors;
  return { ...metricsFor(scoreOn), judgedOn: test.length > 200 ? TEST_SEASON : "everything" };
}

/* ── THE OLD SHRINKAGE SWEEP ───────────────────────────────────────────────────────────────────────
 *
 * Kept because the backtest workflow offers it, and it is now one database read rather than one per value.
 * For everything else use jobs/sweep.mjs, which walks every parameter at once. */
async function sweepShrinkage() {
  const values = (process.env.SWEEP_SHRINKAGE || "2,4,6,8,12,18,24")
    .split(",").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
  const client = db();
  const everything = await loadHistory(client);
  const available = [...new Set(everything.map((r) => r.season))].sort();
  const { useSeasons } = seasonPlanFrom(available);
  const rows = everything.filter((r) => useSeasons.includes(r.season));
  const goalPoints = goalPointsFrom(RULES);
  const index = indexRows(rows, goalPoints);
  const slices = sliceFor(index, { seasons: useSeasons, fromGw: FROM_GW, toGw: TO_GW, population: POPULATION });
  const tuning = tuningFrom(FITTED);

  console.log(`SWEEPING shrinkage across ${values.join(", ")}.\n`);
  const results = [];
  for (const v of values) {
    const { errors } = evaluate(slices, tuning, {
      shrinkage: v, positionMeans: FITTED.position_points_per_start,
      promotionFactor: FITTED.promotion_factor, goalPoints,
      assistPoints: RULES.scoring.assist?.value ?? 3,
      appearancePoints: RULES.scoring.appearance_60_plus?.value ?? 2,
      testSeason: TEST_SEASON, population: POPULATION, useFixtures: USE_FIXTURES,
      calibration: calibrationFrom(FITTED),
    });
    const test = errors.filter((e) => e.isTest);
    const m = metricsFor(test.length > 200 ? test : errors);
    results.push({ value: v, ...m });
    console.log(`  shrinkage ${String(v).padStart(3)}   MAE ${n2(m.mae)}   rank ${m.rank === null ? "—" : m.rank.toFixed(4)}   bias ${m.bias >= 0 ? "+" : ""}${n2(m.bias)}`);
  }
  if (!results.length) { console.log("No results."); return; }
  const byRank = [...results].filter((r) => r.rank !== null).sort((a, b) => b.rank - a.rank);
  const byMae = [...results].sort((a, b) => a.mae - b.mae);
  console.log("");
  console.log(`BEST BY RANK CORRELATION  shrinkage ${byRank[0].value} at ${byRank[0].rank.toFixed(4)}`);
  console.log(`BEST BY MEAN ERROR        shrinkage ${byMae[0].value} at ${byMae[0].mae.toFixed(3)}`);
  if (byRank[0].value !== byMae[0].value) {
    console.log(`  Those disagree. Prefer the rank winner: a model can lower its error by predicting everyone`);
    console.log(`  near the average, which is useless for choosing between players.`);
  }
}

/* Only run when invoked directly. Importing this to reuse a helper must not trigger a database run. */
const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirect) {
  const run = process.env.SWEEP === "1" ? sweepShrinkage : main;
  run().catch((e) => { console.error(`Backtest failed: ${e.message}`); process.exit(1); });
}

export { main as runBacktest };
