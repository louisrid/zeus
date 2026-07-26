// Scoring formulas. Each test states the decision it protects.
import test from "node:test";
import assert from "node:assert/strict";
import { lineStrength, overallScore, captaincyStrength, templateAlignment, clubConcentration, scoreSquad } from "../lib/scoring.js";
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
