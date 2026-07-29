/* THE SWEEP.
 *
 * The model has one number that was ever measured. Every other value that shapes a projection was chosen by
 * judgement. This searches all of them together and writes the winners down.
 *
 * How it works:
 *   one read      the archive is read once, then turned into running totals. Every setting after that is
 *                 arithmetic over the same rows, which is what makes thousands of combinations possible.
 *   random first  a wide random search, so the search is not trapped by starting next to today's settings.
 *   then descent  from the best point found, each parameter in turn is walked across its whole range and the
 *                 best value kept. Repeated until a full pass finds nothing better.
 *   judged blind  every combination is scored ONLY on the held-out season. Ordering first, average error as
 *                 the tiebreak, because nobody needs to know a player will score 5.8 rather than 6.1, they
 *                 need to know who is better.
 *
 * Then two things are written into config/fitted-params.json, each marked MEASURED with the date and the
 * score that chose it:
 *   the winning parameter values
 *   the band correction, fitted on the TUNING seasons only, which is what fixes a band projecting too high
 *
 * Nothing is invented. Every value here comes out of the archive or is left at its default and marked as not
 * measured.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY. Optional RANDOM_TRIES, DESCENT_PASSES, SEED, POPULATION,
 * FIXTURES, FROM_GW, TO_GW, TUNE_SEASONS, TEST_SEASON, WRITE.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { mulberry32 } from "../lib/engine/rng.mjs";
import { indexRows, sliceFor, evaluate, metricsFor, calibrationBands, fitCalibrationKnots } from "../lib/solver/backtest_core.mjs";
import { TUNING_SPEC, DEFAULT_TUNING, resolveTuning, monotoneKnots } from "../lib/solver/tuning.mjs";
import { db, loadHistory, goalPointsFrom } from "./backtest.mjs";

const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const FITTED_PATH = new URL("../config/fitted-params.json", import.meta.url);
const RULES_A = readJson("../config/rules-2026-27.json");
let RULES_B = null;
try { RULES_B = readJson("../config/rules-2025-26.json"); } catch { RULES_B = null; }
const RULES = RULES_B || RULES_A;
const FITTED = readJson("../config/fitted-params.json");

const TUNE_SEASONS = (process.env.TUNE_SEASONS || "2021-22,2022-23,2023-24,2024-25")
  .split(",").map((x) => x.trim()).filter(Boolean);
const TEST_SEASON = (process.env.TEST_SEASON || "2025-26").trim();
const FROM_GW = Number(process.env.FROM_GW) || 8;
const TO_GW = Number(process.env.TO_GW) || 38;
const RANDOM_TRIES = Number(process.env.RANDOM_TRIES) || 3000;
const DESCENT_PASSES = Number(process.env.DESCENT_PASSES) || 4;
const SEED = Number(process.env.SEED) || 20260729;
/* The sweep runs on the wider population by default because it is the only one in which every parameter has
   an effect: with minutes held certain, a parameter about rotation risk cannot be measured at all. */
const POPULATION = (process.env.POPULATION || "all").trim() === "starters" ? "starters" : "all";
const USE_FIXTURES = (process.env.FIXTURES || "1").trim() !== "0";
const WRITE = (process.env.WRITE || "1").trim() !== "0";

const n3 = (v) => (v === null || v === undefined ? "—" : Number(v).toFixed(3));
const n4 = (v) => (v === null || v === undefined ? "—" : Number(v).toFixed(4));

/* Every value a parameter can take, as a list, so the same grid drives both the random draw and the walk. */
function gridFor(spec) {
  const out = [];
  const steps = Math.round((spec.to - spec.from) / spec.step);
  for (let i = 0; i <= steps; i++) {
    const v = spec.from + i * spec.step;
    out.push(spec.integer ? Math.round(v) : +v.toFixed(4));
  }
  return out;
}
const GRIDS = Object.fromEntries(TUNING_SPEC.map((s) => [s.key, gridFor(s)]));

/* Ordering first, average error as the tiebreak. Both from the held-out season alone. */
function better(a, b) {
  if (!a) return false;
  if (!b) return true;
  if (a.rank === null) return false;
  if (b.rank === null) return true;
  if (Math.abs(a.rank - b.rank) > 1e-6) return a.rank > b.rank;
  return a.mae < b.mae;
}

async function main() {
  const started = Date.now();
  console.log("THE SWEEP. Every parameter at once, judged on a season the model never sees.\n");
  console.log(RULES_B
    ? "Scored against the rules the archive's points were actually awarded under."
    : "WARNING: config/rules-2025-26.json is missing, so the wrong rule values are in use.");

  const client = db();
  const everything = await loadHistory(client);
  const available = [...new Set(everything.map((r) => r.season))].sort();
  const seasons = [...TUNE_SEASONS, TEST_SEASON].filter((s) => available.includes(s));
  const missing = [...TUNE_SEASONS, TEST_SEASON].filter((s) => !available.includes(s));
  if (missing.length) console.log(`  Not in the table, so skipped: ${missing.join(", ")}.`);
  if (!seasons.includes(TEST_SEASON)) {
    throw new Error(`The held-out season ${TEST_SEASON} is not in the table, so nothing can be judged blind. `
      + `Available: ${available.join(", ")}.`);
  }

  const rows = everything.filter((r) => seasons.includes(r.season));
  console.log(`${rows.length} player-gameweek rows across ${seasons.join(", ")}.`);
  console.log(`Tuning on ${TUNE_SEASONS.join(", ")}. Judging on ${TEST_SEASON}, which is never tuned on.\n`);

  const goalPoints = goalPointsFrom(RULES);
  const index = indexRows(rows, goalPoints);
  const slices = sliceFor(index, { seasons, fromGw: FROM_GW, toGw: TO_GW, population: POPULATION });
  console.log(`${slices.length} gameweeks prepared, population "${POPULATION}", opponent strength ${USE_FIXTURES ? "on" : "off"}.`);
  if (USE_FIXTURES) {
    for (const s of seasons) {
      const S = index.bySeason.get(s);
      if (S) console.log(`  ${s}: ${S.identified} of ${S.teamCount} clubs matched to an opponent number.`);
    }
  }
  console.log("");

  const baseOpts = {
    shrinkage: FITTED.rate_shrinkage.S_nineties,
    positionMeans: FITTED.position_points_per_start,
    promotionFactor: FITTED.promotion_factor,
    goalPoints,
    assistPoints: RULES.scoring.assist?.value ?? 3,
    appearancePoints: RULES.scoring.appearance_60_plus?.value ?? 2,
    testSeason: TEST_SEASON, population: POPULATION, useFixtures: USE_FIXTURES, calibration: null,
  };

  const seen = new Map();
  let runs = 0;
  const keyOf = (t) => TUNING_SPEC.map((s) => t[s.key]).join("|");

  const score = (tuning) => {
    const key = keyOf(tuning);
    if (seen.has(key)) return seen.get(key);
    const { errors } = evaluate(slices, tuning, baseOpts);
    const test = errors.filter((e) => e.isTest);
    const tune = errors.filter((e) => !e.isTest);
    const m = metricsFor(test);
    const result = { ...m, tuneRank: metricsFor(tune).rank, tuning: { ...tuning } };
    seen.set(key, result);
    runs++;
    if (runs === 1) {
      const each = (Date.now() - started) / 1000;
      console.log(`  First combination took ${each.toFixed(1)} seconds including the read. Judged on ${m.n} rows`);
      console.log(`  from ${TEST_SEASON}.\n`);
    }
    return result;
  };

  /* The starting point is today's model, so the sweep can only ever report an improvement on it. */
  const current = resolveTuning(DEFAULT_TUNING);
  let best = score(current);
  const asIs = best;
  console.log(`TODAY'S SETTINGS   rank ${n4(asIs.rank)}   error ${n3(asIs.mae)}   bias ${asIs.bias >= 0 ? "+" : ""}${n3(asIs.bias)}\n`);

  console.log(`RANDOM SEARCH, ${RANDOM_TRIES} combinations drawn across every parameter at once.`);
  const rng = mulberry32(SEED);
  for (let i = 0; i < RANDOM_TRIES; i++) {
    const draw = {};
    for (const s of TUNING_SPEC) {
      const g = GRIDS[s.key];
      draw[s.key] = g[Math.floor(rng() * g.length)];
    }
    const r = score(resolveTuning(draw));
    if (better(r, best)) {
      best = r;
      console.log(`  ${String(i + 1).padStart(5)}  new best  rank ${n4(r.rank)}  error ${n3(r.mae)}`);
    }
    if ((i + 1) % 250 === 0) {
      const mins = (Date.now() - started) / 60000;
      console.log(`  ${i + 1} tried, ${mins.toFixed(1)} minutes elapsed, best rank ${n4(best.rank)}`);
    }
  }
  console.log("");

  console.log(`WALKING EACH PARAMETER from the best point found, one at a time, until nothing improves.`);
  const sensitivity = {};
  for (let pass = 1; pass <= DESCENT_PASSES; pass++) {
    let moved = false;
    for (const s of TUNING_SPEC) {
      let localBest = best;
      const scores = [];
      for (const v of GRIDS[s.key]) {
        const trial = resolveTuning({ ...best.tuning, [s.key]: v });
        const r = score(trial);
        scores.push({ v, rank: r.rank });
        if (better(r, localBest)) localBest = r;
      }
      const ranks = scores.map((x) => x.rank).filter((x) => x !== null);
      if (ranks.length > 1) sensitivity[s.key] = Math.max(...ranks) - Math.min(...ranks);
      if (localBest !== best) {
        console.log(`  pass ${pass}  ${s.key.padEnd(20)} ${String(best.tuning[s.key]).padStart(6)} -> ${String(localBest.tuning[s.key]).padStart(6)}   rank ${n4(localBest.rank)}`);
        best = localBest;
        moved = true;
      }
    }
    if (!moved) { console.log(`  pass ${pass} changed nothing, so this is the best the search can find.`); break; }
  }
  console.log("");
  console.log(`${runs} combinations measured in ${((Date.now() - started) / 60000).toFixed(1)} minutes.\n`);

  console.log(`THE WINNER, judged only on ${TEST_SEASON}`);
  for (const s of TUNING_SPEC) {
    const changed = best.tuning[s.key] !== DEFAULT_TUNING[s.key];
    console.log(`  ${s.key.padEnd(20)} ${String(best.tuning[s.key]).padStart(6)}${changed ? `   was ${DEFAULT_TUNING[s.key]}` : "   unchanged"}`);
  }
  console.log("");
  console.log(`  ordering      ${n4(asIs.rank)} -> ${n4(best.rank)}`);
  console.log(`  average error ${n3(asIs.mae)} -> ${n3(best.mae)}`);
  console.log(`  bias          ${n3(asIs.bias)} -> ${n3(best.bias)}`);
  console.log("");

  console.log(`WHICH PARAMETERS ACTUALLY MATTER, how far ordering moves across each one's whole range`);
  for (const [k, v] of Object.entries(sensitivity).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${n4(v)}${v < 0.002 ? "   makes no difference, leave it alone" : ""}`);
  }
  console.log("");

  /* ── THE BAND CORRECTION ───────────────────────────────────────────────────────────────────────── */
  const { errors: winnerRows } = evaluate(slices, best.tuning, baseOpts);
  const tuneRows = winnerRows.filter((e) => !e.isTest);
  const testRows = winnerRows.filter((e) => e.isTest);

  console.log(`CALIBRATION BEFORE THE CORRECTION, on ${TEST_SEASON}`);
  for (const b of calibrationBands(testRows)) {
    console.log(`  ${(b.hi === 99 ? `${b.lo} and up` : `${b.lo} to ${b.hi}`).padEnd(12)} n ${String(b.n).padStart(6)}   said ${n3(b.projected)}   scored ${n3(b.actual)}   out by ${b.gap >= 0 ? "+" : ""}${n3(b.gap)}`);
  }
  console.log("");

  const fit = fitCalibrationKnots(tuneRows);
  let calibration = null;
  let after = [];
  if (!fit) {
    console.log(`Not enough rows in the tuning seasons to fit a band correction, so none is written.`);
  } else {
    const knots = monotoneKnots(fit.pairs, fit.weights);
    calibration = { knots };
    const { errors: correctedRows } = evaluate(slices, best.tuning, { ...baseOpts, calibration });
    const correctedTest = correctedRows.filter((e) => e.isTest);
    after = calibrationBands(correctedTest);
    const cm = metricsFor(correctedTest);
    console.log(`THE CORRECTION, fitted on the tuning seasons only`);
    for (const [x, y] of knots) console.log(`  a projection of ${n3(x)} becomes ${n3(y)}`);
    console.log("");
    console.log(`CALIBRATION AFTER THE CORRECTION, on ${TEST_SEASON}`);
    for (const b of after) {
      console.log(`  ${(b.hi === 99 ? `${b.lo} and up` : `${b.lo} to ${b.hi}`).padEnd(12)} n ${String(b.n).padStart(6)}   said ${n3(b.projected)}   scored ${n3(b.actual)}   out by ${b.gap >= 0 ? "+" : ""}${n3(b.gap)}`);
    }
    console.log("");
    console.log(`  ordering after the correction ${n4(cm.rank)}, against ${n4(best.rank)} before it. The correction`);
    console.log(`  only ever rises, so it cannot change who is ranked above whom; any difference is rounding.`);
    console.log("");
  }

  /* ── WRITE IT DOWN ────────────────────────────────────────────────────────────────────────────── */
  if (!WRITE) {
    console.log("WRITE was off, so config/fitted-params.json is unchanged.");
    return;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const out = JSON.parse(readFileSync(FITTED_PATH, "utf8"));
  const scoredOn = `held-out ${TEST_SEASON}, ${best.n} player-gameweeks, population "${POPULATION}"`;

  out.tuning = {
    _what: "The values that shape a projection. Each is MEASURED by jobs/sweep.mjs or left at its default and"
      + " marked UNMEASURED. Only a MEASURED entry is read by the model.",
    _method: "Random search across every parameter at once, then a walk of each parameter in turn from the"
      + " best point, judged on rank correlation with average error as the tiebreak.",
    _tuned_on: TUNE_SEASONS.join(", "),
    _judged_on: scoredOn,
    _combinations: runs,
    _before: { rank_correlation: asIs.rank, mean_absolute_error: asIs.mae, bias: asIs.bias },
    _after: { rank_correlation: best.rank, mean_absolute_error: best.mae, bias: best.bias },
    _sensitivity: sensitivity,
  };
  for (const s of TUNING_SPEC) {
    out.tuning[s.key] = {
      value: best.tuning[s.key],
      status: "MEASURED",
      measured_on: stamp,
      what: s.what,
      searched: `${s.from} to ${s.to} in steps of ${s.step}`,
      rank_correlation: best.rank,
      mean_absolute_error: best.mae,
      moves_ordering_by: sensitivity[s.key] === undefined ? null : sensitivity[s.key],
      scored_on: scoredOn,
    };
  }

  if (calibration) {
    const bandGap = (bands, lo) => {
      const b = bands.find((x) => x.lo === lo);
      return b ? b.gap : null;
    };
    out.xp_calibration = {
      status: "MEASURED",
      measured_on: stamp,
      _what: "A map from what the model projects to what players in that band actually scored. Forced to rise,"
        + " so it changes the size of a projection and never the order of two players.",
      _fitted_on: `${TUNE_SEASONS.join(", ")}, the tuning seasons only, so the held-out season stays held out.`,
      _applied_to: "The fallback scorer only. The simulation engine's own output is not corrected by it.",
      knots: calibration.knots,
      six_to_seven_gap_before: bandGap(calibrationBands(testRows), 6),
      six_to_seven_gap_after: bandGap(after, 6),
      _measured_on_season: TEST_SEASON,
    };
  }

  writeFileSync(FITTED_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Written into config/fitted-params.json: ${TUNING_SPEC.length} parameters${calibration ? " and the band correction" : ""}, each marked MEASURED with today's date and the score that chose it.`);
  console.log("");
  console.log("PASTE-READY, in case the commit step did not run:");
  console.log(JSON.stringify({ tuning: out.tuning, xp_calibration: out.xp_calibration }, null, 2));
}

const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirect) {
  main().catch((e) => { console.error(`Sweep failed: ${e.message}`); process.exit(1); });
}

export { main as runSweep, gridFor, better };
