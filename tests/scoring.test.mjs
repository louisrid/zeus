// Scoring formulas. Each test states the decision it protects.
import test from "node:test";
import assert from "node:assert/strict";
import { lineStrength, overallScore, captaincyStrength, templateAlignment, clubConcentration, scoreSquad } from "../lib/scoring.js";

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
