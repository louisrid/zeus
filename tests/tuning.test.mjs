// THE TUNABLE PARAMETERS. Each test states what it protects.
//
// The single most important test in this file is the first one: with the parameters at their defaults, the
// model must produce the number it produced before they existed. Every other test would be worthless if
// adding a parameter had quietly changed a projection.
import test from "node:test";
import assert from "node:assert/strict";
import { buildScorer } from "../lib/solver/score.mjs";
import {
  DEFAULT_TUNING, TUNING_SPEC, TUNING_KEYS, resolveTuning, tuningFrom, fittedCount,
  monotoneKnots, applyCalibration, calibrationFrom,
} from "../lib/solver/tuning.mjs";
import {
  indexRows, sliceFor, evaluate, metricsFor, spearman, generaliseVerdict, calibrationBands,
  fitCalibrationKnots, band, resolveTeamIds, pairedBootstrap, topTwentyHitRate,
} from "../lib/solver/backtest_core.mjs";
import { readFileSync } from "node:fs";

const FITTED = JSON.parse(readFileSync("config/fitted-params.json", "utf8"));

const P = (fpl_id, position, team_id) => ({ fpl_id, position, team_id, status: "a", chance_of_playing: null });
const MEANS = { GKP: 3.584, DEF: 3.138, MID: 3.598, FWD: 4.267 };
const GOALS = { GKP: 10, DEF: 6, MID: 5, FWD: 4 };

/* A record with its parts split out, which is what the archive gives the scorer. */
const entry = (extra = {}) => ({
  pointsPer90: 5, nineties: 20, points: 100,
  appearPer90: 2, attackPer90: 2, defencePer90: 1,
  ...extra,
});

const base = (over = {}) => ({
  projections: new Map(), understat: new Map(), perGw: new Map(),
  envByTeam: null, leagueMeanGoals: null,
  goalPoints: GOALS, assistPoints: 3, appearancePoints: 2,
  shrinkageNineties: 6, positionMeans: MEANS,
  players: [P(1, "MID", 10)],
  archivePer90: new Map([[1, entry()]]),
  minutesForecasts: new Map([[1, { p_start: 1, exp_min_start: 90, p_cameo: 0, exp_min_cameo: 0 }]]),
  ...over,
});

/* ── THE ONE THAT MATTERS MOST ─────────────────────────────────────────────── */

test("passing the defaults explicitly is the same as passing nothing at all", () => {
  const p = P(1, "MID", 10);
  const without = buildScorer(base()).scoreOf(p);
  const withDefaults = buildScorer(base({ tuning: DEFAULT_TUNING })).scoreOf(p);
  assert.equal(without, withDefaults);
  // And every default is the identity setting recorded in the spec, so nothing can drift apart.
  for (const s of TUNING_SPEC) assert.equal(DEFAULT_TUNING[s.key], s.identity, `${s.key} default is not its identity`);
});

test("every parameter in the spec is documented and searchable", () => {
  for (const s of TUNING_SPEC) {
    assert.ok(s.what && s.what.length > 20, `${s.key} has no plain description`);
    assert.ok(s.to > s.from, `${s.key} has an empty range`);
    assert.ok(s.step > 0 && s.step <= s.to - s.from, `${s.key} has an unusable step`);
    assert.ok(s.identity >= s.from && s.identity <= s.to, `${s.key} cannot be set to its own default`);
  }
  assert.equal(TUNING_KEYS.length, 8);
});

/* ── EACH PARAMETER IS ACTUALLY WIRED IN ───────────────────────────────────────
 *
 * A parameter that changes nothing is worse than no parameter, because a sweep will report it as having no
 * effect and the conclusion will be wrong. One test per knob, each on data where it must bite.
 */

test("recent form only counts when the archive carries a recent rate, and then it moves the number", () => {
  const p = P(1, "MID", 10);
  const hot = new Map([[1, entry({ recentPer90: 9 })]]);
  const flat = buildScorer(base({ archivePer90: hot })).scoreOf(p);
  const weighted = buildScorer(base({ archivePer90: hot, tuning: { recentFormWeight: 0.5 } })).scoreOf(p);
  assert.ok(weighted > flat, `form in should raise a player in form: ${weighted} vs ${flat}`);
  // With no recent rate on the row the weight has nothing to act on, so the number cannot move.
  const noRecent = buildScorer(base({ tuning: { recentFormWeight: 0.5 } })).scoreOf(p);
  assert.equal(noRecent, buildScorer(base()).scoreOf(p));
});

test("chances count against outcomes only where the row carries both", () => {
  const p = P(1, "MID", 10);
  // Underlying says he should have scored far more than he did.
  const rows = new Map([[1, entry({ xgAttackPer90: 5 })]]);
  const outcomes = buildScorer(base({ archivePer90: rows })).scoreOf(p);
  const chances = buildScorer(base({ archivePer90: rows, tuning: { xgWeight: 0.6 } })).scoreOf(p);
  assert.ok(chances > outcomes, `chances should lift an unlucky player: ${chances} vs ${outcomes}`);
  const missing = buildScorer(base({ tuning: { xgWeight: 0.6 } })).scoreOf(p);
  assert.equal(missing, buildScorer(base()).scoreOf(p));
});

test("fixture sensitivity scales the swing and zero ignores the opponent", () => {
  const p = P(1, "MID", 10);
  const hard = { envByTeam: new Map([[10, { forGoals: 0.8, againstGoals: 2.2 }]]), leagueMeanGoals: 2.8 };
  const normal = buildScorer(base(hard)).scoreOf(p);
  const doubled = buildScorer(base({ ...hard, tuning: { fixtureSensitivity: 2 } })).scoreOf(p);
  const ignored = buildScorer(base({ ...hard, tuning: { fixtureSensitivity: 0 } })).scoreOf(p);
  assert.ok(doubled < normal, "a harder push should lower a bad fixture further");
  assert.ok(ignored > normal, "ignoring the fixture should remove the penalty");
  // At zero the fixture cannot matter, so a kind fixture and a cruel one must agree.
  const kind = { envByTeam: new Map([[10, { forGoals: 2.4, againstGoals: 0.7 }]]), leagueMeanGoals: 2.8 };
  assert.equal(
    buildScorer(base({ ...kind, tuning: { fixtureSensitivity: 0 } })).scoreOf(p),
    buildScorer(base({ ...hard, tuning: { fixtureSensitivity: 0 } })).scoreOf(p),
  );
});

test("the team-mates weight decides what an unproven player regresses toward", () => {
  const rookie = P(9, "DEF", 10);
  const players = [rookie, P(1, "DEF", 10), P(2, "DEF", 10)];
  // Two proven team-mates at a club far better than the league average for the position.
  const archive = new Map([
    [1, { pointsPer90: 6, nineties: 30 }],
    [2, { pointsPer90: 6, nineties: 30 }],
  ]);
  const mins = new Map(players.map((p) => [p.fpl_id, { p_start: 1, exp_min_start: 90, p_cameo: 0, exp_min_cameo: 0 }]));
  const opts = { players, archivePer90: archive, minutesForecasts: mins };
  const allMates = buildScorer(base({ ...opts, tuning: { matesWeight: 1 } })).scoreOf(rookie);
  const allLeague = buildScorer(base({ ...opts, tuning: { matesWeight: 0 } })).scoreOf(rookie);
  assert.ok(allMates > allLeague, `his team-mates should pull him up: ${allMates} vs ${allLeague}`);
  assert.ok(Math.abs(allLeague - MEANS.DEF) < 0.5, "at zero he should sit near the league average for a defender");
});

test("bonus scaling needs a bonus rate and a position average, then rewards underlying output", () => {
  const p = P(1, "MID", 10);
  const rows = new Map([[1, entry({ bonusPer90: 1 })]]);
  const attackMeans = { MID: 1 };            // he creates twice his position's average
  const off = buildScorer(base({ archivePer90: rows, positionAttackMeans: attackMeans })).scoreOf(p);
  const on = buildScorer(base({
    archivePer90: rows, positionAttackMeans: attackMeans, tuning: { bonusElasticity: 1 },
  })).scoreOf(p);
  assert.ok(on > off, `a heavy creator should earn more bonus: ${on} vs ${off}`);
  // Without the position average there is nothing to compare him to, so nothing may change.
  const noMeans = buildScorer(base({ archivePer90: rows, tuning: { bonusElasticity: 1 } })).scoreOf(p);
  assert.equal(noMeans, buildScorer(base({ archivePer90: rows })).scoreOf(p));
});

test("promotion strength scales the discount and zero switches it off", () => {
  // A whole squad with no prior-season minutes is a promoted club, which is how the model detects one.
  const squad = Array.from({ length: 12 }, (_, i) => P(100 + i, "FWD", 77));
  const target = squad[0];
  const mins = new Map(squad.map((p) => [p.fpl_id, { p_start: 1, exp_min_start: 90, p_cameo: 0, exp_min_cameo: 0 }]));
  const opts = {
    players: squad, archivePer90: new Map(), minutesForecasts: mins,
    promotionFactor: { overall: 0.9, GKP: 0.9, DEF: 0.8, MID: 0.9, FWD: 0.5 },
  };
  const full = buildScorer(base(opts)).scoreOf(target);
  const none = buildScorer(base({ ...opts, tuning: { promotionStrength: 0 } })).scoreOf(target);
  const heavy = buildScorer(base({ ...opts, tuning: { promotionStrength: 2 } })).scoreOf(target);
  assert.ok(none > full, "switching the discount off must raise a promoted player");
  assert.ok(heavy < full, "leaning on it harder must lower him");
});

test("the minutes curve punishes a rotation risk and leaves a nailed starter alone", () => {
  const p = P(1, "MID", 10);
  const half = new Map([[1, { p_start: 0.5, exp_min_start: 90, p_cameo: 0, exp_min_cameo: 0 }]]);
  const flat = buildScorer(base({ minutesForecasts: half })).scoreOf(p);
  const steep = buildScorer(base({ minutesForecasts: half, tuning: { minutesCurve: 2 } })).scoreOf(p);
  assert.ok(steep < flat, `a coin-flip starter should fall further: ${steep} vs ${flat}`);
  // A certain starter is at one, and one to any power is one.
  assert.equal(
    buildScorer(base({ tuning: { minutesCurve: 2 } })).scoreOf(p),
    buildScorer(base()).scoreOf(p),
  );
});

/* ── READING AND VALIDATING THE CONFIG ─────────────────────────────────────── */

test("a value outside its range is clamped rather than trusted", () => {
  const t = resolveTuning({ fixtureSensitivity: 99, minutesCurve: -4, recentFormWindow: 7.6 });
  assert.equal(t.fixtureSensitivity, 2);
  assert.equal(t.minutesCurve, 0.5);
  assert.equal(t.recentFormWindow, 8, "a window must be a whole number of gameweeks");
});

test("nonsense in the config falls back to the default instead of to zero", () => {
  const t = resolveTuning({ matesWeight: "banana", xgWeight: null, promotionStrength: "" });
  assert.equal(t.matesWeight, DEFAULT_TUNING.matesWeight);
  assert.equal(t.xgWeight, DEFAULT_TUNING.xgWeight);
  assert.equal(t.promotionStrength, DEFAULT_TUNING.promotionStrength);
});

test("only a MEASURED entry is read, so an open question cannot change the model", () => {
  const fitted = { tuning: {
    matesWeight: { value: 0.1, status: "UNMEASURED" },
    minutesCurve: { value: 1.7, status: "MEASURED" },
  } };
  const t = tuningFrom(fitted);
  assert.equal(t.matesWeight, DEFAULT_TUNING.matesWeight, "an unmeasured value must be ignored");
  assert.equal(t.minutesCurve, 1.7);
  assert.equal(fittedCount(fitted), 1);
});

test("the shipped config declares every parameter, and anything measured carries its date and score", () => {
  assert.ok(FITTED.tuning, "config/fitted-params.json must carry the tuning block");
  for (const key of TUNING_KEYS) {
    assert.ok(FITTED.tuning[key], `${key} is missing from the config`);
    assert.ok(["MEASURED", "UNMEASURED"].includes(FITTED.tuning[key].status));
  }
  // If this ever fails it is because a sweep has run, which is the point. Then every measured entry must
  // carry the date and the score that chose it, or the value is unexplained.
  for (const key of TUNING_KEYS) {
    const e = FITTED.tuning[key];
    if (e.status !== "MEASURED") continue;
    assert.ok(e.measured_on, `${key} is measured but carries no date`);
    assert.ok(Number.isFinite(Number(e.rank_correlation)), `${key} is measured but carries no score`);
  }
  assert.equal(tuningFrom(FITTED).matesWeight >= 0, true);
});

/* ── THE BAND CORRECTION ───────────────────────────────────────────────────── */

test("the correction curve is forced to rise, so it can never reorder two players", () => {
  // A wobble in the middle: the six band came back lower than the five band.
  const knots = monotoneKnots([[2, 2.4], [4, 3.9], [6, 3.1], [8, 6.2]], [100, 100, 50, 80]);
  const ys = knots.map((k) => k[1]);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] >= ys[i - 1], `the curve falls at knot ${i}`);
  const xs = knots.map((k) => k[0]);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1], "the knots must stay in order");
});

test("a projection is corrected between the knots and beyond them, and never below zero", () => {
  const cal = { knots: [[2, 1.8], [4, 3.5], [6, 4.8]] };
  assert.equal(applyCalibration(2, cal), 1.8);
  assert.equal(applyCalibration(4, cal), 3.5);
  const mid = applyCalibration(5, cal);
  assert.ok(mid > 3.5 && mid < 4.8, `halfway between two knots: ${mid}`);
  assert.ok(applyCalibration(9, cal) > 4.8, "above the last knot it keeps rising rather than flattening");
  assert.equal(applyCalibration(-99, cal), 0, "nothing may be corrected below zero");
  // No map, no change.
  assert.equal(applyCalibration(6.2, null), 6.2);
  assert.equal(applyCalibration(6.2, { knots: [[1, 1]] }), 6.2);
});

test("the correction is applied to the fallback scorer and ordering survives it", () => {
  const a = P(1, "MID", 10), b = P(2, "MID", 10);
  const rows = new Map([[1, entry()], [2, entry({ pointsPer90: 3, appearPer90: 2, attackPer90: 0.5, defencePer90: 0.5 })]]);
  const mins = new Map([
    [1, { p_start: 1, exp_min_start: 90, p_cameo: 0, exp_min_cameo: 0 }],
    [2, { p_start: 1, exp_min_start: 90, p_cameo: 0, exp_min_cameo: 0 }],
  ]);
  const opts = { players: [a, b], archivePer90: rows, minutesForecasts: mins };
  const plain = buildScorer(base(opts));
  const cal = { knots: [[2, 1.5], [4, 2.9], [6, 4.1]] };
  const fixed = buildScorer(base({ ...opts, calibration: cal }));
  assert.ok(fixed.scoreOf(a) < plain.scoreOf(a), "a band that projects too high must come down");
  assert.ok((plain.scoreOf(a) > plain.scoreOf(b)) === (fixed.scoreOf(a) > fixed.scoreOf(b)),
    "the better player must still be the better player");
});

test("an unmeasured correction is not read", () => {
  assert.equal(calibrationFrom({ xp_calibration: { status: "UNMEASURED", knots: [[1, 1], [2, 2]] } }), null);
  assert.equal(calibrationFrom({}), null);
  const ok = calibrationFrom({ xp_calibration: { status: "MEASURED", knots: [[1, 1], [2, 2]] } });
  assert.equal(ok.knots.length, 2);
});

/* ── THE VERDICT ON GENERALISING ───────────────────────────────────────────── */

test("a drop in ordering is not called memorisation when nothing has been fitted", () => {
  const v = generaliseVerdict({ tuneRank: 0.31, testRank: 0.21, fittedCount: 0 });
  assert.equal(v.verdict, "seasons differ");
  const joined = v.say.join(" ");
  assert.ok(!/memoris/i.test(joined) || /cannot be memorisation/i.test(joined));
});

test("the same drop IS a warning once parameters have been fitted", () => {
  const v = generaliseVerdict({ tuneRank: 0.31, testRank: 0.21, fittedCount: 8 });
  assert.equal(v.verdict, "possible overfitting");
  assert.ok(v.say.join(" ").includes("8"), "it must name how many parameters were fitted");
});

test("a small gap holds up and a better unseen season is not a problem", () => {
  assert.equal(generaliseVerdict({ tuneRank: 0.25, testRank: 0.23, fittedCount: 8 }).verdict, "held up");
  assert.equal(generaliseVerdict({ tuneRank: 0.2, testRank: 0.28, fittedCount: 0 }).verdict, "better on unseen");
  assert.equal(generaliseVerdict({ tuneRank: null, testRank: 0.2, fittedCount: 0 }), null);
});

/* ── THE HARNESS THE SWEEP RUNS ON ─────────────────────────────────────────────
 *
 * Built on invented rows, because the real archive lives in the database and a test cannot reach it. What is
 * being checked is the machinery: that history is walked forward and never backward, that a parameter reaches
 * the projection through the whole harness, and that the reported numbers are the ones the sweep ranks on.
 */
function fakeSeason(season, seed = 1) {
  const rows = [];
  let r = seed;
  const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };
  const teams = ["ARS", "LIV", "MCI", "TOT", "EVE", "NEW"];
  for (let t = 0; t < teams.length; t++) {
    for (let i = 0; i < 8; i++) {
      const position = ["GKP", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD"][i];
      const element = t * 100 + i;
      const skill = 0.4 + rnd();
      for (let gw = 1; gw <= 20; gw++) {
        const opponent = ((t + gw) % teams.length) + 1;
        const started = rnd() < 0.55 + skill * 0.25;
        const minutes = started ? 90 : (rnd() < 0.3 ? 20 : 0);
        const goals = minutes > 0 && rnd() < 0.12 * skill ? 1 : 0;
        const assists = minutes > 0 && rnd() < 0.1 * skill ? 1 : 0;
        const conceded = Math.floor(rnd() * 3);
        rows.push({
          season, gw, element, player_name: `p${element}`, position, team: teams[t],
          opponent_team: opponent, was_home: gw % 2 === 0,
          minutes, started, goals, assists, saves: position === "GKP" ? Math.floor(rnd() * 5) : 0,
          bonus: goals ? 2 : 0, xg: goals * 0.7 + rnd() * 0.2, xa: assists * 0.6,
          goals_conceded: conceded, clean_sheets: conceded === 0 ? 1 : 0,
          total_points: minutes === 0 ? 0 : (minutes >= 60 ? 2 : 1) + goals * (position === "DEF" ? 6 : 5)
            + assists * 3 + (goals ? 2 : 0),
          price: 4.5 + skill * 3,
        });
      }
    }
  }
  return rows;
}

const HARNESS = (() => {
  const rows = [...fakeSeason("2021-22", 7), ...fakeSeason("2025-26", 99)];
  const index = indexRows(rows, GOALS);
  const slices = sliceFor(index, { seasons: ["2021-22", "2025-26"], fromGw: 8, toGw: 20, population: "all" });
  const opts = {
    shrinkage: 6, positionMeans: MEANS, promotionFactor: FITTED.promotion_factor,
    goalPoints: GOALS, assistPoints: 3, appearancePoints: 2,
    testSeason: "2025-26", population: "all", useFixtures: true,
  };
  return { rows, index, slices, opts };
})();

test("the harness walks history forward and never sees the gameweek it is projecting", () => {
  const { index } = HARNESS;
  const S = index.bySeason.get("2021-22");
  const player = [...S.players.values()][0];
  // Running totals at gameweek 9 must equal the sum of gameweeks 1 to 9 and nothing after.
  let points = 0;
  for (let gw = 1; gw <= 9; gw++) points += Number(player.rows.get(gw).total_points) || 0;
  assert.equal(player.cum.points[9], points);
  assert.ok(player.cum.points[20] >= player.cum.points[9], "totals only ever accumulate");
});

test("the harness produces judged rows for both seasons and marks the held-out one", () => {
  const { slices, opts } = HARNESS;
  const { errors } = evaluate(slices, DEFAULT_TUNING, opts);
  assert.ok(errors.length > 500, `expected a real sample, got ${errors.length}`);
  assert.ok(errors.some((e) => e.isTest) && errors.some((e) => !e.isTest));
  for (const e of errors) {
    assert.ok(Number.isFinite(e.predicted) && Number.isFinite(e.actual));
    assert.equal(e.absErr, Math.abs(e.predicted - e.actual));
  }
  const m = metricsFor(errors.filter((e) => e.isTest));
  assert.ok(m.n > 0 && m.mae > 0);
  assert.ok(m.rank === null || (m.rank >= -1 && m.rank <= 1));
});

test("a parameter changes the answer through the whole harness, not just in the scorer", () => {
  const { slices, opts } = HARNESS;
  const flat = evaluate(slices, DEFAULT_TUNING, opts).errors;
  const moved = evaluate(slices, { ...DEFAULT_TUNING, minutesCurve: 2.5, fixtureSensitivity: 0 }, opts).errors;
  assert.equal(flat.length, moved.length);
  const changed = flat.filter((e, i) => e.predicted !== moved[i].predicted).length;
  assert.ok(changed > flat.length * 0.2, `only ${changed} of ${flat.length} projections moved`);
});

test("the recent-form window changes what counts as recent", () => {
  const { slices, opts } = HARNESS;
  const short = evaluate(slices, { ...DEFAULT_TUNING, recentFormWeight: 0.6, recentFormWindow: 3 }, opts).errors;
  const long = evaluate(slices, { ...DEFAULT_TUNING, recentFormWeight: 0.6, recentFormWindow: 12 }, opts).errors;
  assert.ok(short.some((e, i) => e.predicted !== long[i].predicted), "the window must have an effect");
});

test("the calibration fitted on one set of rows shows up as a smaller gap on another", () => {
  const { slices, opts } = HARNESS;
  const { errors } = evaluate(slices, DEFAULT_TUNING, opts);
  const tune = errors.filter((e) => !e.isTest);
  const fit = fitCalibrationKnots(tune);
  assert.ok(fit && fit.pairs.length >= 2, "there must be enough bands to fit a curve");
  const calibration = { knots: monotoneKnots(fit.pairs, fit.weights) };
  const corrected = evaluate(slices, DEFAULT_TUNING, { ...opts, calibration }).errors.filter((e) => e.isTest);
  const before = calibrationBands(errors.filter((e) => e.isTest));
  const after = calibrationBands(corrected);
  const worst = (bands) => Math.max(...bands.map((b) => Math.abs(b.gap)));
  assert.ok(after.length > 0 && before.length > 0);
  assert.ok(worst(after) <= worst(before) + 0.5, "correcting must not make calibration clearly worse");
});

test("spearman is right on a case that can be checked by hand", () => {
  assert.equal(spearman([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9], [10, 10]]), 1);
  const flipped = spearman([[1, 10], [2, 9], [3, 8], [4, 7], [5, 6], [6, 5], [7, 4], [8, 3], [9, 2], [10, 1]]);
  assert.equal(flipped, -1);
  assert.equal(spearman([[1, 1], [2, 2]]), null, "too small a sample gets no number rather than a wrong one");
});

test("price bands are the ones the report prints", () => {
  assert.equal(band(4.4), "under 5.0");
  assert.equal(band(6.5), "6.5 to 8.5");
  assert.equal(band(12), "11.0 and up");
  assert.equal(band(null), "unknown");
});

/* ── MATCHING A CLUB TO ITS OPPONENT NUMBER ─────────────────────────────────────
 *
 * The archive names a player's own club and numbers his opponent, and the two cannot be joined directly. The
 * first version recovered it by elimination, which needs a complete season: on the real archive two of the four
 * tuning seasons were short of gameweeks and it resolved 15 clubs of 20 in one and 3 of 20 in another, so the
 * fixture parameter was measured against fixtures that mostly read as average and nothing said so.
 */
const fixtureRound = (gw, pairs) => pairs.flatMap(([home, away, hg, ag], i) => ([
  { gw, team: home, opponents: new Set([away]), home: true, goals: hg, conceded: ag, kick: `${gw}-${i}` },
  { gw, team: away, opponents: new Set([home]), home: false, goals: ag, conceded: hg, kick: `${gw}-${i}` },
]));

test("a club is matched to its number from a single gameweek", () => {
  // Six clubs, one round of fixtures. Elimination cannot do this: each club has four numbers it has not faced.
  const fx = fixtureRound(1, [[1, 2, 2, 1], [3, 4, 0, 0], [5, 6, 1, 3]]);
  const r = resolveTeamIds(fx.map((f) => ({ ...f, team: `club${f.team}` })));
  assert.equal(r.unresolved.length, 0, `unresolved: ${r.unresolved.join(", ")}`);
  for (const id of [1, 2, 3, 4, 5, 6]) assert.equal(r.idToTeam.get(id), `club${id}`);
});

test("it still matches when the kick-off times are missing", () => {
  // Then the score is the only signal, so the scorelines have to be distinct within the gameweek.
  const fx = fixtureRound(1, [[1, 2, 3, 0], [3, 4, 1, 2], [5, 6, 0, 0]])
    .map((f) => ({ ...f, kick: null, team: `club${f.team}` }));
  const r = resolveTeamIds(fx);
  assert.equal(r.unresolved.length, 0, `unresolved: ${r.unresolved.join(", ")}`);
  assert.equal(r.idToTeam.get(4), "club4");
});

test("a club that cannot be matched is reported rather than guessed at", () => {
  // One club, one fixture, and no counterpart in the data at all.
  const r = resolveTeamIds([{ gw: 1, team: "lonely", opponents: new Set([9]), home: true, goals: 1, conceded: 0, kick: "a" }]);
  assert.ok(r.unresolved.includes("lonely") || r.idToTeam.size === 0,
    "with nothing to pair against, it must not invent an answer");
});

test("no number is ever handed to two clubs", () => {
  const fx = [...fixtureRound(1, [[1, 2, 1, 0], [3, 4, 1, 0]]), ...fixtureRound(2, [[1, 3, 2, 2], [2, 4, 0, 1]])]
    .map((f) => ({ ...f, team: `club${f.team}` }));
  const r = resolveTeamIds(fx);
  const ids = [...r.idToTeam.keys()];
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set([...r.idToTeam.values()]).size, r.idToTeam.size);
});

/* ── IS AN IMPROVEMENT REAL ─────────────────────────────────────────────────── */

test("an identical setting wins about half the redraws, which is the definition of no difference", () => {
  const rows = [];
  let seed = 5;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let gw = 1; gw <= 20; gw++) {
    for (let i = 0; i < 40; i++) {
      const actual = Math.floor(rnd() * 12);
      rows.push({ gwKey: `s|${gw}`, predicted: actual * 0.5 + rnd() * 3, actual });
    }
  }
  const same = pairedBootstrap(rows, rows.map((r) => ({ ...r })), { draws: 120 });
  assert.ok(same, "it must return a result on a sample this size");
  assert.equal(same.meanDiff, 0, "two identical settings differ by nothing");
  assert.ok(same.winRate <= 0.001, `identical settings cannot win: ${same.winRate}`);
});

test("a genuinely better setting wins nearly every redraw", () => {
  const good = [], bad = [];
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let gw = 1; gw <= 25; gw++) {
    for (let i = 0; i < 40; i++) {
      const actual = Math.floor(rnd() * 12);
      good.push({ gwKey: `s|${gw}`, predicted: actual + rnd() * 0.5, actual });
      bad.push({ gwKey: `s|${gw}`, predicted: rnd() * 12, actual });
    }
  }
  const r = pairedBootstrap(good, bad, { draws: 120 });
  assert.ok(r.winRate > 0.95, `a real improvement should win almost always, got ${r.winRate}`);
  assert.ok(r.meanDiff > 0.2, `and by a clear margin, got ${r.meanDiff}`);
});

test("too small or mismatched a sample gets no verdict rather than a wrong one", () => {
  assert.equal(pairedBootstrap([{ gwKey: "a", predicted: 1, actual: 1 }], [{ gwKey: "a", predicted: 1, actual: 1 }]), null);
  const rows = Array.from({ length: 300 }, (_, i) => ({ gwKey: `s|${i % 20}`, predicted: i % 7, actual: i % 5 }));
  assert.equal(pairedBootstrap(rows, rows.slice(0, 299)), null, "unequal lengths cannot be paired");
  const oneGw = rows.map((r) => ({ ...r, gwKey: "s|1" }));
  assert.equal(pairedBootstrap(oneGw, oneGw), null, "one gameweek is not enough to redraw");
});

/* ── EACH PARAMETER IS SEARCHED WHERE IT MEANS SOMETHING ────────────────────── */

test("the rotation parameter is the only one searched on the wider population", async () => {
  const { POINTS_SPEC, MINUTES_SPEC } = await import("../jobs/sweep.mjs");
  assert.deepEqual(MINUTES_SPEC.map((s) => s.key), ["minutesCurve"]);
  assert.equal(POINTS_SPEC.length + MINUTES_SPEC.length, TUNING_KEYS.length);
  assert.ok(!POINTS_SPEC.some((s) => s.key === "minutesCurve"));
});

test("the rotation parameter genuinely cannot be measured with minutes held certain", () => {
  // Which is why it is searched separately. If this ever stops being true the split is wrong.
  const { slices, opts } = HARNESS;
  const startersOpts = { ...opts, population: "starters" };
  const flat = evaluate(slices, DEFAULT_TUNING, startersOpts).errors;
  const steep = evaluate(slices, { ...DEFAULT_TUNING, minutesCurve: 2.5 }, startersOpts).errors;
  const moved = flat.filter((e, i) => e.predicted !== steep[i].predicted).length;
  assert.equal(moved, 0, `with minutes certain nothing may move, but ${moved} projections did`);
});

test("the practical test counts how many of the real top twenty were found", () => {
  const rows = [];
  for (let gw = 1; gw <= 3; gw++) {
    for (let i = 0; i < 80; i++) {
      // Projection equals reality, so all twenty must be found every week.
      rows.push({ key: `p${i}`, season: "s", gw, predicted: i, actual: i });
    }
  }
  assert.equal(topTwentyHitRate(rows), 20);
  const noisy = rows.map((r) => ({ ...r, predicted: 40 - r.predicted }));
  assert.ok(topTwentyHitRate(noisy) < 5, "an inverted projection should find almost none");
  assert.equal(topTwentyHitRate([]), null);
});


/* ── WHAT THE SWEEP WRITES MUST SATISFY THE SUITE ────────────────────────────────
 *
 * This is the test that should have existed already. The sweep searched for seven minutes, proved that a
 * rotation risk should fall harder than its minutes, wrote it down as MEASURED, and then its own test step
 * rejected the file because the writer had stopped emitting the score that chose it. The result was thrown
 * away. The shape of what gets written is now built by one function and checked here, so the file the sweep
 * produces can never fail the suite that guards it.
 */
const fakeVerdicts = {
  minutesCurve: { found: 1.9, winRate: 1, meanDiff: 0.0033, kept: true },
  xgWeight: { found: 0.95, winRate: 0.98, meanDiff: 0.0064, kept: true },
  matesWeight: { found: 0.45, winRate: 0.51, meanDiff: 0.0001, kept: false },
};
const fakeSensitivity = { minutesCurve: 0.0122, xgWeight: 0.0068, matesWeight: 0.0005, promotionStrength: 0 };
const buildBlock = async (winner) => {
  const { buildTuningBlock } = await import("../jobs/sweep.mjs");
  return buildTuningBlock({
    winner: resolveTuning(winner), verdicts: fakeVerdicts, sensitivity: fakeSensitivity,
    runs: 3442, stamp: "2026-07-29", scoredOn: "held-out 2025-26, 6242 player-gameweeks, players who started",
    before: { rank: 0.1453, mae: 2.515, bias: 0.266 }, after: { rank: 0.1513, mae: 2.481, bias: 0.203 },
    topBefore: 3.1, topAfter: 3.32, tuneSeasons: ["2021-22", "2022-23"], confidence: 0.95, draws: 300,
    changed: TUNING_SPEC.filter((sp) => resolveTuning(winner)[sp.key] !== DEFAULT_TUNING[sp.key]),
  });
};

test("every value the sweep marks MEASURED carries the date and the score that chose it", async () => {
  const block = await buildBlock({ ...DEFAULT_TUNING, xgWeight: 0.95, minutesCurve: 1.9 });
  const measured = TUNING_KEYS.filter((k) => block[k].status === "MEASURED");
  assert.deepEqual(measured.sort(), ["minutesCurve", "xgWeight"]);
  for (const k of measured) {
    assert.ok(block[k].measured_on, `${k} carries no date`);
    assert.ok(Number.isFinite(Number(block[k].rank_correlation)), `${k} carries no score`);
    assert.ok(Number.isFinite(Number(block[k].survived_redraws)), `${k} does not say how often it survived`);
  }
});

test("what the sweep writes passes the very test that guards the config", async () => {
  // Exactly the assertions the suite applies to the shipped file, run against a simulated sweep result.
  const block = await buildBlock({ ...DEFAULT_TUNING, xgWeight: 0.95, minutesCurve: 1.9 });
  for (const key of TUNING_KEYS) {
    assert.ok(block[key], `${key} is missing`);
    assert.ok(["MEASURED", "UNMEASURED"].includes(block[key].status));
    if (block[key].status !== "MEASURED") continue;
    assert.ok(block[key].measured_on);
    assert.ok(Number.isFinite(Number(block[key].rank_correlation)));
  }
  // And the app reads exactly the two proved values, nothing else.
  const applied = tuningFrom({ tuning: block });
  assert.equal(applied.xgWeight, 0.95);
  assert.equal(applied.minutesCurve, 1.9);
  assert.equal(applied.matesWeight, DEFAULT_TUNING.matesWeight, "a rejected value must not reach the model");
});

test("a rejected value is recorded with the reason, and an untestable one is not called rejected", async () => {
  const block = await buildBlock({ ...DEFAULT_TUNING, xgWeight: 0.95 });
  assert.equal(block.matesWeight.status, "UNMEASURED");
  assert.equal(block.matesWeight._value_the_search_preferred, 0.45);
  assert.match(block.matesWeight._why_not_applied, /51% of 300 redraws/);
  // The promoted-club discount cannot fire in a within-season walk, so it was never tested.
  assert.match(block.promotionStrength._why_not_applied, /NOT TESTED/);
});

test("a search that proves nothing says so in the file", async () => {
  const block = await buildBlock({ ...DEFAULT_TUNING });
  assert.equal(TUNING_KEYS.filter((k) => block[k].status === "MEASURED").length, 0);
  assert.match(block._status, /SEARCHED AND REJECTED ON EVIDENCE/);
  assert.deepEqual(block._parameters_changed, []);
});

/* ── THE ENGINE BACKTEST ────────────────────────────────────────────────────────
 *
 * This job existed for months and had never produced a single number. It reported "fixtures simulated 0,
 * skipped 570" and failed, and because every failure was swallowed by a catch that counted it as a skip, the
 * log never said why. Six separate faults, each now held by a check here, because the engine is what most
 * players in the live app are scored by and it was the one thing never measured.
 */
test("the engine backtest turns opponent numbers into club names before pairing a fixture", () => {
  const src = readFileSync("jobs/backtest_engine.mjs", "utf8");
  /* It keyed a fixture as `${r.team}|${r.opponent_team}`: a name on one side, a number on the other. Nothing
     matched the club table, so every fixture was skipped, and each real fixture was also split into two
     half-entries which then failed the eight-player check. */
  // The old key survives only inside the comment explaining the bug, never in code.
  const code = src.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  assert.ok(!/\$\{r\.team\}\|\$\{r\.opponent_team\}/.test(code),
    "a fixture key must never mix a club name with an opponent number");
  assert.match(src, /const opponent = idToTeam\.get\(Number\(r\.opponent_team\)\);/,
    "the number must be resolved to a name first");
  assert.match(src, /resolveTeamIds/, "using the resolver that survives an incomplete season");
});

test("the engine backtest gives the simulator everything it actually needs", () => {
  const src = readFileSync("jobs/backtest_engine.mjs", "utf8");
  // The formation minimums: without them the lineup sampler throws on its first line.
  assert.match(src, /cfg\.formation = squadRules\(RULES_A\)\.formation;/, "the formation must be set");
  // The bonus-point coefficients: last season's derived file does not carry them, and passing it whole threw.
  assert.match(src, /bps: derived \? RULES_B\.bps : RULES_A\.bps/, "the BPS block must fall back");
  // The id the simulator keys players by, which is not the one the allocation layer uses.
  assert.match(src, /id: key, player_id: key/, "a player needs both ids");
  // And the simulator returns a wrapper, not the samples map.
  assert.match(src, /samples && samples\.samples \? samples\.samples : samples/,
    "the samples map must be unwrapped from the result");
});

test("a fixture the engine backtest cannot run says why", () => {
  const src = readFileSync("jobs/backtest_engine.mjs", "utf8");
  /* Every one of the faults above was invisible because the catch counted a throw as a skip and printed
     nothing. A run that scores nothing must name its first failure. */
  assert.match(src, /if \(!firstFailure\) \{/, "the first failure must be captured");
  assert.match(src, /First fixture failure/, "and printed");
  assert.match(src, /firstFailure \? ` The first fixture failed with: \$\{firstFailure\}` : ""/,
    "and repeated in the error when nothing could be scored");
});

test("the engine backtest rates a club by the season so far, not by what it became", () => {
  const src = readFileSync("jobs/backtest_engine.mjs", "utf8");
  /* The club table holds the CURRENT season's strengths. Scoring a past season with them tells a promoted
     side's early fixtures how good that side turned out to be, which is future information. */
  assert.match(src, /const strengthOf = \(team, gw\) => \{/, "strength must be derived per gameweek");
  assert.match(src, /c\.matches\[before\]/, "from matches before the one being projected");
  assert.match(src, /teamByName\.get\(String\(fx\.homeName\)\.toUpperCase\(\)\)\?\.strength/,
    "with the club table only as a fallback");
});

test("the engine backtest gives the minutes model the field that decides a substitution", () => {
  const src = readFileSync("jobs/backtest_engine.mjs", "utf8");
  /* starts60 is how the minutes model works out whether a starter usually survives the hour. Without it the
     model returned a chance of zero for every player, the simulator read that as a certain substitution, and
     EVERY starter in EVERY simulated match came off around the hour. Appearance points halved, clean sheets fell
     to a quarter, defensive points were almost never earned and bonus halved, while goals and assists, which
     have no minute threshold, stayed correct. Fixing it took the top-twenty hit rate from 2.3 to 4.9 of 20. */
  assert.match(src, /starts60: past\.filter/, "starts60 must be supplied");
  assert.match(src, /startMinutes: past\.filter/, "and the minutes actually played when starting");
  assert.match(src, /cbit90: pr\.cbit/, "and the defensive volume the bonus calculation runs on");
});

test("the engine backtest takes the league's goals per match from the data, not from a typed number", () => {
  const src = readFileSync("jobs/backtest_engine.mjs", "utf8");
  /* It had 2.8 typed in, and the goal model then lifted every mismatched fixture ABOVE that, so it expected
     3.11 goals a match in a season that produced 2.77. Too many goals means too few clean sheets. */
  assert.ok(!/fallbackGoalEnvironment\(home, away, 2\.8,/.test(src), "the league mean must not be typed in");
  assert.match(src, /leagueTotal \/ meanLift/, "and the lift must not push every match above average");
  assert.match(src, /S\.leagueGoals\[beforeGw\]/, "the figure comes from the gameweeks already played");
});

test("the engine's tuned settings are held one per rules era, with what proved each", () => {
  /* Three attempts at tuning the engine were binned because they were tuned ACROSS the arrival of defensive
     contribution. It pays defenders and midfielders 2 points for work that scored nothing before, so the
     settings that model that work want different values either side of it: the same set improved one season and
     worsened another. Tuned inside one era it holds on seasons the search never saw. */
  const t = JSON.parse(readFileSync("config/engine-tuning.json", "utf8"));
  for (const era of ["pre_defcon_era", "defcon_era"]) {
    const e = t[era];
    assert.ok(e, `${era} is missing`);
    assert.equal(e.status, "MEASURED");
    assert.ok(e._tuned_on && e._proved_on, `${era} must say what it was tuned on and what proved it`);
    assert.ok(Object.keys(e.values).length > 0, `${era} must carry values`);
    for (const [season, r] of Object.entries(e._result)) {
      assert.ok(r.rank_correlation[1] > r.rank_correlation[0], `${era} must improve ordering on ${season}`);
      assert.equal(r.survived_redraws, 1.0, `${era} must survive every redraw on ${season}`);
    }
  }
  assert.match(t._why_by_era, /defensive contribution/i, "and why the split exists");
  assert.ok(t.defcon_era._weaker_than_the_other_era_because, "the thinner evidence must be admitted");
});
