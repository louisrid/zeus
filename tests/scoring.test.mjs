// Scoring formulas. Each test states the decision it protects.
import test from "node:test";
import assert from "node:assert/strict";
import { lineStrength, overallScore, captaincyStrength, templateAlignment, topRankAlignment, clubConcentration, scoreSquad } from "../lib/scoring.js";
import { templateSquad } from "../lib/data.js";
import { buildScorer } from "../lib/solver/score.mjs";

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

test("every club is scored on the same opponent basis", async () => {
  // Blending strength and xG for clubs that have xG, and strength alone for clubs that do not, put
  // them on different scales. A mid-table side read as the easiest fixture in the league.
  const { buildOpponentScale } = await import("../lib/opponent.js");
  const mixed = {
    1: { id: 1, short_name: "ARS", strength: 1350, xg_for: 74.4 },
    2: { id: 2, short_name: "TOT", strength: 1240, xg_for: null },
    3: { id: 3, short_name: "SUN", strength: 1080, xg_for: 46.0 },
    4: { id: 4, short_name: "MCI", strength: 1360, xg_for: 92.3 },
  };
  const s = buildOpponentScale(mixed);
  assert.equal(s.xgUsable, false, "one club missing xG must disable the blend for everyone");
  const bases = Object.values(mixed).map((t) => s.difficultyOf(t.id, false).basis);
  assert.equal(new Set(bases).size, 1, `all clubs must share one basis, got ${[...new Set(bases)].join(", ")}`);

  const complete = { ...mixed, 2: { id: 2, short_name: "TOT", strength: 1240, xg_for: 49.4 } };
  const t = buildOpponentScale(complete);
  assert.equal(t.xgUsable, true, "complete xG data must enable the blend");
  assert.match(t.difficultyOf(1, false).basis, /strength \+ xG/);
});
