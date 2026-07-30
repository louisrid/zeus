/* THE CONTRACT BETWEEN THE ENGINE AND THE SCREEN.
 *
 * Every test here exists because its absence caused a specific, traceable wrong number on screen. They are
 * invariants, not tuning: none of them asserts that a projection is a particular size, only that the same
 * inputs produce the same minutes on both sides, that an engine projection reaches the screen intact, and
 * that nothing is silently substituted for it.
 *
 * The case they were all written from: Osula, GW1 2026-27. Engine ep_mean 1.584 at a 28.6% chance of
 * starting; displayed 5.3 from his last season's 8.497 points per 90. Four separate faults combined, and
 * each one now has a test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { buildScorer } from "../lib/solver/score.mjs";
import { resolveMinutes, expectedMinutesOf, minutesInputVersion, lineupRolesOf } from "../lib/minutes_resolved.mjs";
import { forecastMinutes, normaliseTeamStarts } from "../lib/engine/layer3_minutes.mjs";
import { allocateTeam, positionalSharePriors } from "../lib/engine/layer2_allocation.mjs";
import { engineConfig } from "../lib/engine/config.mjs";
import { LINEUP_MINUTES } from "../lib/lineups.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
const CFG = engineConfig(readJson("config/engine-2026-27.json"));

const league = { startRate: 0.6, appearRate: 0.75, survive60: 0.8, expMinStart: 82, expMinCameo: 20 };
const osulaLike = {
  minutes: 805, appearances: 24, starts: 8, starts60: 6, startMinutes: 640,
  cameos: 16, cameoMinutes: 165, teamGames: 38, teamMinutesAvailable: 38 * 90,
  position: "FWD", status: "a", chance_of_playing: null,
};

/* ── 1. The engine and the scorer resolve identical minutes ─────────────────────────── */

test("the engine and the scorer resolve identical minutes from identical inputs", () => {
  /* They used to resolve separately: the engine from forecastMinutes, the screen from forecastMinutes PLUS
     the predicted eleven, applied afterwards. One of them then had to reconcile the difference, and it did so
     by discarding the simulation. Both sides now call resolveMinutes, so a difference is impossible unless
     the inputs differ. */
  const base = forecastMinutes({ player: osulaLike, league, signal: null, gw: 1, cfg: CFG });

  for (const lineup of [null, "starter", "notNamed"]) {
    for (const status of ["a", "d", "i"]) {
      const engineSide = resolveMinutes({ base, lineup, status, earlySubShare: CFG.earlySubShare ?? 0 });
      const screenSide = resolveMinutes({ base, lineup, status, earlySubShare: CFG.earlySubShare ?? 0 });
      assert.deepEqual(screenSide, engineSide,
        `lineup=${lineup} status=${status}: the two sides must resolve to the same minutes`);
      for (const k of ["p_start", "p_cameo", "p60", "exp_min_start", "exp_min_cameo"]) {
        assert.ok(Number.isFinite(Number(engineSide[k])), `${k} must be a number, got ${engineSide[k]}`);
      }
    }
  }
});

test("hard unavailability beats a predicted eleven, and a doubt does not double-count", () => {
  const base = forecastMinutes({ player: osulaLike, league, signal: null, gw: 1, cfg: CFG });
  const injured = resolveMinutes({ base, lineup: "starter", status: "i" });
  assert.equal(injured.p_start, 0, "a suspended or injured player cannot start, whatever an eleven says");
  assert.equal(injured.minutes_source, "unavailable");

  /* forecastMinutes already scales by availability, so the resolver must not apply it a second time. */
  const doubtful = { ...osulaLike, status: "d" };
  const doubtfulBase = forecastMinutes({ player: doubtful, league, signal: null, gw: 1, cfg: CFG });
  const resolved = resolveMinutes({ base: doubtfulBase, lineup: null, status: "d" });
  assert.equal(resolved.p_start, doubtfulBase.p_start, "a doubt is applied once, in the forecast");
});

/* ── 2. A lineup override reaches the simulation, not just the display ──────────────── */

test("a predicted eleven changes the minutes the simulation itself runs on", () => {
  /* The whole Osula failure began here: the eleven was read only by the display layer, so the simulation
     priced him at 28.6% and the screen then treated him as nailed. */
  const base = forecastMinutes({ player: osulaLike, league, signal: null, gw: 1, cfg: CFG });
  assert.ok(base.p_start < 0.6, `the raw forecast should be modest for 8 starts in 38, got ${base.p_start}`);

  const named = resolveMinutes({ base, lineup: "starter", status: "a", earlySubShare: CFG.earlySubShare ?? 0 });
  assert.equal(named.p_start, LINEUP_MINUTES.starter.p_start, "a named starter is simulated as a starter");
  assert.equal(named.exp_min_start, base.exp_min_start, "lineup certainty must not invent a 90-minute substitution profile");
  assert.ok(expectedMinutesOf(named) > expectedMinutesOf(base) * 2,
    "and his expected minutes must actually rise, or the simulation has not been told");
});

test("normalising a squad to eleven starters leaves a published eleven alone", () => {
  /* Scaling a resolved eleven so it sums to eleven would drag a named starter below one, which reintroduces
     the same engine-versus-screen gap by a different door. */
  const positions = ["GKP", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD",
    "GKP", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD"];
  const squad = positions.map((position, i) => ({
    player_id: i, position,
    p_start: i < 11 ? 1 : 0, p_cameo: i < 11 ? 0 : 0.25, p60_given_start: 0.8,
    exp_min_start: i < 11 ? 82 : 75, exp_min_cameo: 18,
    minutes_source: i < 11 ? "lineup-starter" : "lineup-notNamed",
  }));
  normaliseTeamStarts(squad, CFG);
  for (let i = 0; i < 11; i++) assert.equal(squad[i].p_start, 1, "a named starter stays at one");
  for (let i = 11; i < squad.length; i++) assert.equal(squad[i].p_start, 0, "a named bench player stays at zero");

  // With no lineup information the normalisation still does its job.
  const blind = squad.map((p) => ({ ...p, p_start: 0.2, minutes_source: "forecast" }));
  normaliseTeamStarts(blind, CFG);
  const sum = blind.reduce((s, p) => s + p.p_start, 0);
  assert.ok(Math.abs(sum - 11) < 0.6, `a forecast-only squad is scaled toward eleven starters, got ${sum}`);
});

/* ── 3. An engine row is never multiplied by minutes again ──────────────────────────── */

test("an engine projection is never multiplied by minutes at display time", () => {
  /* The simulation samples starts, appearances, minutes and the sub-off hazard, so ep_mean already carries
     minutes. The display multiplied by (expected minutes / 90) ^ 1.6 as well: at 26.6 expected minutes that
     kept 17% of the projection, turning a stored 3.9 into 0.8 and a stored 4.9 into 1.9. */
  const players = [{ fpl_id: 1, position: "FWD", team_id: 4 }];
  const build = (minRow) => buildScorer({
    projections: new Map([[1, { ep_mean: 4.9 }]]),
    perGw: new Map([[1, [{ gw: 1, ep_mean: 4.9, p10: 0, p90: 9 }]]]),
    archivePer90: new Map([[1, { pointsPer90: 4, nineties: 20 }]]),
    understat: new Map(), envByTeam: null, leagueMeanGoals: null,
    goalPoints: { FWD: 4 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 6, positionMeans: { FWD: 4.267 }, players,
    minutesForecasts: new Map([[1, minRow]]),
  });
  const p = { fpl_id: 1, position: "FWD", team_id: 4, status: "a", chance_of_playing: null };

  const rotation = { p_start: 0.28, p_cameo: 0.39, exp_min_start: 76.75, exp_min_cameo: 11.94, p60_given_start: 0.8 };
  const nailed = { p_start: 1, p_cameo: 0, exp_min_start: 90, exp_min_cameo: 0, p60_given_start: 0.8 };

  assert.equal(build(rotation).scoreOf(p), 4.9,
    "a rotation risk shows what the engine said, because the engine already priced the rotation");
  assert.equal(build(nailed).scoreOf(p), 4.9, "and so does a nailed starter");

  // The only thing minutes may still do is zero a player with no expected appearance at all.
  const absent = { p_start: 0, p_cameo: 0, exp_min_start: 0, exp_min_cameo: 0, p60_given_start: 0 };
  assert.equal(build(absent).scoreOf(p), 0, "no expected appearance is a zero, never a fraction");
});

/* ── 4. An engine row is never replaced by archive production ───────────────────────── */

test("an engine projection is never replaced by historical points per 90", () => {
  const players = [{ fpl_id: 1, position: "FWD", team_id: 4 }];
  const s = buildScorer({
    projections: new Map([[1, { ep_mean: 1.584 }]]),
    perGw: new Map([[1, [{ gw: 1, ep_mean: 1.584, p10: 0, p90: 6 }]]]),
    // The real numbers: 76 points over 8.944 nineties is 8.497 per 90, which became the displayed 5.3.
    archivePer90: new Map([[1, { pointsPer90: 8.497, nineties: 8.944, appearPer90: 2, attackPer90: 3.1, defencePer90: 0 }]]),
    understat: new Map(), envByTeam: null, leagueMeanGoals: null,
    goalPoints: { FWD: 4 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 6, positionMeans: { FWD: 4.267 }, players,
    minutesForecasts: new Map([[1, { p_start: 1, exp_min_start: 90, p_cameo: 0, exp_min_cameo: 0, p60_given_start: 0.8 }]]),
  });
  const p = { fpl_id: 1, position: "FWD", team_id: 4, status: "a", chance_of_playing: null };
  assert.equal(s.scoreOf(p), 1.58, "the engine's number survives contact with a hot historical sample");
  assert.equal(s.routeOf(p), "engine", "and the route says so plainly");
});

test("a stale engine row is reported as stale and its number is left alone", () => {
  /* Freshness is decided by comparing input stamps, never by asking whether the answer looks too small. The
     old rule asked the second question and threw away correct output whenever the engine disagreed with a
     position average. */
  const players = [{ fpl_id: 1, position: "FWD", team_id: 4 }];
  const mk = (stored, current) => buildScorer({
    projections: new Map([[1, { ep_mean: 1.584, minutes_input_version: stored, lineup_version: "2026-07-28#20" }]]),
    archivePer90: new Map([[1, { pointsPer90: 8.497, nineties: 8.944 }]]),
    understat: new Map(), envByTeam: null, leagueMeanGoals: null,
    goalPoints: { FWD: 4 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 6, positionMeans: { FWD: 4.267 }, players,
    minutesForecasts: new Map([[1, { p_start: 1, exp_min_start: 90, p_cameo: 0, exp_min_cameo: 0, p60_given_start: 0.8 }]]),
    minutesMeta: new Map([[1, { minutes_source: "lineup-starter", minutes_input_version: current }]]),
    lineupVersion: "2026-07-28#20",
  });
  const p = { fpl_id: 1, position: "FWD", team_id: 4, status: "a", chance_of_playing: null };

  const same = "abc";
  assert.equal(mk(same, same).staleOf(p).stale, false, "matching inputs are not stale");

  const moved = mk(same, "def");
  assert.equal(moved.staleOf(p).stale, true, "changed inputs are reported as stale");
  assert.equal(moved.scoreOf(p), 1.58, "and staleness does not change the number by one point");
});

/* ── 5. The two scoring paths agree, by construction ───────────────────────────────── */

test("scoreOf and scoreForGw return the same engine value for the same gameweek", () => {
  /* They were two copies of the same forty lines. The double minutes penalty was removed from one and left
     in the other, and the Players page called the one that was missed, so a fix was reported as shipped
     while the screen still showed the bug. */
  const players = [{ fpl_id: 1, position: "MID", team_id: 7 }];
  for (const ep of [0.4, 1.584, 4.9, 9.2]) {
    const s = buildScorer({
      projections: new Map([[1, { ep_mean: ep }]]),
      perGw: new Map([[1, [{ gw: 1, ep_mean: ep, p10: 0, p90: ep * 2 }]]]),
      archivePer90: new Map([[1, { pointsPer90: 8.5, nineties: 9 }]]),
      understat: new Map(), envByTeam: null, leagueMeanGoals: null,
      goalPoints: { MID: 5 }, assistPoints: 3, appearancePoints: 2,
      shrinkageNineties: 6, positionMeans: { MID: 3.598 }, players,
      minutesForecasts: new Map([[1, { p_start: 0.4, exp_min_start: 80, p_cameo: 0.3, exp_min_cameo: 20, p60_given_start: 0.8 }]]),
    });
    const p = { fpl_id: 1, position: "MID", team_id: 7, status: "a", chance_of_playing: null };
    assert.equal(s.scoreForGw(p, 1), s.scoreOf(p), `the two paths must agree for ep_mean ${ep}`);
  }
});

test("there is exactly one place an engine row becomes a displayed number", () => {
  const src = readFileSync(join(ROOT, "lib/solver/score.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  assert.equal((code.match(/const engineValue = /g) || []).length, 1,
    "one shared helper, so a fix cannot be applied to one path and missed on the other");
  assert.equal((code.match(/engineValue\(/g) || []).length, 2,
    "called from exactly two places: scoreOf and scoreForGw");
  assert.doesNotMatch(code, /ep_mean\s*\)\s*\*\s*minutes/, "no engine row may be scaled by minutes");
  assert.doesNotMatch(code, /played\s*\/\s*0\.85/, "the old minutes-share multiplier must be gone");
});

/* ── 6. Promoted clubs are flagged where it matters ─────────────────────────────────── */

test("the projection job passes a real promoted flag, not a literal false", () => {
  const src = readFileSync(join(ROOT, "jobs/projections_run.mjs"), "utf8");
  assert.doesNotMatch(src, /build\(fx\.home_team,\s*false\)/,
    "hardcoding false meant prior_blend was zero for every club in the league");
  assert.doesNotMatch(src, /build\(fx\.away_team,\s*false\)/);
  assert.match(src, /build\(fx\.home_team,\s*isPromoted\(/);
  assert.match(src, /build\(fx\.away_team,\s*isPromoted\(/);
  assert.match(src, /const isPromoted = /, "and the flag is derived from data, not typed in");
});

test("a promoted squad blends toward the promoted prior inside the engine", () => {
  const mkTeam = (promoted) => ({
    promoted,
    players: Array.from({ length: 14 }, (_, i) => ({
      id: i, player_id: i, position: i < 1 ? "GKP" : i < 5 ? "DEF" : i < 10 ? "MID" : "FWD",
      npxg90: 0.15, xa90: 0.1, nineties: 4, cbit90: 2, recoveries90: 3,
    })),
  });
  const priors = positionalSharePriors([mkTeam(false)]);
  const promotedPrior = { GKP: 0.01, DEF: 0.04, MID: 0.06, FWD: 0.12 };
  const plain = allocateTeam({ team: mkTeam(false), lambda: 1.4, priors, cfg: CFG, gw: 1, promotedPrior });
  const promoted = allocateTeam({ team: mkTeam(true), lambda: 1.4, priors, cfg: CFG, gw: 1, promotedPrior });
  assert.equal(plain.promotedBlend, 0, "an established club blends nothing");
  assert.ok(promoted.promotedBlend > 0,
    `a promoted club must actually blend, got ${promoted.promotedBlend}`);
});

/* ── 7. A hot historical sample cannot outrank the engine ───────────────────────────── */

test("an Osula-style hot sample cannot displace a valid engine row in the ranking", () => {
  /* Face validity on a pool rather than one player: a nine-ninety hot streak with a valid engine row must
     rank on that engine row, so it cannot leapfrog proven starters whose engine rows are higher. */
  const players = [];
  const arch = new Map();
  const projections = new Map();
  const perGw = new Map();
  const mins = new Map();
  const add = (id, per90, nineties, ep) => {
    players.push({ fpl_id: id, position: "FWD", team_id: (id % 20) + 1 });
    arch.set(id, { pointsPer90: per90, nineties, appearPer90: 2, attackPer90: per90 * 0.4, defencePer90: 0 });
    projections.set(id, { ep_mean: ep });
    perGw.set(id, [{ gw: 1, ep_mean: ep, p10: 0, p90: ep * 2 }]);
    mins.set(id, { p_start: 1, exp_min_start: 90, p_cameo: 0, exp_min_cameo: 0, p60_given_start: 0.8 });
  };
  add(1, 8.497, 8.944, 1.584);                       // the hot thin sample
  for (let i = 2; i <= 30; i++) add(i, 4.4, 30, 3.0 + (i % 7) * 0.2); // proven starters

  const s = buildScorer({
    projections, perGw, archivePer90: arch, understat: new Map(),
    envByTeam: null, leagueMeanGoals: null,
    goalPoints: { FWD: 4 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 6, positionMeans: { FWD: 4.267 }, players, minutesForecasts: mins,
  });
  const ranked = [...players].sort((a, b) => s.scoreOf(b) - s.scoreOf(a));
  const place = ranked.findIndex((p) => p.fpl_id === 1);
  assert.ok(place > 20,
    `the hot sample must rank on its engine row, expected outside the top twenty, got place ${place + 1}`);
});

test("every loader resolves minutes through the shared function, none of its own", () => {
  /* lib/projections.js serves every page; lib/server/load.mjs serves the brief and the API routes. The fix
     was first applied to the server loader alone, which is not the one the Players page uses, so the screen
     would have kept the bug. Both are checked here by name. */
  for (const rel of ["lib/projections.js", "lib/server/load.mjs"]) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    assert.match(code, /resolveMinutes\(/, `${rel} must resolve minutes through the shared function`);
    assert.doesNotMatch(code, /minutesWithLineups\(/,
      `${rel} must not merge predicted elevens on its own after the engine has run`);
    assert.match(code, /minutesMeta/, `${rel} must pass the input stamps so staleness can be reported`);
  }
});

/* ── Rate fallback and lineup confidence ───────────────────────────────────────────── */

test("actual goals per 90 is never used as npxG per 90", () => {
  const src = readFileSync(join(ROOT, "jobs/projections_run.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  assert.doesNotMatch(code, /npxg90\s*=\s*[^;]*per90\(\s*a\s*\?\s*a\.goals/,
    "goals are an outcome, not an expectation");
  assert.doesNotMatch(code, /xa90\s*=\s*[^;]*per90\(\s*a\s*\?\s*a\.assists/);
  assert.match(code, /prior-positional/, "and the prior route is labelled in rate_source");
});

test("a validated predicted XI locks the start while preserving player-specific substitution minutes", () => {
  const base = forecastMinutes({ player: osulaLike, league, signal: null, gw: 1, cfg: CFG });
  const predicted = resolveMinutes({ base, lineup: "starter", status: "a", confidence: 0.75 });
  const officialSheet = resolveMinutes({ base, lineup: "starter", status: "a", confidence: 0.75, official: true });

  assert.equal(predicted.p_start, 1);
  assert.equal(predicted.exp_min_start, base.exp_min_start);
  assert.equal(predicted.lineup_confidence, 0.75);
  assert.equal(predicted.lineup_official, false);

  assert.equal(officialSheet.p_start, 1);
  assert.equal(officialSheet.exp_min_start, base.exp_min_start);
  assert.equal(officialSheet.lineup_confidence, 1);

  const bench = resolveMinutes({ base, lineup: "notNamed", status: "a", confidence: 0.75, earlySubShare: CFG.earlySubShare });
  assert.equal(bench.p_start, 0);
  assert.equal(bench.p_cameo, base.p_cameo, "bench probability remains player-specific before team reconciliation");
});

test("lineup confidence is read from the file and reaches the input stamp", () => {
  const lineups = readJson("config/lineups.json");
  assert.ok(typeof lineups.confidence === "number" && lineups.confidence > 0 && lineups.confidence <= 1,
    "the lineup file must state how much it is trusted");
  assert.equal(typeof lineups.official, "boolean");
  const v1 = minutesInputVersion({ lineupVersion: "x", status: "a", minutesSource: "lineup-starter", confidence: 0.75 });
  const v2 = minutesInputVersion({ lineupVersion: "x", status: "a", minutesSource: "lineup-starter", confidence: 1 });
  assert.notEqual(v1, v2, "changing the confidence must change the stamp");
});
