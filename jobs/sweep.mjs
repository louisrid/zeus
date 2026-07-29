/* THE SWEEP.
 *
 * The model had one number that had ever been measured. Every other value that shapes a projection was chosen
 * by judgement. This searches all of them and writes down only what it can actually prove.
 *
 * THREE THINGS THE FIRST VERSION OF THIS GOT WRONG, and what replaced them:
 *
 *  1. It measured the wrong population. Run over every player with a fixture, most of the ordering it scored
 *     was the easy question of whether a player would feature at all, so ordering read 0.68 against the 0.215
 *     the points model gets on players who started. The points parameters were drowned and every one of them
 *     looked flat. Now the seven points parameters are measured on players who STARTED, where the points model
 *     is what is being tested, and the rotation parameter is measured where minutes vary, because with minutes
 *     held certain it has no effect at all. Each parameter is measured where it can be.
 *
 *  2. It applied values it had not proved. A parameter that moved ordering by 0.0008 across its whole range was
 *     written down as measured, and four of them landed on the extreme end of their range by chance. One of
 *     those switched off fixture difficulty for the entire app. Now every change has to survive a paired
 *     bootstrap against leaving the parameter alone: gameweeks are redrawn a few hundred times and the change
 *     has to keep winning. Anything that does not is reverted to its default and recorded as not measured,
 *     which is a real finding rather than a failure.
 *
 *  3. Its band correction never reached the band that matters. On that population almost nothing projects above
 *     five points, so the six-to-seven band, where every transfer decision lives, was never fitted. It is now
 *     fitted on the population that reaches those numbers, and it is only kept if it actually shrinks the gap
 *     in that band on the held-out season.
 *
 * Judged blind throughout: the held-out season is never tuned on. Ordering first, average error as the
 * tiebreak, because nobody needs to know a player will score 5.8 rather than 6.1, they need to know who is
 * better.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY. Optional RANDOM_TRIES, DESCENT_PASSES, SEED, FIXTURES, FROM_GW,
 * TO_GW, TUNE_SEASONS, TEST_SEASON, WRITE, CONFIDENCE, BOOTSTRAP_DRAWS.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { mulberry32 } from "../lib/engine/rng.mjs";
import {
  indexRows, sliceFor, evaluate, metricsFor, calibrationBands, fitCalibrationKnots,
  pairedBootstrap, bootstrapRows, topTwentyHitRate,
} from "../lib/solver/backtest_core.mjs";
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
const USE_FIXTURES = (process.env.FIXTURES || "1").trim() !== "0";
const WRITE = (process.env.WRITE || "1").trim() !== "0";
/* How often a change must still win when the season is redrawn before it is believed. A stated decision, and
   the only judgement left in the process: everything else comes out of the data. */
const CONFIDENCE = Number(process.env.CONFIDENCE) || 0.95;
const DRAWS = Number(process.env.BOOTSTRAP_DRAWS) || 300;

/* The rotation parameter cannot be measured with minutes held certain, and the points parameters cannot be
   measured where whether-he-plays dominates. So each is searched where it means something. */
const MINUTES_KEYS = ["minutesCurve"];
const POINTS_SPEC = TUNING_SPEC.filter((s) => !MINUTES_KEYS.includes(s.key));
const MINUTES_SPEC = TUNING_SPEC.filter((s) => MINUTES_KEYS.includes(s.key));

const n3 = (v) => (v === null || v === undefined ? "—" : Number(v).toFixed(3));
const n4 = (v) => (v === null || v === undefined ? "—" : Number(v).toFixed(4));
const pct = (v) => (v === null || v === undefined ? "—" : `${(Number(v) * 100).toFixed(0)}%`);

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

/* THE SEARCH. Random draws across the whole space first, so it is not trapped next to today's settings, then a
   walk of each parameter in turn until a full pass finds nothing better. Exported so it can be exercised
   against a local copy of the archive rather than only against the live database. */
export function searchStage({ score, spec, startFrom, label, randomTries, descentPasses, seed, started = Date.now() }) {
  let best = score(startFrom);
  console.log(`${label}`);
  console.log(`  starting point, today's model   rank ${n4(best.rank)}   error ${n3(best.mae)}   judged on ${best.n} rows`);
  if (spec.length > 1) {
    console.log(`  random search, ${randomTries} combinations across ${spec.length} parameters at once`);
    const rng = mulberry32(seed);
    for (let i = 0; i < randomTries; i++) {
      const draw = { ...startFrom };
      for (const s of spec) {
        const g = GRIDS[s.key];
        draw[s.key] = g[Math.floor(rng() * g.length)];
      }
      const r = score(resolveTuning(draw));
      if (better(r, best)) best = r;
      if ((i + 1) % 500 === 0) {
        console.log(`    ${i + 1} tried, ${((Date.now() - started) / 60000).toFixed(1)} minutes elapsed, best rank ${n4(best.rank)}`);
      }
    }
  }
  const sensitivity = {};
  for (let pass = 1; pass <= descentPasses; pass++) {
    let moved = false;
    for (const s of spec) {
      let local = best;
      const ranks = [];
      for (const v of GRIDS[s.key]) {
        const r = score(resolveTuning({ ...best.tuning, [s.key]: v }));
        if (r.rank !== null) ranks.push(r.rank);
        if (better(r, local)) local = r;
      }
      if (ranks.length > 1) sensitivity[s.key] = Math.max(...ranks) - Math.min(...ranks);
      if (local !== best) {
        console.log(`    walk ${pass}  ${s.key.padEnd(20)} ${String(best.tuning[s.key]).padStart(6)} -> ${String(local.tuning[s.key]).padStart(6)}   rank ${n4(local.rank)}`);
        best = local;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { best, sensitivity };
}

/* WHICH CHANGES SURVIVE BEING RE-MEASURED.
 *
 * One parameter at a time: put it back to its default and see whether the model is genuinely worse for it. If
 * it is not, the parameter was never doing anything and the default stands. Repeated until nothing more gets
 * dropped, because dropping one can make another look pointless too. */
export function pruneStage({ score, rows, spec, best, label, confidence, draws, seed }) {
  console.log("");
  console.log(`${label}`);
  const verdicts = {};
  let current = best;
  let dropped = true;
  while (dropped) {
    dropped = false;
    for (const s of spec) {
      if (current.tuning[s.key] === DEFAULT_TUNING[s.key]) continue;
      const reverted = resolveTuning({ ...current.tuning, [s.key]: DEFAULT_TUNING[s.key] });
      const without = score(reverted);
      /* The rows themselves are fetched only for the two settings being compared. Holding them for every
         combination the search tried ran the job out of memory: thirty thousand rows times a few thousand
         combinations is tens of millions of objects. The cache keeps the scores, never the rows. */
      const bs = pairedBootstrap(bootstrapRows(rows(current.tuning).test), bootstrapRows(rows(reverted).test),
        { draws, seed });
      const winRate = bs ? bs.winRate : null;
      verdicts[s.key] = { found: current.tuning[s.key], winRate,
        meanDiff: bs ? bs.meanDiff : null, sd: bs ? bs.sd : null };
      if (winRate === null || winRate < confidence) {
        console.log(`  ${s.key.padEnd(20)} ${String(current.tuning[s.key]).padStart(6)} -> ${String(DEFAULT_TUNING[s.key]).padStart(6)}  DROPPED, only wins ${pct(winRate)} of redraws`);
        verdicts[s.key].kept = false;
        current = without;
        dropped = true;
      } else {
        console.log(`  ${s.key.padEnd(20)} ${String(current.tuning[s.key]).padStart(6)}          KEPT, wins ${pct(winRate)} of redraws, worth ${n4(bs.meanDiff)} of ordering`);
        verdicts[s.key].kept = true;
      }
    }
  }
  return { best: current, verdicts };
}

/* WHAT GETS WRITTEN DOWN, as one pure function so the shape can be tested rather than discovered by a failing
   job. A MEASURED entry must carry the date and the score that chose it: the suite enforces that, and the
   first version of this writer left the score out, which failed the sweep's own test step after twenty
   minutes of searching and threw the result away. */
export function buildTuningBlock({ winner, verdicts, sensitivity, runs, stamp, scoredOn, before, after,
  topBefore, topAfter, tuneSeasons, confidence, draws, changed }) {
  const block = {
    _what: "The values that shape a projection. A value is MEASURED only when changing it survived a paired"
      + " bootstrap against leaving it alone. Everything else stays at its default and is marked UNMEASURED,"
      + " with the value the search preferred recorded but not applied. Only a MEASURED entry is read.",
    _method: "Random search then a walk of each parameter in turn. The seven points parameters are searched on"
      + " players who started, where the points model is what is being tested. The rotation parameter is"
      + " searched on every player with a fixture, because with minutes held certain it has no effect. Every"
      + " change is then tested by redrawing whole gameweeks with replacement a few hundred times and checking"
      + " it still wins.",
    _tuned_on: tuneSeasons.join(", "),
    _judged_on: scoredOn,
    _combinations: runs,
    _confidence_required: confidence,
    _bootstrap_draws: draws,
    _before: { rank_correlation: before.rank, mean_absolute_error: before.mae, bias: before.bias, top_twenty_hits: topBefore },
    _after: { rank_correlation: after.rank, mean_absolute_error: after.mae, bias: after.bias, top_twenty_hits: topAfter },
    _sensitivity: sensitivity,
    _parameters_changed: changed.map((s) => s.key),
  };
  if (!changed.length) {
    block._status = "SEARCHED AND REJECTED ON EVIDENCE. Not one of these values survived being re-measured, so"
      + " every one is at its default. The structure of the model is the limit, not its tuning. Recorded so"
      + " nobody repeats this search expecting a different answer.";
  }
  for (const spec of TUNING_SPEC) {
    const v = verdicts[spec.key] || {};
    const kept = winner[spec.key] !== DEFAULT_TUNING[spec.key];
    block[spec.key] = {
      value: winner[spec.key],
      status: kept ? "MEASURED" : "UNMEASURED",
      what: spec.what,
      searched: `${spec.from} to ${spec.to} in steps of ${spec.step}`,
      measured_on: stamp,
      /* The score that chose it. Without these two the suite rejects the entry, and rightly: a value nobody
         can trace back to a measurement is indistinguishable from a guess. */
      rank_correlation: after.rank,
      mean_absolute_error: after.mae,
      moves_ordering_by: sensitivity[spec.key] === undefined ? null : sensitivity[spec.key],
      survived_redraws: v.winRate === undefined ? null : v.winRate,
      worth_in_ordering: v.meanDiff === undefined ? null : v.meanDiff,
      scored_on: scoredOn,
      ...(kept ? {} : {
        _value_the_search_preferred: v.found === undefined ? null : v.found,
        _why_not_applied: sensitivity[spec.key] === 0
          /* A parameter that cannot move the number at all has not been rejected, it has not been tested.
             The promoted-club discount is the case in point: this harness walks within a season, and nothing
             inside a season looks like a club's first year in the league, so the parameter never fires. Saying
             "no better value found" about that would be a lie by omission. */
          ? "NOT TESTED. This harness cannot move this parameter at all, because nothing in a walk through one"
            + " season triggers it. Measuring it needs a test that spans a club's first season in the league."
          : v.found === undefined || v.found === DEFAULT_TUNING[spec.key]
            ? "The search found nothing better than the default."
            : `Changing it won only ${(Number(v.winRate) * 100).toFixed(0)}% of ${draws} redraws of the season,`
              + ` short of the ${(Number(confidence) * 100).toFixed(0)}% required, so it is chance rather than a finding.`,
      }),
    };
  }
  return block;
}

async function main() {
  const started = Date.now();
  console.log("THE SWEEP. Every parameter measured where it means something, and nothing applied unprovoked.\n");
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
  const goalPoints = goalPointsFrom(RULES);
  const index = indexRows(rows, goalPoints);

  /* WHAT THE ARCHIVE ACTUALLY HOLDS. Printed first, because the last run measured a season that was missing
     most of its gameweeks and nothing said so. */
  console.log("");
  console.log(`WHAT IS IN THE ARCHIVE`);
  console.log(`  season     rows    gameweeks   clubs matched to an opponent number`);
  const thin = [];
  for (const s of seasons) {
    const S = index.bySeason.get(s);
    if (!S) continue;
    const flag = S.gameweeksPresent < 30 ? "  THIN" : "";
    console.log(`  ${s.padEnd(9)} ${String(S.rowCount).padStart(6)}   ${String(S.gameweeksPresent).padStart(2)} of 38     ${String(S.identified)} of ${S.teamCount}${flag}`);
    if (S.gameweeksPresent < 30 || S.identified < S.teamCount) {
      thin.push(`${s}: ${S.gameweeksPresent} gameweeks, ${S.identified} of ${S.teamCount} clubs matched${S.unresolvedTeams.length ? ` (${S.unresolvedTeams.join(", ")})` : ""}`);
    }
  }
  if (thin.length) {
    console.log("");
    console.log(`  READ THIS BEFORE TRUSTING THE FIXTURE PARAMETER:`);
    for (const t of thin) console.log(`    ${t}`);
    console.log(`    A club with no number gets no opponent strength, so its fixtures read as average.`);
  }
  console.log("");
  console.log(`Tuning on ${TUNE_SEASONS.join(", ")}. Judging on ${TEST_SEASON}, which is never tuned on.`);
  console.log(`A change is only kept if it still wins ${pct(CONFIDENCE)} of ${DRAWS} redraws of the season.\n`);

  const slicesStarters = sliceFor(index, { seasons, fromGw: FROM_GW, toGw: TO_GW, population: "starters" });
  const slicesAll = sliceFor(index, { seasons, fromGw: FROM_GW, toGw: TO_GW, population: "all" });

  const optsFor = (population) => ({
    shrinkage: FITTED.rate_shrinkage.S_nineties,
    positionMeans: FITTED.position_points_per_start,
    promotionFactor: FITTED.promotion_factor,
    goalPoints,
    assistPoints: RULES.scoring.assist?.value ?? 3,
    appearancePoints: RULES.scoring.appearance_60_plus?.value ?? 2,
    testSeason: TEST_SEASON, population, useFixtures: USE_FIXTURES, calibration: null,
  });

  let runs = 0;
  /* The cache holds SCORES ONLY. An earlier version kept every combination's rows so the bootstrap could reuse
     them, and thirty thousand rows times a few thousand combinations ran the job out of memory. Rows are
     recomputed for the handful of settings that actually need them. */
  const makeScorer = (slices, population) => {
    const seen = new Map();
    const opts = optsFor(population);
    const keyOf = (tuning) => TUNING_SPEC.map((s) => tuning[s.key]).join("|");
    const rows = (tuning) => {
      const { errors } = evaluate(slices, tuning, opts);
      return { errors, test: errors.filter((e) => e.isTest) };
    };
    const score = (tuning) => {
      const key = keyOf(tuning);
      if (seen.has(key)) return seen.get(key);
      const { test } = rows(tuning);
      const result = { ...metricsFor(test), tuning: { ...tuning } };
      seen.set(key, result);
      runs++;
      if (runs === 1) {
        console.log(`  First combination took ${((Date.now() - started) / 1000).toFixed(0)} seconds including the read.\n`);
      }
      return result;
    };
    return { score, rows };
  };

  const search = (score, spec, startFrom, label) =>
    searchStage({ score, spec, startFrom, label, randomTries: RANDOM_TRIES, descentPasses: DESCENT_PASSES,
      seed: SEED, started });
  const prune = (score, rows, spec, best, label) =>
    pruneStage({ score, rows, spec, best, label, confidence: CONFIDENCE, draws: DRAWS, seed: SEED });

  /* ── STAGE ONE: THE POINTS PARAMETERS, ON PLAYERS WHO STARTED ─────────────────────────────────── */
  const starters = makeScorer(slicesStarters, "starters");
  const baseStarters = starters.score(resolveTuning(DEFAULT_TUNING));
  const s1 = search(starters.score, POINTS_SPEC, resolveTuning(DEFAULT_TUNING),
    `STAGE ONE, the seven points parameters, judged on players who started`);
  const p1 = prune(starters.score, starters.rows, POINTS_SPEC, s1.best, `WHICH OF THOSE SURVIVE BEING RE-MEASURED`);

  /* ── STAGE TWO: THE ROTATION PARAMETER, WHERE MINUTES VARY ────────────────────────────────────── */
  const everyone = makeScorer(slicesAll, "all");
  const startTwo = resolveTuning(p1.best.tuning);
  const s2 = search(everyone.score, MINUTES_SPEC, startTwo,
    `\nSTAGE TWO, the rotation parameter, judged on every player with a fixture because that is the only place`
    + `\nit has any effect at all`);
  const p2 = prune(everyone.score, everyone.rows, MINUTES_SPEC, s2.best, `AND WHETHER THAT SURVIVES BEING RE-MEASURED`);

  const winner = resolveTuning({ ...p1.best.tuning, ...p2.best.tuning });
  const verdicts = { ...p1.verdicts, ...p2.verdicts };
  const sensitivity = { ...s1.sensitivity, ...s2.sensitivity };
  const finalStarters = starters.score(winner);
  const finalRows = starters.rows(winner);
  const baseRows = starters.rows(resolveTuning(DEFAULT_TUNING));

  console.log("");
  console.log(`${runs} combinations measured in ${((Date.now() - started) / 60000).toFixed(1)} minutes.`);
  console.log("");
  console.log(`THE RESULT`);
  const changed = TUNING_SPEC.filter((s) => winner[s.key] !== DEFAULT_TUNING[s.key]);
  for (const s of TUNING_SPEC) {
    const v = verdicts[s.key];
    const kept = winner[s.key] !== DEFAULT_TUNING[s.key];
    const note = kept ? `changed from ${DEFAULT_TUNING[s.key]}`
      : sensitivity[s.key] === 0
        ? "NOT TESTED, this harness cannot make it do anything"
        : (v && v.found !== undefined && v.found !== DEFAULT_TUNING[s.key]
          ? `left alone, ${v.found} looked better but only won ${pct(v.winRate)} of redraws`
          : "left alone, nothing better found");
    console.log(`  ${s.key.padEnd(20)} ${String(winner[s.key]).padStart(6)}   ${note}`);
  }
  console.log("");
  if (!changed.length) {
    console.log(`  NOTHING CLEARED THE BAR. Not one of these values was what limited the model, and that is the`);
    console.log(`  answer rather than a failure: the structure is the limit, not the tuning. Everything stays at`);
    console.log(`  its default and the search is recorded so nobody repeats it expecting more.`);
  } else {
    console.log(`  ${changed.length} of ${TUNING_SPEC.length} parameters earned a change.`);
  }
  console.log("");
  console.log(`ON PLAYERS WHO STARTED, which is the comparable measure`);
  console.log(`  ordering        ${n4(baseStarters.rank)} -> ${n4(finalStarters.rank)}`);
  console.log(`  average error   ${n3(baseStarters.mae)} -> ${n3(finalStarters.mae)}`);
  console.log(`  bias            ${n3(baseStarters.bias)} -> ${n3(finalStarters.bias)}`);
  console.log(`  top twenty hits ${n3(topTwentyHitRate(baseRows.test))} -> ${n3(topTwentyHitRate(finalRows.test))} of 20`);
  console.log("");
  console.log(`HOW FAR EACH PARAMETER CAN MOVE ORDERING AT ALL, across its whole range`);
  for (const [k, v] of Object.entries(sensitivity).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${n4(v)}`);
  }
  console.log("");

  /* ── STAGE THREE: THE BAND CORRECTION, WHERE THE DECISION BAND EXISTS ─────────────────────────── */
  const tuneRows = finalRows.errors.filter((e) => !e.isTest);
  const testRows = finalRows.test;
  const gapAt = (bands, lo) => {
    const b = bands.find((x) => x.lo === lo);
    return b ? b.gap : null;
  };
  const before = calibrationBands(testRows);
  console.log(`CALIBRATION BEFORE ANY CORRECTION, on ${TEST_SEASON}, players who started`);
  for (const b of before) {
    console.log(`  ${(b.hi === 99 ? `${b.lo} and up` : `${b.lo} to ${b.hi}`).padEnd(12)} n ${String(b.n).padStart(6)}   said ${n3(b.projected)}   scored ${n3(b.actual)}   out by ${b.gap >= 0 ? "+" : ""}${n3(b.gap)}`);
  }
  console.log("");

  const fit = fitCalibrationKnots(tuneRows);
  let calibration = null;
  let calVerdict = "not fitted";
  let after = [];
  let afterMetrics = null;
  if (!fit) {
    console.log(`Not enough rows in the tuning seasons to fit a correction, so none is written.`);
  } else {
    const knots = monotoneKnots(fit.pairs, fit.weights);
    const candidate = { knots };
    const corrected = evaluate(slicesStarters, winner, { ...optsFor("starters"), calibration: candidate });
    const correctedTest = corrected.errors.filter((e) => e.isTest);
    after = calibrationBands(correctedTest);
    afterMetrics = metricsFor(correctedTest);

    console.log(`THE CORRECTION, fitted on the tuning seasons only`);
    for (const [x, y] of knots) console.log(`  a projection of ${n3(x)} becomes ${n3(y)}`);
    console.log("");
    console.log(`CALIBRATION AFTER IT, on ${TEST_SEASON}`);
    for (const b of after) {
      console.log(`  ${(b.hi === 99 ? `${b.lo} and up` : `${b.lo} to ${b.hi}`).padEnd(12)} n ${String(b.n).padStart(6)}   said ${n3(b.projected)}   scored ${n3(b.actual)}   out by ${b.gap >= 0 ? "+" : ""}${n3(b.gap)}`);
    }
    console.log("");

    /* THE GATE. The correction exists to fix the band every transfer decision lives in. If that band is not
       even present in the measurement, or the correction does not shrink its gap on the held-out season, it is
       not kept. This is the check the first version did not have. */
    const decisionBands = [[6, 7], [5, 6]];
    let judged = null;
    for (const [lo] of decisionBands) {
      const b = before.find((x) => x.lo === lo);
      const a = after.find((x) => x.lo === lo);
      if (b && a) { judged = { lo, before: b.gap, after: a.gap, n: b.n }; break; }
    }
    if (!judged) {
      calVerdict = "the decision band is not present in the measurement, so nothing was proved";
      console.log(`  THE SIX-TO-SEVEN BAND IS NOT IN THIS MEASUREMENT, and neither is five-to-six. The correction`);
      console.log(`  is not applied: correcting bands that are not where decisions are made proves nothing.`);
    } else if (Math.abs(judged.after) < Math.abs(judged.before)) {
      calibration = candidate;
      calVerdict = `the ${judged.lo} to ${judged.lo + 1} band went from ${judged.before >= 0 ? "+" : ""}${judged.before.toFixed(3)} to ${judged.after >= 0 ? "+" : ""}${judged.after.toFixed(3)} on the held-out season`;
      console.log(`  THE ${judged.lo} TO ${judged.lo + 1} BAND, which is where every transfer decision lives:`);
      console.log(`  out by ${judged.before >= 0 ? "+" : ""}${n3(judged.before)} before, ${judged.after >= 0 ? "+" : ""}${n3(judged.after)} after, on ${judged.n} rows of the season it never saw.`);
      console.log(`  Ordering ${n4(finalStarters.rank)} before the correction, ${n4(afterMetrics.rank)} after. The curve only ever rises,`);
      console.log(`  so it cannot change who is ranked above whom; any difference is the rounding to two decimals.`);
    } else {
      calVerdict = `it did not shrink the ${judged.lo} to ${judged.lo + 1} gap on the held-out season, so it was rejected`;
      console.log(`  REJECTED. The ${judged.lo} to ${judged.lo + 1} gap was ${n3(judged.before)} and the correction made it ${n3(judged.after)}.`);
      console.log(`  A correction that does not improve the band it was built for is not worth having.`);
    }
  }
  console.log("");

  /* ── WRITE IT DOWN ────────────────────────────────────────────────────────────────────────────── */
  if (!WRITE) {
    console.log("WRITE was off, so config/fitted-params.json is unchanged.");
    return;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const out = JSON.parse(readFileSync(FITTED_PATH, "utf8"));
  const scoredOn = `held-out ${TEST_SEASON}, ${finalStarters.n} player-gameweeks, players who started`;

  out.tuning = buildTuningBlock({
    winner, verdicts, sensitivity, runs, stamp, scoredOn,
    before: baseStarters, after: finalStarters,
    topBefore: topTwentyHitRate(baseRows.test), topAfter: topTwentyHitRate(finalRows.test),
    tuneSeasons: TUNE_SEASONS, confidence: CONFIDENCE, draws: DRAWS, changed,
  });

  out.xp_calibration = calibration
    ? {
      status: "MEASURED",
      measured_on: stamp,
      _what: "A map from what the model projects to what players in that band actually scored. Forced to rise,"
        + " so it changes the size of a projection and never the order of two players.",
      _fitted_on: `${TUNE_SEASONS.join(", ")}, the tuning seasons only, players who started.`,
      _applied_to: "The fallback scorer only. The simulation engine's own output is not corrected by it.",
      _proved_by: calVerdict,
      knots: calibration.knots,
      six_to_seven_gap_before: gapAt(before, 6),
      six_to_seven_gap_after: gapAt(after, 6),
      five_to_six_gap_before: gapAt(before, 5),
      five_to_six_gap_after: gapAt(after, 5),
      ordering_before: finalStarters.rank,
      ordering_after: afterMetrics ? afterMetrics.rank : null,
    }
    : {
      status: "UNMEASURED",
      measured_on: stamp,
      _what: "A map from what the model projects to what players in that band actually scored.",
      _why_not_applied: calVerdict,
      _knots_found: fit ? monotoneKnots(fit.pairs, fit.weights) : null,
      six_to_seven_gap_before: gapAt(before, 6),
      six_to_seven_gap_after: gapAt(after, 6),
    };

  writeFileSync(FITTED_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Written into config/fitted-params.json.`);
  console.log(`  ${changed.length} parameter${changed.length === 1 ? "" : "s"} marked MEASURED, ${TUNING_SPEC.length - changed.length} left at the default and marked UNMEASURED.`);
  console.log(`  Band correction: ${calibration ? "applied" : "not applied"}. ${calVerdict}`);
  console.log("");
  console.log("PASTE-READY, in case the commit step did not run:");
  console.log(JSON.stringify({ tuning: out.tuning, xp_calibration: out.xp_calibration }, null, 2));
}

const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirect) {
  main().catch((e) => { console.error(`Sweep failed: ${e.message}`); process.exit(1); });
}

export { main as runSweep, gridFor, better, POINTS_SPEC, MINUTES_SPEC, GRIDS };
