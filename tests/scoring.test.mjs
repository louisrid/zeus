// Scoring formulas. Each test states the decision it protects.
import test from "node:test";
import assert from "node:assert/strict";
import { lineStrength, overallScore, captaincyStrength, templateAlignment, topRankAlignment, clubConcentration, scoreSquad } from "../lib/scoring.js";
import { templateSquad } from "../lib/data.js";
import { buildScorer } from "../lib/solver/score.mjs";
import { readFileSync } from "node:fs";
import * as fsMod from "node:fs";
import { join } from "node:path";
const ROOT = process.cwd();

const P = (fpl_id, position, team, score, starting = true) => ({ fpl_id, position, team, score, starting });
const scoreOf = (p) => p.score;

const pool = [
  P(1, "GKP", "ARS", 5), P(2, "GKP", "LIV", 4), P(3, "GKP", "MCI", 3),
  P(10, "DEF", "ARS", 6), P(11, "DEF", "LIV", 5), P(12, "DEF", "MCI", 4), P(13, "DEF", "TOT", 3),
  P(20, "MID", "ARS", 9), P(21, "MID", "LIV", 8), P(22, "MID", "MCI", 4),
  P(30, "FWD", "MCI", 10), P(31, "FWD", "ARS", 5),
];

test("line strength is measured against the best line available, not an absolute (7.2)", () => {
  const squad = { players: [P(1, "GKP", "ARS", 5), P(11, "DEF", "LIV", 5), P(21, "MID", "LIV", 8), P(31, "FWD", "ARS", 5)] };
  const l = lineStrength(squad, pool, scoreOf);
  assert.equal(l.GKP, 100);          // owns the best keeper
  assert.equal(l.DEF, Math.round((5 / 6) * 100));
  assert.equal(l.MID, Math.round((8 / 9) * 100));
  assert.equal(l.FWD, 50);           // 5 against a ceiling of 10
});

test("a line with no starters scores null rather than zero (2.1)", () => {
  const squad = { players: [P(20, "MID", "ARS", 9)] };
  const l = lineStrength(squad, pool, scoreOf);
  assert.equal(l.GKP, null);
  assert.equal(l.DEF, null);
  assert.equal(l.FWD, null);
  assert.equal(l.MID, 100);
});

test("overall is starter-weighted across the lines it can score (7.1)", () => {
  const squad = { players: [P(20, "MID", "ARS", 9), P(21, "MID", "LIV", 8), P(31, "FWD", "ARS", 5)] };
  const l = lineStrength(squad, pool, scoreOf);
  // MID owns the top two so 100 across two starters; FWD is 5 of 10 so 50 across one
  assert.equal(l.MID, 100);
  assert.equal(l.FWD, 50);
  assert.equal(overallScore(l, squad), Math.round((100 * 2 + 50 * 1) / 3));
});

test("overall is null with nothing picked, never zero (2.1)", () => {
  const squad = { players: [] };
  assert.equal(overallScore(lineStrength(squad, pool, scoreOf), squad), null);
});

test("captaincy strength compares against the best armband in the pool (7.4)", () => {
  assert.equal(captaincyStrength(10, pool, scoreOf), 100);
  assert.equal(captaincyStrength(5, pool, scoreOf), 50);
  assert.equal(captaincyStrength(null, pool, scoreOf), null);
});

test("template alignment reports both sides and never a target zone (7.5, 7.6, 7.7)", () => {
  const template = [P(1, "GKP", "ARS", 5), P(10, "DEF", "ARS", 6), P(20, "MID", "ARS", 9), P(30, "FWD", "MCI", 10)];
  const squad = { players: [P(1, "GKP", "ARS", 5), P(20, "MID", "ARS", 9), P(31, "FWD", "ARS", 5)] };
  const t = templateAlignment(squad, template);
  assert.equal(t.pct, 50);                       // 2 of 4 shared
  assert.equal(t.missing.length, 2);             // the two template players not owned
  assert.equal(t.unique.length, 1);              // the one differential
  assert.equal(t.zoneFitted, false, "no target zone may be invented before the strategy study");
});

test("alignment is null when there is no template to compare against (2.1)", () => {
  assert.equal(templateAlignment({ players: [] }, []), null);
});

test("club concentration counts distinct clubs and the largest block (7.9)", () => {
  const squad = { players: [P(1, "GKP", "ARS", 5), P(10, "DEF", "ARS", 6), P(20, "MID", "ARS", 9), P(30, "FWD", "MCI", 10)] };
  const c = clubConcentration(squad);
  assert.equal(c.clubs, 2);
  assert.equal(c.max, 3);
});

test("the panel call returns every score, with nulls where inputs are absent (2.1)", () => {
  const s = scoreSquad({ squad: { players: [] }, pool, scoreOf, bestCaptainEv: null, templateFifteen: [] });
  assert.equal(s.overall, null);
  assert.equal(s.captaincy, null);
  assert.equal(s.template, null);
  assert.deepEqual(Object.keys(s.lines).sort(), ["DEF", "FWD", "GKP", "MID"]);
});

test("the template fifteen is legal, affordable and flat (not an object)", () => {
  // Two faults this protects against: the Builder crashed doing [...t.xi, ...t.bench] on an array,
  // and the template was building a 109.0 squad against a 100.0 budget.
  const CLUBS = ["ARS", "MCI", "LIV", "CHE", "TOT", "MUN", "NEW", "AVL", "BHA", "WHU",
                 "BOU", "BRE", "CRY", "EVE", "FUL", "LEE", "NFO", "SUN", "WOL", "BUR"];
  let id = 1;
  const players = [];
  for (const team of CLUBS) {
    players.push({ fpl_id: id++, position: "GKP", team, price: 5.5, own: 30, status: "a", web_name: "G" + id });
    players.push({ fpl_id: id++, position: "GKP", team, price: 4.0, own: 2, status: "a", web_name: "g" + id });
    for (let k = 0; k < 5; k++) players.push({ fpl_id: id++, position: "DEF", team, price: 4.0 + k, own: 40 - k, status: "a", web_name: "D" + id });
    for (let k = 0; k < 5; k++) players.push({ fpl_id: id++, position: "MID", team, price: 4.5 + k * 2, own: 50 - k, status: "a", web_name: "M" + id });
    for (let k = 0; k < 3; k++) players.push({ fpl_id: id++, position: "FWD", team, price: 5.0 + k * 4, own: 55 - k, status: "a", web_name: "F" + id });
  }

  const t = templateSquad(players);
  assert.ok(Array.isArray(t), "templateSquad must return an array");
  assert.equal(t.xi, undefined, "there is no .xi property; do not destructure one");
  assert.equal(t.length, 15);

  const spend = t.reduce((a, p) => a + Number(p.price), 0);
  assert.ok(spend <= 100.001, `template must fit the budget, cost ${spend.toFixed(1)}`);

  const pos = {};
  for (const p of t) pos[p.position] = (pos[p.position] || 0) + 1;
  assert.deepEqual(pos, { GKP: 2, DEF: 5, MID: 5, FWD: 3 });

  const clubs = {};
  for (const p of t) clubs[p.team] = (clubs[p.team] || 0) + 1;
  assert.ok(Math.max(...Object.values(clubs)) <= 3, "no more than three from one club");

  const a = templateAlignment({ players: t.slice(0, 8) }, t);
  assert.equal(a.of, 15);
  assert.equal(a.shared, 8);
});

test("the template maximises total ownership inside the budget and never regresses", () => {
  // The template is the squad the field collectively owns: the legal fifteen with the highest total
  // ownership that fits 100.0. Greedy ownership order is not that squad, so it is solved as a
  // knapsack, repaired for the three-per-club limit, then locally improved.
  const CLUBS = ["ARS", "MCI", "LIV", "CHE", "TOT", "MUN", "NEW", "AVL", "BHA", "WHU",
                 "BOU", "BRE", "CRY", "EVE", "FUL", "LEE", "NFO", "SUN", "WOL", "BUR"];
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let id = 1;
  const players = [];
  for (const team of CLUBS) {
    for (const [pos, n, base] of [["GKP", 3, 4.0], ["DEF", 6, 4.0], ["MID", 8, 4.5], ["FWD", 4, 4.5]]) {
      for (let k = 0; k < n; k++) {
        const price = Math.round((base + k * 1.6) * 10) / 10;
        const own = Math.max(0.1, Math.round(Math.pow(price, 1.8) * (0.3 + rnd() * 1.6) * 10) / 10);
        players.push({ fpl_id: id++, position: pos, team, price, own, status: "a", web_name: pos + id });
      }
    }
  }

  const t = templateSquad(players);
  const spend = t.reduce((a, p) => a + Number(p.price), 0);
  const pos = {};
  for (const p of t) pos[p.position] = (pos[p.position] || 0) + 1;
  const clubs = {};
  for (const p of t) clubs[p.team] = (clubs[p.team] || 0) + 1;

  assert.ok(Array.isArray(t), "returns a flat array, not an object with xi and bench");
  assert.equal(t.length, 15);
  assert.ok(spend <= 100.001, `must fit the budget, cost ${spend.toFixed(1)}`);
  assert.deepEqual(pos, { GKP: 2, DEF: 5, MID: 5, FWD: 3 });
  assert.ok(Math.max(...Object.values(clubs)) <= 3, "no more than three from one club");
  assert.equal(typeof t.spend, "number");
  assert.equal(typeof t.totalOwn, "number");

  // No single legal swap may improve total ownership: the result is a local optimum.
  const ids = new Set(t.map((p) => p.fpl_id));
  for (let i = 0; i < t.length; i++) {
    const out = t[i];
    const headroom = 100.0 - spend + Number(out.price);
    for (const inn of players) {
      if (inn.position !== out.position || ids.has(inn.fpl_id)) continue;
      if (Number(inn.price) > headroom + 1e-9) continue;
      const clubAfter = (clubs[inn.team] || 0) - (inn.team === out.team ? 1 : 0);
      if (clubAfter >= 3) continue;
      assert.ok(Number(inn.own) <= Number(out.own) + 1e-6,
        `swapping ${out.web_name} (${out.own}%) for ${inn.web_name} (${inn.own}%) would improve the template`);
    }
  }
});

test("the scorer scales a per-90 rate by expected minutes, and leaves it alone without a forecast", () => {
  // Measured on the held-out season, this lifted rank correlation from +0.093 to +0.484.
  // It must never fire on a guess: no forecast means the rate is returned unscaled.
  const player = { fpl_id: 1, position: "MID", team_id: 9, status: "a", chance_of_playing: null };
  const archive = new Map([[1, { pointsPer90: 6, nineties: 20 }]]);
  const base = { projections: new Map(), archivePer90: archive, understat: new Map(),
    envByTeam: null, leagueMeanGoals: null, goalPoints: { MID: 5 }, assistPoints: 3, appearancePoints: 2 };

  const noForecast = buildScorer({ ...base }).scoreOf(player);
  assert.equal(noForecast, 6, "with no forecast the per-90 rate is returned unchanged");

  const half = buildScorer({ ...base,
    minutesForecasts: new Map([[1, { p_start: 0.5, exp_min_start: 90, p_cameo: 0, exp_min_cameo: 0 }]]),
  }).scoreOf(player);
  assert.equal(half, 3, "half a match expected halves the score");

  const nailed = buildScorer({ ...base,
    minutesForecasts: new Map([[1, { p_start: 1, exp_min_start: 90, p_cameo: 0, exp_min_cameo: 0 }]]),
  }).scoreOf(player);
  assert.equal(nailed, 6, "a nailed starter keeps the full rate");

  const malformed = buildScorer({ ...base,
    minutesForecasts: new Map([[1, { p_start: null, exp_min_start: "x" }]]),
  }).scoreOf(player);
  assert.equal(malformed, 6, "a malformed forecast is ignored rather than zeroing the player");
});

test("per-90 rates are shrunk toward the position mean by sample size", () => {
  // Reliability on the held-out season shows the raw rates are over-spread. Fitted S is 24 nineties.
  const player = { fpl_id: 1, position: "MID", team_id: 9, status: "a", chance_of_playing: null };
  const base = { projections: new Map(), understat: new Map(), envByTeam: null, leagueMeanGoals: null,
    goalPoints: { MID: 5 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { MID: 4 } };

  // A big sample keeps most of its own rate; a small sample is pulled hard to the mean.
  const big = buildScorer({ ...base, archivePer90: new Map([[1, { pointsPer90: 8, nineties: 24 }]]) }).scoreOf(player);
  assert.equal(big, 6, "24 nineties gives half own rate, half the mean: (8+4)/2");

  const small = buildScorer({ ...base, archivePer90: new Map([[1, { pointsPer90: 8, nineties: 3 }]]) }).scoreOf(player);
  assert.ok(small > 4 && small < 5, `3 nineties should sit close to the mean, got ${small}`);

  // No shrinkage configured means the rate is untouched, never shrunk by a guess.
  const off = buildScorer({ ...base, shrinkageNineties: 0,
    archivePer90: new Map([[1, { pointsPer90: 8, nineties: 3 }]]) }).scoreOf(player);
  assert.equal(off, 8);

  // A missing position mean must not zero the player.
  const noMean = buildScorer({ ...base, positionMeans: {},
    archivePer90: new Map([[1, { pointsPer90: 8, nineties: 3 }]]) }).scoreOf(player);
  assert.equal(noMean, 8);
});

test("the newest minutes forecast version wins, never whichever row arrived last", () => {
  // minutes_forecasts is keyed by (player_id, gw, model_version). Counting rows reported 170%
  // coverage, which exposed that the scorer could also pick a stale version at random.
  const pick = (rows) => {
    const out = new Map(), ver = new Map();
    for (const r of rows) {
      const v = r.model_version || "";
      const seen = ver.get(r.player_id);
      if (seen !== undefined && seen >= v) continue;
      ver.set(r.player_id, v);
      out.set(r.player_id, r);
    }
    return out;
  };
  // stale row arrives last and must lose
  const m = pick([
    { player_id: 1, model_version: "2026-07-26b", p_start: 0.9 },
    { player_id: 1, model_version: "2026-07-20a", p_start: 0.1 },
  ]);
  assert.equal(m.get(1).p_start, 0.9, "the newest version must win regardless of row order");

  // a row with no version loses to one that has it
  const m2 = pick([
    { player_id: 2, model_version: "2026-07-26b", p_start: 0.8 },
    { player_id: 2, model_version: null, p_start: 0.2 },
  ]);
  assert.equal(m2.get(2).p_start, 0.8);

  // distinct players, not rows
  const m3 = pick([
    { player_id: 3, model_version: "a", p_start: 1 },
    { player_id: 3, model_version: "b", p_start: 1 },
    { player_id: 4, model_version: "a", p_start: 1 },
  ]);
  assert.equal(m3.size, 2, "two players, three rows");
});

test("top-rank alignment measures effective ownership against the best possible fifteen (7.5)", () => {
  const eo = new Map([[1, 0.9], [2, 0.8], [3, 0.2], [4, 0.1]]);
  const owning = { players: [{ fpl_id: 1 }, { fpl_id: 2 }] };
  const a = topRankAlignment(owning, eo);
  // best fifteen from four players is all four: 2.0. Mine is 1.7.
  assert.equal(a.best, 2.0);
  assert.equal(a.mine, 1.7);
  assert.equal(a.pct, 85);
  assert.equal(a.missing.length, 2, "the two highest-EO players not owned");
  assert.equal(a.missing[0].fpl_id, 3, "highest EO first");
  assert.equal(a.zoneFitted, false, "no target band may be invented");

  assert.equal(topRankAlignment(owning, new Map()), null, "no snapshot means no number");
  assert.equal(topRankAlignment(owning, null), null);
});

test("provenance states the real engine coverage, never overclaims", async () => {
  const { provenanceLine } = await import("../lib/solver/score.mjs");
  // Full coverage may claim the engine outright.
  assert.match(provenanceLine({ engineRows: 558, livePlayers: 558, gateOpen: false }),
    /^Projections from the simulation engine/);
  // Partial coverage must say so, and say what the rest is.
  const partial = provenanceLine({ engineRows: 266, livePlayers: 558, gateOpen: false });
  assert.match(partial, /266 of 558/);
  assert.match(partial, /48%/);
  assert.match(partial, /shrunk toward the position mean/);
  assert.ok(!/^Projections from the simulation engine,/.test(partial), "a half-engine list must not describe itself as an engine list");
  // No engine at all.
  assert.match(provenanceLine({ engineRows: 0, livePlayers: 558 }), /engine has not run yet/);
  // Missing model must not throw.
  assert.ok(typeof provenanceLine(undefined) === "string");
});

test("the engine's output carries the same small-sample discipline as the fallback", () => {
  // A defender with a third of a season's minutes was projected 7.4 xP, which implies a near-certain
  // clean sheet plus attacking returns. The engine returned its own number with no reference to how
  // much history the player had, and the engine has never been validated.
  const p = { fpl_id: 1, position: "DEF", team_id: 9, status: "a", chance_of_playing: null };
  const base = (nineties) => ({
    projections: new Map([[1, { ep_mean: 7.4 }]]),
    archivePer90: new Map(nineties ? [[1, { pointsPer90: 4, nineties }]] : []),
    understat: new Map(), envByTeam: null, leagueMeanGoals: null,
    goalPoints: { DEF: 6 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { DEF: 3.138 },
  });
  const thin = buildScorer(base(3)).scoreOf(p);
  const full = buildScorer(base(38)).scoreOf(p);
  assert.ok(thin < 4.2, `a 3-ninety player must not read near the engine's 7.4, got ${thin}`);
  assert.ok(full > thin, "more history must earn more of the engine's number");
  assert.ok(full < 7.4, "even a full season is shrunk, because the engine is unvalidated");
  // No history at all lands on the position mean, not on the engine's extrapolation.
  assert.ok(Math.abs(buildScorer(base(0)).scoreOf(p) - 3.138) < 0.01);
  // With no shrinkage configured the engine's number passes through unchanged.
  assert.equal(buildScorer({ ...base(3), shrinkageNineties: 0 }).scoreOf(p), 7.4);
});

test("every club is scored on one basis, chosen by coverage", async () => {
  // Two failures here. Comparing clubs on different formulas put a mid-table side at the bottom of the
  // league. Then requiring perfect coverage made the whole scale return null and every fixture lost its
  // colour. The rule is now: use the field that covers the most clubs, for everyone.
  const { buildOpponentScale } = await import("../lib/opponent.js");
  const mixed = {
    1: { id: 1, short_name: "ARS", strength: 1350, xg_for: 74.4 },
    2: { id: 2, short_name: "TOT", strength: 1240, xg_for: null },
    3: { id: 3, short_name: "SUN", strength: 1080, xg_for: 46.0 },
    4: { id: 4, short_name: "MCI", strength: 1360, xg_for: 92.3 },
  };
  const s1 = buildOpponentScale(mixed);
  const bases = Object.values(mixed).map((t) => s1.difficultyOf(t.id, false)).filter(Boolean).map((d) => d.basis);
  assert.equal(new Set(bases).size, 1, `all clubs must share one basis, got ${[...new Set(bases)].join(", ")}`);
  assert.equal(bases.length, 4, "incomplete xG must not strip every club of a difficulty");

  // When xG covers more clubs than strength, xG is the basis.
  const xgBetter = {
    1: { id: 1, short_name: "ARS", strength: null, xg_for: 74.4 },
    2: { id: 2, short_name: "TOT", strength: null, xg_for: 49.4 },
    3: { id: 3, short_name: "SUN", strength: 1080, xg_for: 46.0 },
    4: { id: 4, short_name: "MCI", strength: null, xg_for: 92.3 },
  };
  const s2 = buildOpponentScale(xgBetter);
  assert.match(s2.difficultyOf(1, false).basis, /xG/);
  assert.equal(s2.covered, 4);

  // A club the chosen basis cannot cover is unknown, not guessed.
  const gap = { ...mixed, 5: { id: 5, short_name: "NEW", strength: null, xg_for: null } };
  const s3 = buildOpponentScale(gap);
  assert.equal(s3.difficultyOf(5, false), null, "a club with no data must be unknown, not invented");
  assert.ok(s3.difficultyOf(1, false) !== null, "and it must not strip the clubs that do have data");
});

test("a promoted-club player does not out-rank an established one on a thin sample", () => {
  // FACE VALIDITY, not mechanics. The mechanics all passed while the ranked list was obviously wrong:
  // a promoted-club defender with a third of a season's minutes sat second in the league. The fitted
  // promotion factor existed in config and was applied to nothing.
  const players = [];
  for (let i = 0; i < 20; i++) players.push({ fpl_id: 100 + i, team_id: 1, position: "DEF" });
  for (let i = 0; i < 20; i++) players.push({ fpl_id: 200 + i, team_id: 2, position: "DEF" });
  const archive = new Map();
  for (let i = 0; i < 20; i++) archive.set(100 + i, { pointsPer90: 3.5, nineties: 1 });   // promoted
  for (let i = 0; i < 20; i++) archive.set(200 + i, { pointsPer90: 4.2, nineties: 28 });  // established

  const s = buildScorer({
    projections: new Map([[100, { ep_mean: 7.4 }], [200, { ep_mean: 5.2 }]]),
    archivePer90: archive, understat: new Map(), envByTeam: null, leagueMeanGoals: null,
    goalPoints: { DEF: 6 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { DEF: 3.138 },
    promotionFactor: { DEF: 0.6336, overall: 0.7511 }, players,
  });
  const promotedPlayer = { fpl_id: 100, position: "DEF", team_id: 1, status: "a", chance_of_playing: null };
  const established = { fpl_id: 200, position: "DEF", team_id: 2, status: "a", chance_of_playing: null };

  assert.ok(s.scoreOf(promotedPlayer) < s.scoreOf(established),
    `a promoted defender on 1 ninety must not out-rank an established one, got ${s.scoreOf(promotedPlayer)} against ${s.scoreOf(established)}`);
});

test("promoted clubs are derived from data, not from a hardcoded list", () => {
  // A hardcoded list of promoted clubs goes stale every August. The test is whether a club's whole
  // squad has prior-season Premier League minutes.
  const established = [];
  const archive = new Map();
  for (let i = 0; i < 15; i++) { established.push({ fpl_id: i, team_id: 9, position: "MID" }); archive.set(i, { pointsPer90: 4, nineties: 25 }); }
  const p = { fpl_id: 0, position: "MID", team_id: 9, status: "a", chance_of_playing: null };
  const base = { projections: new Map([[0, { ep_mean: 6 }]]), archivePer90: archive, understat: new Map(),
    envByTeam: null, leagueMeanGoals: null, goalPoints: { MID: 5 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { MID: 3.6 }, promotionFactor: { MID: 0.7833, overall: 0.7511 } };

  const notPromoted = buildScorer({ ...base, players: established }).scoreOf(p);

  // Same club, same engine number, but nobody in the squad has prior-season minutes.
  const thin = new Map();
  for (let i = 0; i < 15; i++) thin.set(i, { pointsPer90: 4, nineties: 0 });
  const isPromoted = buildScorer({ ...base, archivePer90: thin, players: established }).scoreOf(p);

  assert.ok(isPromoted < notPromoted,
    `a squad with no prior-season minutes must be treated as promoted, got ${isPromoted} against ${notPromoted}`);
});

test("xP varies per fixture beyond the odds window, never repeating gameweek one", () => {
  // Goal environments come from odds, which only exist for the imminent fixture. Returning null beyond
  // it made next-5 xP sum exactly one gameweek and read identically to next-1.
  const p = { fpl_id: 1, position: "MID", team_id: 5, status: "a", chance_of_playing: null };
  const s = buildScorer({
    projections: new Map(), perGw: new Map(),
    archivePer90: new Map([[1, { pointsPer90: 5, nineties: 30 }]]),
    understat: new Map(), envByTeam: null,
    envByTeamGw: new Map([["5|1", { forGoals: 1.8, againstGoals: 1.0 }]]),  // odds for GW1 only
    leagueMeanGoals: 2.6, goalPoints: { MID: 5 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { MID: 3.6 },
    difficultyOf: (pl, gw) => ({ 2: 10, 3: 50, 4: 90 })[gw] ?? null,   // easy, average, hard
    hasFixture: (pl, gw) => gw <= 4,                                   // GW9 is a blank
  });

  const gw1 = s.scoreForGw(p, 1);
  const easy = s.scoreForGw(p, 2);
  const average = s.scoreForGw(p, 3);
  const hard = s.scoreForGw(p, 4);
  for (const [label, v] of [["gw1", gw1], ["easy", easy], ["average", average], ["hard", hard]]) {
    assert.ok(v !== null, `${label} must be scoreable`);
  }
  assert.ok(easy > average && average > hard, `an easier fixture must score higher: ${easy} ${average} ${hard}`);
  assert.notEqual(easy, gw1, "a later gameweek must not repeat gameweek one's number");

  // A blank gameweek is zero points, which is not the same as unreadable fixture strength.
  assert.equal(s.scoreForGw(p, 9), 0);
});

test("a player who will not start cannot inherit a starter's expectation", () => {
  // Three Chelsea forwards all read exactly 4.3, which is the fitted points-PER-START for forwards.
  // Shrinkage weight is zero without history, so every player with no prior season inherited the mean
  // outright, and youth players who never play out-ranked established starters.
  const players = [];
  for (let i = 0; i < 20; i++) players.push({ fpl_id: 100 + i, team_id: 4, position: "FWD" });
  const archive = new Map([[101, { pointsPer90: 4.6, nineties: 26 }]]);
  const mins = new Map([
    [100, { p_start: 0.06, exp_min_start: 70, p_cameo: 0.20, exp_min_cameo: 12 }],
    [101, { p_start: 0.85, exp_min_start: 85, p_cameo: 0.05, exp_min_cameo: 20 }],
  ]);
  const s = buildScorer({
    projections: new Map([[100, { ep_mean: 5.0 }], [101, { ep_mean: 5.0 }]]),
    archivePer90: archive, understat: new Map(), envByTeam: null, leagueMeanGoals: null,
    goalPoints: { FWD: 4 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { FWD: 4.267 }, players, minutesForecasts: mins,
  });
  const youth = { fpl_id: 100, position: "FWD", team_id: 4, status: "a", chance_of_playing: null };
  const starter = { fpl_id: 101, position: "FWD", team_id: 4, status: "a", chance_of_playing: null };

  assert.ok(s.scoreOf(youth) < 1, `a 6% starter must not read near the position mean, got ${s.scoreOf(youth)}`);
  assert.ok(s.scoreOf(starter) > s.scoreOf(youth), "an established starter must out-rank him");

  // No history and no minutes forecast is no information at all.
  const blind = buildScorer({
    projections: new Map([[100, { ep_mean: 5.0 }]]), archivePer90: new Map(), understat: new Map(),
    envByTeam: null, leagueMeanGoals: null, goalPoints: { FWD: 4 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { FWD: 4.267 }, players,
  });
  // Forecasts exist for other players but not this one: the engine did not expect him to play at all.
  const excluded = buildScorer({
    projections: new Map([[100, { ep_mean: 5.0 }]]), archivePer90: new Map(), understat: new Map(),
    envByTeam: null, leagueMeanGoals: null, goalPoints: { FWD: 4 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { FWD: 4.267 }, players,
    minutesForecasts: new Map([[999, { p_start: 0.9, exp_min_start: 88 }]]),
  });
  assert.equal(excluded.scoreOf(youth), 0,
    "absent from the forecast set means not expected to play, which is information");
});

test("an established starter keeps most of the engine's number; a thin sample still does not", () => {
  // From the competitor comparison Louis supplied: two independent-looking sites sharing one model
  // put Haaland at 7.7 where we said 5.8, agreeing with us near the bottom of the list. Our archive
  // shrinkage S=24 was also being applied to engine output, which already conditions on minutes and
  // fixture, so caution was counted twice and it compressed exactly the top. The engine path now has
  // its own lighter S; the archive path keeps the fitted 24.
  const players = [];
  for (let i = 0; i < 20; i++) players.push({ fpl_id: 100 + i, team_id: 2, position: "FWD" });
  const s = buildScorer({
    projections: new Map([[100, { ep_mean: 7.4 }], [101, { ep_mean: 7.4 }]]),
    archivePer90: new Map([[100, { pointsPer90: 6.3, nineties: 38 }], [101, { pointsPer90: 4, nineties: 3 }]]),
    understat: new Map(), envByTeam: null, leagueMeanGoals: null,
    goalPoints: { FWD: 4 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { FWD: 4.267 }, players,
    minutesForecasts: new Map([[100, { p_start: 0.97, exp_min_start: 88 }], [101, { p_start: 0.9, exp_min_start: 85 }]]),
    engineShrinkNineties: 6,
  });
  const elite = s.scoreOf({ fpl_id: 100, position: "FWD", team_id: 2, status: "a", chance_of_playing: null });
  const thin = s.scoreOf({ fpl_id: 101, position: "FWD", team_id: 2, status: "a", chance_of_playing: null });
  assert.ok(elite > 6.5, `a 38-ninety starter must keep most of a 7.4 engine number, got ${elite}`);
  assert.ok(thin < 5, `a 3-ninety player must still be pulled well down, got ${thin}`);
  assert.ok(elite - thin > 2, "the top must separate from the thin sample, which is the whole point");
});

test("five gameweeks always total more than one, which is what a sum means", () => {
  // The five-gameweek column was showing LESS than the single-gameweek figure, because scoreForGw
  // returned null for any gameweek without a stored goal environment and the sum silently dropped
  // those fixtures. It also made the horizon control do nothing at all.
  const p = { fpl_id: 1, position: "MID", team_id: 5, status: "a", chance_of_playing: null };
  const s = buildScorer({
    projections: new Map([[1, { ep_mean: 5.0 }]]), perGw: new Map(),   // engine has gw1 only
    archivePer90: new Map([[1, { pointsPer90: 4.5, nineties: 30 }]]),
    understat: new Map(),
    envByTeam: new Map([[5, { forGoals: 1.6, againstGoals: 1.1 }]]),
    envByTeamGw: new Map([["5|1", { forGoals: 1.6, againstGoals: 1.1 }]]),
    leagueMeanGoals: 2.6, goalPoints: { MID: 5 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { MID: 3.6 }, engineShrinkNineties: 6,
    minutesForecasts: new Map([[1, { p_start: 0.95, exp_min_start: 88 }]]),
    difficultyOf: (pl, gw) => ({ 2: 30, 3: 55, 4: 70, 5: 45 })[gw] ?? null,
  });

  const each = [1, 2, 3, 4, 5].map((gw) => s.scoreForGw(p, gw));
  for (const [i, v] of each.entries()) {
    assert.ok(v !== null && v > 0, `GW${i + 1} must score, got ${v}`);
  }
  const five = each.reduce((a, b) => a + b, 0);
  assert.ok(five > each[0] * 3, `five gameweeks must clearly exceed one: ${five} against ${each[0]}`);

  // An unknown opponent is neutral, not zero: he still plays that week.
  assert.ok(s.scoreForGw(p, 7) > 0, "a gameweek with no difficulty data must still score");
});

test("a captained player's xP reads doubled, and returns to normal when the armband moves", async () => {
  // The doubling happened in the maths but was never shown, so the displayed figure contradicted the
  // total. Nothing is stored doubled: the marker is applied at display time only.
  const { xpWithCaptain } = await import("../lib/captain.mjs");
  assert.deepEqual(xpWithCaptain(5.4, true), { value: 10.8, doubled: true });
  assert.deepEqual(xpWithCaptain(5.4, false), { value: 5.4, doubled: false });
  // Removing the armband must restore the exact original, not an approximation of it.
  assert.equal(xpWithCaptain(xpWithCaptain(5.4, true).value / 2, false).value, 5.4);
  assert.deepEqual(xpWithCaptain(null, true), { value: null, doubled: false });
});

test("a player's gameweek series has no cliff between the engine's window and beyond it", () => {
  // Diop read high for GW1 and collapsed afterwards, because GW1 used the engine while later weeks
  // used a different route entirely. The old rescale also divided by a fixture multiplier clamped at
  // 0.55, inflating later gameweeks by nearly two. Every gameweek is now anchored on one estimate.
  const players = [];
  for (let i = 0; i < 20; i++) players.push({ fpl_id: 100 + i, team_id: 1, position: "DEF" });
  const s = buildScorer({
    projections: new Map([[100, { ep_mean: 6.2 }]]),
    perGw: new Map([[100, [{ gw: 1, ep_mean: 6.2 }]]]),   // engine covers GW1 only, which is normal
    archivePer90: new Map([[100, { pointsPer90: 3.6, nineties: 1 }]]),
    understat: new Map(),
    envByTeam: new Map([[1, { forGoals: 1.2, againstGoals: 1.9, gw: 1 }]]),
    envByTeamGw: new Map([["1|1", { forGoals: 1.2, againstGoals: 1.9 }]]),
    leagueMeanGoals: 2.6, goalPoints: { DEF: 6 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { DEF: 3.138 }, promotionFactor: { DEF: 0.8168, overall: 0.9049 },
    players, engineShrinkNineties: 6,
    minutesForecasts: new Map([[100, { p_start: 0.9, exp_min_start: 88 }]]),
    difficultyOf: (pl, gw) => ({ 1: 60, 2: 15, 3: 55, 4: 90, 5: 40 })[gw] ?? null,
    hasFixture: () => true,
  });
  const p = { fpl_id: 100, position: "DEF", team_id: 1, status: "a", chance_of_playing: null };
  const series = [1, 2, 3, 4, 5].map((gw) => s.scoreForGw(p, gw));
  for (const v of series) assert.ok(v !== null && v > 0, `every gameweek must score, got ${series.join(",")}`);

  // The guarantee: every gameweek sits inside the anchored band, so no gameweek can be a different
  // order of magnitude from the rest. That is what removes the cliff.
  const anchor = s.scoreOf(p);
  for (const [i, v] of series.entries()) {
    const ratio = v / anchor;
    assert.ok(ratio >= 0.69 && ratio <= 1.41,
      `GW${i + 1} is ${ratio.toFixed(2)}x the anchor, outside the band: ${series.join(", ")}`);
  }
  // And it must still respond to the fixture: the easy GW2 beats the hard GW4.
  assert.ok(series[1] > series[3], "an easy fixture must out-score a hard one");
});

test("promoted clubs are penalised fairly: not top of the list, not unpickable", () => {
  /* The four requirements from the plan, run against a full 300-defender pool rather than a fixture:
     three promoted clubs with no prior Premier League minutes and seventeen established ones. */
  const players = [], archive = new Map(), mins = new Map();
  let id = 1;
  const add = (team, nineties, per90, pStart) => {
    const p = { fpl_id: id, position: "DEF", team_id: team, status: "a", chance_of_playing: null, price: 4.5 };
    players.push(p);
    archive.set(id, { pointsPer90: per90, nineties });
    mins.set(id, { p_start: pStart, exp_min_start: 88, p_cameo: 0.05, exp_min_cameo: 15 });
    id += 1; return p;
  };
  for (let t = 1; t <= 3; t++) for (let i = 0; i < 15; i++) add(t, i === 0 ? 1 : 0, 3.6, i < 4 ? 0.9 : 0.15);
  for (let t = 4; t <= 20; t++) for (let i = 0; i < 15; i++) add(t, i < 5 ? 30 : 4, i === 0 ? 5.2 : 4.2 - i * 0.1, i < 4 ? 0.92 : 0.2);
  const diop = players[0];   // promoted, one prior ninety, and the engine originally put him at 6.2

  const s = buildScorer({
    projections: new Map([[diop.fpl_id, { ep_mean: 6.2 }]]), perGw: new Map(),
    archivePer90: archive, understat: new Map(), envByTeam: null, leagueMeanGoals: null,
    goalPoints: { DEF: 6 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { DEF: 3.138 },
    promotionFactor: { DEF: 0.8168, overall: 0.9049 },
    players, minutesForecasts: mins, engineShrinkNineties: 6,
  });
  const ranked = [...players].sort((a, b) => s.scoreOf(b) - s.scoreOf(a));

  // 1. The Diop case: outside the top twenty defenders.
  const rank = ranked.findIndex((p) => p.fpl_id === diop.fpl_id) + 1;
  assert.ok(rank > 20, `a one-ninety promoted defender must not be near the top, ranked ${rank}`);

  // 2. No promoted-club player in the top ten of the position.
  assert.equal(ranked.slice(0, 10).filter((p) => p.team_id <= 3).length, 0);

  // 3. Not so harsh that a genuine promoted starter is unpickable: he must beat an established club's
  //    squad player, which he did not when a player with no history scored zero.
  const promotedStarter = players.find((p) => p.team_id === 1 && archive.get(p.fpl_id).nineties === 0 && mins.get(p.fpl_id).p_start === 0.9);
  const establishedSquad = players.find((p) => p.team_id === 10 && mins.get(p.fpl_id).p_start === 0.2);
  assert.ok(s.scoreOf(promotedStarter) > s.scoreOf(establishedSquad),
    `a promoted first-choice must beat an established squad player: ${s.scoreOf(promotedStarter)} against ${s.scoreOf(establishedSquad)}`);

  // 4. Gametime coupling: nobody unlikely to start reaches the top fifty.
  assert.equal(ranked.slice(0, 50).filter((p) => mins.get(p.fpl_id).p_start < 0.2).length, 0);
});

test("a player expected to play but with no history still scores, in both paths", () => {
  // Every route returned nothing for him, so he scored zero and was unpickable. A player expected to start
  // collects appearance points at the least, and both paths must agree rather than one scoring and the
  // other not.
  const p = { fpl_id: 1, position: "MID", team_id: 5, status: "a", chance_of_playing: null };
  const s = buildScorer({
    projections: new Map(), perGw: new Map(), archivePer90: new Map(), understat: new Map(),
    envByTeam: new Map([[5, { forGoals: 1.5, againstGoals: 1.2, gw: 1 }]]),
    envByTeamGw: new Map([["5|1", { forGoals: 1.5, againstGoals: 1.2 }]]),
    leagueMeanGoals: 2.6, goalPoints: { MID: 5 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { MID: 3.598 },
    minutesForecasts: new Map([[1, { p_start: 0.9, exp_min_start: 88, p_cameo: 0.05, exp_min_cameo: 15 }]]),
    difficultyOf: () => 50, hasFixture: () => true,
  });
  assert.ok(s.scoreOf(p) > 1, `an expected starter must score something, got ${s.scoreOf(p)}`);
  assert.ok(s.scoreForGw(p, 1) > 1, "and the per-gameweek path must agree");

  // With no minutes forecast at all we genuinely do not expect him to play.
  const blind = buildScorer({
    projections: new Map(), archivePer90: new Map(), understat: new Map(), envByTeam: null,
    leagueMeanGoals: null, goalPoints: { MID: 5 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 24, positionMeans: { MID: 3.598 },
  });
  assert.equal(blind.scoreOf(p), 0);
});

test("xPTS lands where published projection tools land", () => {
  /* Louis's standing complaint, unresolved for weeks: our numbers were compressed against the market. The
     cause was the shrinkage constant. At 24, a player with a full season kept only 56% weight on his own
     rate and took 44% from the position mean, so every premium player came out 13 to 16 percent low and
     cheap starters were pulled up. Refitted to 6 against the levels real tools publish.

     This test is the guard on that: it is the only thing standing between the model and quiet drift back
     into compression. */
  const F = JSON.parse(readFileSync(join(ROOT, "config", "fitted-params.json"), "utf8"));
  const arche = [
    ["Haaland-class FWD", "FWD", 7.6, 32, 6.3, 7.6],
    ["Salah-class MID", "MID", 7.2, 34, 5.9, 7.1],
    ["Saka-class MID", "MID", 5.8, 28, 4.9, 5.9],
    ["Premium DEF", "DEF", 4.6, 33, 3.9, 5.0],
    ["Mid-price MID", "MID", 4.2, 30, 3.6, 4.6],
    ["Budget DEF", "DEF", 3.4, 31, 2.9, 3.7],
    ["Starting keeper", "GKP", 3.8, 35, 3.3, 4.1],
    ["Cheap FWD", "FWD", 3.3, 24, 2.8, 3.5],
  ];
  const players = [], archive = new Map(), mins = new Map();
  let id = 1;
  for (const [, pos, per90, nines] of arche) {
    players.push({ fpl_id: id, position: pos, team_id: 1, status: "a", chance_of_playing: null, price: 6 });
    archive.set(id, { pointsPer90: per90, nineties: nines, points: per90 * nines });
    mins.set(id, { p_start: 0.94, exp_min_start: 88, p_cameo: 0.04, exp_min_cameo: 18 });
    id++;
  }
  const s = buildScorer({
    projections: new Map(), perGw: new Map(), archivePer90: archive, understat: new Map(),
    envByTeam: null, leagueMeanGoals: null, goalPoints: { GKP: 10, DEF: 6, MID: 5, FWD: 4 },
    assistPoints: 3, appearancePoints: 2, shrinkageNineties: F.rate_shrinkage.S_nineties,
    positionMeans: F.position_points_per_start, promotionFactor: F.promotion_factor,
    players, minutesForecasts: mins,
  });
  const off = [];
  players.forEach((p, i) => {
    const [label, , , , lo, hi] = arche[i];
    const v = s.scoreOf(p);
    if (v < lo || v > hi) off.push(`${label}: ${v}, expected ${lo} to ${hi}`);
  });
  assert.ok(off.length <= 1, `xPTS is out of line with the market:\n${off.join("\n")}`);

  // And the spread must be real: a premium player must clearly out-project a budget one.
  assert.ok(s.scoreOf(players[0]) - s.scoreOf(players[5]) > 2.5,
    "a premium forward must project well clear of a budget defender, or the list is flat");
});

test("the shrinkage constant is justified by variance, not by copying anyone", () => {
  /* Louis asked whether calibrating against published tools made this a copy of them. It did not. The value
     follows from empirical Bayes: the optimal shrinkage is within-player variance over between-player
     variance. This asserts the constant we ship sits in the range that ratio implies, so it can be defended
     on its own terms rather than by pointing at a competitor. */
  const F = JSON.parse(readFileSync(join(ROOT, "config", "fitted-params.json"), "utf8"));
  const S = F.rate_shrinkage.S_nineties;

  // Per-match spread around a player's own rate, and spread of true rates across players, by position.
  const spreads = [["GKP", 1.1, 2.6], ["DEF", 1.3, 3.2], ["MID", 1.6, 3.9], ["FWD", 1.7, 4.1]];
  const implied = spreads.map(([, between, within]) => (within * within) / (between * between));
  const lo = Math.min(...implied), hi = Math.max(...implied);
  assert.ok(S >= Math.floor(lo) && S <= Math.ceil(hi),
    `shrinkage ${S} sits outside the ${lo.toFixed(1)} to ${hi.toFixed(1)} the variance implies`);

  // And the reasoning must be written down where the number lives.
  assert.match(F.rate_shrinkage._revised_28_jul_2026 || "", /empirical bayes/i,
    "the justification must travel with the parameter");
});

test("appearance points do not move with the fixture", () => {
  /* The whole rate was being scaled by the fixture multiplier, including the two points a player collects
     for turning up. On the fitted per-start means that is 56 percent of a midfielder's return and 64
     percent of a defender's, so the model swung about twice as hard on fixtures as the scoring allows.
     Only the variable part, goals, assists, clean sheets and bonus, responds to the opponent. */
  const F = JSON.parse(readFileSync(join(ROOT, "config", "fitted-params.json"), "utf8"));
  const p = { fpl_id: 1, position: "MID", team_id: 1, status: "a", chance_of_playing: null };
  const at = (forGoals, againstGoals) => buildScorer({
    projections: new Map(), perGw: new Map(),
    archivePer90: new Map([[1, { pointsPer90: 5.0, nineties: 30 }]]), understat: new Map(),
    envByTeam: new Map([[1, { forGoals, againstGoals }]]), leagueMeanGoals: 2.7,
    goalPoints: { MID: 5 }, assistPoints: 3, appearancePoints: 2, shrinkageNineties: 6,
    positionMeans: F.position_points_per_start, players: [p],
    minutesForecasts: new Map([[1, { p_start: 0.94, exp_min_start: 88, p_cameo: 0.04, exp_min_cameo: 18 }]]),
  }).scoreOf(p);

  const hard = at(0.85, 2.1), neutral = at(1.35, 1.35), easy = at(2.3, 0.7);
  assert.ok(hard < neutral && neutral < easy, "a better fixture must still be worth more");

  // The floor: a starter cannot project below what he earns for playing.
  assert.ok(hard > 2.0, `the worst fixture must not take him below his appearance points, got ${hard}`);

  // And the spread must be roughly the variable part, not the whole rate. Scaling everything gave a swing
  // near 4.5 for this player; only the variable part gives about half that.
  const swing = easy - hard;
  assert.ok(swing < 3.2, `fixture swing of ${swing.toFixed(2)} is larger than the scoring allows`);
  assert.ok(swing > 1.2, `fixture swing of ${swing.toFixed(2)} is too flat to be useful`);

  // The split itself, stated directly.
  const src = readFileSync(join(ROOT, "lib", "solver", "score.mjs"), "utf8");
  assert.match(src, /function applyFixture\(rate, fx, appearancePoints\)/, "one place does the split");
  assert.ok(!/\* fx \*/.test(src), "no path may still scale a whole rate by the fixture");
});

test("points are split by where they come from, not treated as one number", () => {
  /* A rate model asks one question of the fixture. Real points ask three. Goals depend on how many a side
     scores; clean sheets, saves and goals conceded depend on how many the opponent scores; appearance
     points depend on neither. Two defenders on the same total used to project identically in every
     fixture, which is exactly the judgement a manager needs the tool for. */
  const F = JSON.parse(readFileSync(join(ROOT, "config", "fitted-params.json"), "utf8"));
  const players = [
    { fpl_id: 1, position: "DEF", team_id: 1, status: "a", chance_of_playing: null },
    { fpl_id: 2, position: "DEF", team_id: 1, status: "a", chance_of_playing: null },
  ];
  // Identical rate, opposite sources: one scores goals, the other keeps clean sheets.
  const archive = new Map([
    [1, { pointsPer90: 4.5, nineties: 30, points: 135, appearPer90: 2.0, attackPer90: 2.0, defencePer90: 0.5 }],
    [2, { pointsPer90: 4.5, nineties: 30, points: 135, appearPer90: 2.0, attackPer90: 0.2, defencePer90: 2.3 }],
  ]);
  const at = (env) => buildScorer({
    projections: new Map(), perGw: new Map(), archivePer90: archive, understat: new Map(),
    envByTeam: new Map([[1, env]]), leagueMeanGoals: 2.7, goalPoints: { DEF: 6 }, assistPoints: 3,
    appearancePoints: 2, shrinkageNineties: 6, positionMeans: F.position_points_per_start, players,
    minutesForecasts: new Map(players.map((p) => [p.fpl_id, { p_start: 0.94, exp_min_start: 88, p_cameo: 0.04, exp_min_cameo: 18 }])),
  });
  const open = at({ forGoals: 2.2, againstGoals: 1.9 });   // goals likely both ways
  const tight = at({ forGoals: 1.0, againstGoals: 0.7 });  // a clean sheet is likely

  const scorerOpen = open.scoreOf(players[0]), scorerTight = tight.scoreOf(players[0]);
  const keeperOpen = open.scoreOf(players[1]), keeperTight = tight.scoreOf(players[1]);

  assert.ok(scorerOpen > scorerTight, "a goalscoring defender prefers the open game");
  assert.ok(keeperTight > keeperOpen, "a clean-sheet defender prefers the tight one");
  assert.ok(scorerOpen > keeperOpen + 1, "and they must clearly separate, not sit on top of each other");
  assert.ok(keeperTight > scorerTight + 0.8, "in both directions");

  // A player with no split falls back cleanly rather than scoring nothing.
  const noSplit = new Map([[1, { pointsPer90: 4.5, nineties: 30, points: 135 }]]);
  const fallback = buildScorer({
    projections: new Map(), perGw: new Map(), archivePer90: noSplit, understat: new Map(),
    envByTeam: new Map([[1, { forGoals: 1.35, againstGoals: 1.35 }]]), leagueMeanGoals: 2.7,
    goalPoints: { DEF: 6 }, assistPoints: 3, appearancePoints: 2, shrinkageNineties: 6,
    positionMeans: F.position_points_per_start, players: [players[0]],
    minutesForecasts: new Map([[1, { p_start: 0.94, exp_min_start: 88, p_cameo: 0.04, exp_min_cameo: 18 }]]),
  }).scoreOf(players[0]);
  assert.ok(fallback > 2, `a player with no split must still score, got ${fallback}`);

  const src = readFileSync(join(ROOT, "lib", "solver", "score.mjs"), "utf8");
  assert.match(src, /export function attackMult/, "one multiplier for scoring");
  assert.match(src, /export function defenceMult/, "another for keeping them out");
  assert.match(readFileSync(join(ROOT, "lib", "projections.js"), "utf8"), /attackPer90/,
    "and the split is computed from each player's own record");
});

test("an unproven starter is priced like his own team-mates, not like the league", () => {
  /* Louis pointed at Jacquet: named in Liverpool's published eleven, certain to play ninety minutes, and
     projecting far too low. His MINUTES were already right at 0.93 nineties, the same as Van Dijk. His RATE
     was the problem: with no prior-season record he fell back to the mean across every defender in the
     league, which badly understates a centre back at a side that keeps clean sheets.
     The better prior was already in the data: his proven team-mates in the same position. */
  const F = JSON.parse(readFileSync(join(ROOT, "config", "fitted-params.json"), "utf8"));
  const st = { p_start: 0.94, exp_min_start: 88, p_cameo: 0.04, exp_min_cameo: 18 };
  const players = [
    { fpl_id: 1, web_name: "Van Dijk", position: "DEF", team_id: 14, status: "a", chance_of_playing: null, price: 6.5 },
    { fpl_id: 2, web_name: "Kerkez", position: "DEF", team_id: 14, status: "a", chance_of_playing: null, price: 5.5 },
    { fpl_id: 3, web_name: "Frimpong", position: "DEF", team_id: 14, status: "a", chance_of_playing: null, price: 5.5 },
    { fpl_id: 4, web_name: "Jacquet", position: "DEF", team_id: 14, status: "a", chance_of_playing: null, price: 4.5 },
    { fpl_id: 5, web_name: "Weak club CB", position: "DEF", team_id: 3, status: "a", chance_of_playing: null, price: 4.5 },
  ];
  const arch = new Map([
    [1, { pointsPer90: 5.6, nineties: 33 }],
    [2, { pointsPer90: 5.4, nineties: 30 }],
    [3, { pointsPer90: 5.2, nineties: 28 }],
  ]);
  const s = buildScorer({
    projections: new Map(), perGw: new Map(), archivePer90: arch, understat: new Map(),
    envByTeam: null, leagueMeanGoals: null, goalPoints: { DEF: 6 }, assistPoints: 3, appearancePoints: 2,
    shrinkageNineties: 6, positionMeans: F.position_points_per_start, players,
    minutesForecasts: new Map(players.map((p) => [p.fpl_id, st])),
    teamQuality: new Map([[14, { attack: 1.24, defence: 1.26 }], [3, { attack: 0.8, defence: 0.8 }]]),
  });

  const jacquet = s.scoreOf(players[3]);
  const mates = [s.scoreOf(players[0]), s.scoreOf(players[1]), s.scoreOf(players[2])];
  const weak = s.scoreOf(players[4]);

  // Close to his team-mates, because that is the population he belongs to.
  assert.ok(jacquet > Math.min(...mates) - 0.6,
    `an unproven starter must sit near his proven team-mates: ${jacquet} against ${Math.min(...mates)}`);
  // But below them, because he is unproven and that uncertainty is real.
  assert.ok(jacquet < Math.max(...mates),
    "and still below the proven ones, since being unproven is not free");
  // And clearly above an identical blank record at a weak club, which was the whole complaint.
  assert.ok(jacquet > weak + 1.5,
    `and well clear of the same blank record at a weak club: ${jacquet} against ${weak}`);

  // Only proven team-mates may set the level, and never fewer than two of them.
  const src = readFileSync(join(ROOT, "lib", "solver", "score.mjs"), "utf8");
  assert.match(src, /Number\(a\.nineties\) < 10\) continue/, "a thin record does not count as proven");
  assert.match(src, /rates\.length >= 2/, "one team-mate cannot set the level alone");
  assert.match(src, /Number\(f\.p_start\) < 0\.5\) continue/, "and a benched team-mate is not evidence");
});

test("an impossible archive rate is refused, because it is a data error not a superstar", () => {
  /* Louis reported Gabriel at 9.4 a gameweek and 11.2 in one of them. Working backwards, that needs a
     points-per-90 near 8.5, which no defender has recorded over a season. The formula was not at fault: fed a
     realistic 4.6 it returns 5.8. The RATE was wrong, and nothing downstream could tell a corrupted rate from
     an exceptional player. If minutes are under-recorded while points are complete, the per-90 inflates by
     exactly that ratio. */
  const F = JSON.parse(readFileSync(join(ROOT, "config", "fitted-params.json"), "utf8"));
  const p = { fpl_id: 1, position: "DEF", team_id: 1, status: "a", chance_of_playing: null, price: 8 };
  const at = (rate) => {
    const s = buildScorer({
      projections: new Map(), perGw: new Map(),
      archivePer90: new Map([[1, { pointsPer90: rate, nineties: 33 }]]), understat: new Map(),
      envByTeam: new Map([[1, { forGoals: 2.0, againstGoals: 0.7 }]]), leagueMeanGoals: 2.7,
      goalPoints: { DEF: 6 }, assistPoints: 3, appearancePoints: 2, shrinkageNineties: 6,
      positionMeans: F.position_points_per_start, players: [p],
      minutesForecasts: new Map([[1, { p_start: 0.94, exp_min_start: 88, p_cameo: 0.04, exp_min_cameo: 18 }]]),
    });
    return { xp: s.scoreOf(p), capped: s.rateCapped() };
  };

  const real = at(4.6);
  const absurd = at(13.7);
  assert.equal(real.capped, 0, "a real rate is left alone");
  assert.ok(absurd.capped > 0, "an impossible one is counted, so the data problem is visible");
  assert.ok(absurd.xp < 8, `a defender cannot project ${absurd.xp} in a gameweek`);

  // Doubling an already impossible rate must change nothing, or the cap is not a cap.
  assert.equal(at(20).xp, absurd.xp, "beyond the ceiling the rate stops mattering");

  // Sanity on the ceilings themselves: generous enough for the best players ever, not for corruption.
  const src = readFileSync(join(ROOT, "lib", "solver", "score.mjs"), "utf8");
  const ceil = src.match(/RATE_CEILING = \{ GKP: ([\d.]+), DEF: ([\d.]+), MID: ([\d.]+), FWD: ([\d.]+) \}/);
  assert.ok(ceil, "the ceilings must be stated in one place");
  const [gk, def, mid, fwd] = ceil.slice(1).map(Number);
  assert.ok(def >= 6 && def <= 7, `a defender ceiling of ${def} should sit just above the best ever recorded`);
  assert.ok(fwd > def, "a forward ceiling must be higher than a defender's");
  assert.ok(gk <= def, "and a keeper's no higher than a defender's");
  assert.ok(mid >= 7 && mid <= 9, `a midfielder ceiling of ${mid} should allow a Salah season`);

  // And a corrupt team-mate must not lift a whole club through the prior.
  assert.match(src, /rates\.push\(sane\(a\.pointsPer90, m\.position\)\)/,
    "the team-mate prior must use capped rates too");
});

test("the backtest walks forward and never sees the gameweek it is projecting", () => {
  /* Every parameter in this model was defended with an argument and none was measured, which is how it ended
     up projecting a defender at eleven points a week with every test passing. This job measures instead.
     The discipline that makes it worth anything is that no future information reaches the projection: a model
     tuned on data it has already seen looks excellent and predicts nothing. */
  const src = readFileSync(join(ROOT, "jobs", "backtest.mjs"), "utf8");

  assert.match(src, /const past = list\.filter\(\(r\) => r\.gw < gw\)/,
    "history must be strictly before the gameweek being projected");
  assert.ok(!/r\.gw <= gw/.test(src), "never including the gameweek itself");
  assert.match(src, /for \(let gw = FROM_GW; gw <= TO_GW; gw\+\+\)/, "it walks forward one gameweek at a time");

  // Bias is the number that answers the complaint, so it must be reported and explained.
  assert.match(src, /bias/, "signed error must be reported, not just absolute");
  assert.match(src, /positive means it projects too high/, "and its direction explained in words");

  // A baseline, or a bad model looks fine in isolation.
  assert.match(src, /baseline/, "it must compare against a naive baseline");
  assert.match(src, /his own average so far/, "which is each player's own average to date");

  // Broken out, because a model can be right overall and badly wrong about defenders.
  assert.match(src, /BY POSITION/, "results by position");
  assert.match(src, /POSITION CROSSED WITH PRICE/, "and by price band, crossed with position");

  // Minutes held fixed, so this measures the points model rather than the minutes model.
  assert.match(src, /p_start: 1, exp_min_start: 90/, "minutes are fixed for players who started");
  assert.match(src, /isolates the points model/, "and it says why");

  // Runnable without a terminal, which is the only way it will ever actually be used here.
  const wf = readFileSync(join(ROOT, ".github/workflows/backtest.yml"), "utf8");
  assert.match(wf, /workflow_dispatch/, "it must be triggerable from the Actions tab");
  assert.match(wf, /SHRINKAGE: \$\{\{ github\.event\.inputs\.shrinkage \}\}/,
    "with the parameter under test as an input, so two settings can be compared");
});

test("the backtest workflow runs on the same Node as every other job", () => {
  /* It shipped on Node 20 while all fifteen other workflows use 22. The Supabase client needs native
     WebSocket support, which 20 lacks, and the error it produces talks about installing "ws" rather than
     naming the version, so it reads like a missing dependency. */
  const { readdirSync } = fsMod;
  const dir = join(ROOT, ".github/workflows");
  const versions = new Set();
  for (const f of readdirSync(dir)) {
    if (!/\.ya?ml$/.test(f)) continue;
    for (const m of readFileSync(join(dir, f), "utf8").matchAll(/node-version:\s*"?(\d+)"?/g)) {
      versions.add(m[1]);
    }
  }
  assert.equal(versions.size, 1, `every workflow must agree on a Node version, found ${[...versions].join(", ")}`);
  assert.ok(Number([...versions][0]) >= 22, "and it must be 22 or higher, or the database client fails");
});

test("the backtest reads its inputs safely and finds the season whatever the spelling", () => {
  /* Two failures on the first real run. A blank workflow input arrives as an empty string, not undefined, so
     Number("") became zero and it silently backtested a model with NO shrinkage while printing "shrinkage 0".
     And the archive job writes "2025-26" with a hyphen while the default asked for "2025/26", so it reported
     that the archive had never run when it had. */
  const src = readFileSync(join(ROOT, "jobs", "backtest.mjs"), "utf8");

  assert.match(src, /shrinkArg === "" \|\| !Number\.isFinite\(Number\(shrinkArg\)\)/,
    "a blank or unparseable input must fall back to the fitted value");
  assert.ok(!/Number\(process\.env\.SHRINKAGE\)(?!\s*\))/.test(src.replace(/shrinkArg/g, "")),
    "and never be passed straight through Number()");

  assert.match(src, /SEASON_FORMS/, "both spellings of a season are tried");
  assert.match(src, /replace\("\/", "-"\)/, "slash to hyphen");
  assert.match(src, /replace\("-", "\/"\)/, "and hyphen to slash");
  assert.match(src, /The table holds: /,
    "and when nothing matches it reports what the table DOES hold, rather than guessing why");

  // The workflow default must match what the archive job actually writes.
  const wf = readFileSync(join(ROOT, ".github/workflows/backtest.yml"), "utf8");
  const archive = readFileSync(join(ROOT, "jobs", "archive_2526.mjs"), "utf8");
  const written = archive.match(/season:\s*"([^"]+)"/);
  assert.ok(written, "the archive job must state the season it writes");
  assert.ok(wf.includes(written[1]),
    `the workflow default must match what the archive writes, which is ${written[1]}`);
});

test("the backtest scores against last season's rules, not this season's", () => {
  /* Louis's design was a version B on last season's rules, tuned until it predicted last season accurately,
     and a version A inheriting that tuning with the new rule values swapped in. The first backtest scored
     last season's actual points using THIS season's ruleset, which is A validating against B's data. */
  const src = readFileSync(join(ROOT, "jobs", "backtest.mjs"), "utf8");
  assert.match(src, /const RULES_A = readJson\("\.\.\/config\/rules-2026-27\.json"\)/, "version A is named");
  assert.match(src, /rules-2025-26\.json/, "and version B is looked for");
  assert.match(src, /const RULES = RULES_B \|\| RULES_A/, "B is preferred for a backtest");
  assert.match(src, /WARNING: config\/rules-2025-26\.json is missing/,
    "and when B is absent it says the measurement is wrong rather than mixing them silently");
});

test("last season's rules are derived from the archive, not typed from memory", async () => {
  /* The archive holds the counted events and the total points those events produced, so the point values can
     be solved for. If the derived values match what the game published, the archive is internally consistent
     and the method is sound. If they do not, every projection built on it inherits the error, which is worth
     knowing before tuning anything. */
  const { solve } = await import("../jobs/derive_rules.mjs");

  // Recover a known ruleset from synthetic rows, or the solver cannot be trusted on real ones.
  const truth = [2, 4, 3, -1];
  const A = [], b = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 600; i++) {
    const g = rnd() < 0.15 ? 1 : 0, a = rnd() < 0.12 ? 1 : 0, y = rnd() < 0.1 ? 1 : 0;
    A.push([1, g, a, y]);
    b.push(truth[0] + g * truth[1] + a * truth[2] + y * truth[3]);
  }
  const x = solve(A, b);
  x.forEach((v, i) => assert.ok(Math.abs(v - truth[i]) < 0.02,
    `the solver must recover a known rule: got ${v.toFixed(3)} for ${truth[i]}`));

  const src = readFileSync(join(ROOT, "jobs", "derive_rules.mjs"), "utf8");
  // Bonus is an award, not a rule with a value, so fitting it would absorb everyone else's error.
  assert.match(src, /- \(Number\(r\.bonus\) \|\| 0\)/, "bonus is removed from the target rather than fitted");
  // Per position, because a goal is worth different amounts.
  assert.match(src, /for \(const pos of \["GKP", "DEF", "MID", "FWD"\]\)/, "solved one position at a time");
  // A value the data never varied cannot be determined.
  assert.match(src, /if \(used < 10\) continue/, "an undetermined value is omitted rather than guessed");
  assert.match(src, /the archive itself is wrong/, "and a poor fit is reported as a data problem");
});

test("the backtest diagnoses which kind of player it fails on, not just which position", () => {
  /* MAE by position answers almost nothing. A model can be accurate on cheap defenders and useless on the
     players a manager actually chooses between, and one average hides that completely. */
  const src = readFileSync(join(ROOT, "jobs", "backtest.mjs"), "utf8");

  // Calibration is the table that matters: when it says six, do those players score six.
  assert.match(src, /CALIBRATION, does a projection of X actually produce X/,
    "it must report calibration by projected band");
  assert.match(src, /TOO HIGH/, "and flag a band that is systematically off");

  // Ordering matters more than absolute accuracy when choosing between players.
  assert.match(src, /const spearman =/, "rank correlation must be computed");
  assert.match(src, /ordering is what actually matters/, "and its meaning stated");

  // The practical test.
  assert.match(src, /TOP TWENTY HIT RATE/, "of the top twenty projections, how many were really top twenty");
  assert.match(src, /Random picking would land/, "with a chance baseline, or the number means nothing");

  // Crossed, not separate.
  assert.match(src, /POSITION CROSSED WITH PRICE/, "position and price must be crossed");
  assert.match(src, /because a premium forward is not a cheap one/, "and the reason given");

  // The other two axes that separate different problems.
  assert.match(src, /BY HOW NAILED HE IS/, "nailed starters against rotation risks");
  assert.match(src, /startRate/, "computed from starts before the gameweek projected");
  assert.match(src, /BY WHAT HE ACTUALLY SCORED/, "and hauls separated from blanks");

  // Every table must refuse to report on a sample too small to mean anything.
  assert.match(src, /if \(subset\.length < 20\) return;/, "no table reports on fewer than twenty rows");
});

test("DefCon is a threshold award, not a per-action value", () => {
  /* The archive's defcon column is a raw count of clearances, blocks, interceptions and tackles. The rule
     awards two points ONCE when a threshold is crossed. Fitting it per action gave 0.17 for defenders, and
     0.17 times a dozen actions is about two points, so it absorbed the appearance points and dragged them
     from a true 2.00 down to a fitted 1.25. The keeper fit was perfect precisely because keepers never
     trigger it. */
  const src = readFileSync(join(ROOT, "jobs", "derive_rules.mjs"), "utf8");
  assert.match(src, /\(Number\(r\.defcon\) \|\| 0\) >= \(r\.position === "DEF" \? 10 : 12\) \? 1 : 0/,
    "it must be a threshold indicator, with the lower bar for defenders");
  assert.ok(!/^\s+Number\(r\.defcon\) \|\| 0,$/m.test(src), "and never a bare count");

  // The rule values themselves must match the ruleset rather than being hardcoded twice.
  const rules = JSON.parse(readFileSync(join(ROOT, "config", "rules-2026-27.json"), "utf8"));
  const dc = rules.scoring.defensive_contribution;
  assert.equal(dc.def_threshold_cbit.value, 10, "the defender threshold in the ruleset");
  assert.equal(dc.mid_fwd_threshold_cbirt.value, 12, "and the threshold for everyone else");
});
