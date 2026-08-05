import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planRowFromBenchBoostBuild, verifySavedPlan } from "../lib/benchboost-comparison.mjs";
import { hydratePlanState } from "../lib/plan-range.mjs";
import { squadAt } from "../lib/plan.mjs";
import { validatePlanWrite } from "../lib/plan-write-validation.mjs";

const positions = ["GKP","GKP","DEF","DEF","DEF","DEF","DEF","MID","MID","MID","MID","MID","FWD","FWD","FWD"];
const players = positions.map((position, index) => ({
  fpl_id: index + 1,
  position,
  team_id: index + 1,
  team: `T${index + 1}`,
  web_name: `P${index + 1}`,
  price: 5,
}));
const rawWeeks = [
  { gw: 1, formation: "3-5-2", starters: [1,3,4,5,8,9,10,11,12,13,14], bench: [2,6,7,15], chip: null },
  { gw: 2, formation: "4-4-2", starters: [2,3,4,5,6,8,9,10,11,13,14], bench: [1,7,12,15], chip: "benchboost" },
  { gw: 3, formation: "4-5-1", starters: [1,3,4,5,6,8,9,10,11,12,13], bench: [2,7,14,15], chip: null },
];
const weekly = rawWeeks.map((week) => ({
  ...week,
  starters: week.starters.map((id) => players[id - 1]),
  bench: week.bench.map((id) => players[id - 1]),
  bench_order: week.bench,
  captain: 13,
  vice_captain: week.starters.includes(14) ? 14 : 12,
}));

test("exact server conversion survives the same GW1-GW3 hydration path used by the squad screen", () => {
  const row = planRowFromBenchBoostBuild({ players, weekly }, "Exact pair");
  assert.deepEqual(Object.keys(row.weeks), ["1", "2", "3"]);
  for (const source of rawWeeks) {
    const state = hydratePlanState(row, source.gw, players);
    const displayed = state.players.filter((player) => player.starting).map((player) => player.fpl_id).sort((a, b) => a - b);
    assert.deepEqual(displayed, [...source.starters].sort((a, b) => a - b), `GW${source.gw} shifted during hydration`);
    assert.deepEqual([...state.benchOrder].sort((a, b) => a - b), [...source.bench].sort((a, b) => a - b));
  }
  assert.equal(squadAt(row, 1).chip, null);
  assert.equal(squadAt(row, 2).chip, "benchboost");
  assert.equal(squadAt(row, 3).chip, null);
  assert.equal(validatePlanWrite({ base: row.base, weeks: row.weeks, strictGameweeks: [1,2,3] }).ok, true);
  assert.equal(verifySavedPlan(structuredClone(row), row).ok, true);
});

test("the original zero-based off-by-one corruption is rejected", () => {
  const row = planRowFromBenchBoostBuild({ players, weekly }, "Shifted");
  const shifted = { "0": row.weeks["1"], "1": row.weeks["2"], "2": row.weeks["3"] };
  const result = validatePlanWrite({ base: row.base, weeks: shifted, strictGameweeks: [1,2,3] });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /never "0"/);
  assert.match(result.errors.join(" "), /GW3 is required but missing/);
});

test("comparison endpoint uses only explicit candidate gameweeks and server-side persistence", () => {
  const source = readFileSync("app/api/benchboost-compare/route.js", "utf8");
  assert.match(source, /candidate_chip_gameweeks/);
  assert.match(source, /for \(const chipGw of parsed\.candidateChipGameweeks\)/);
  assert.match(source, /saveAndVerify\(db, builds, parsed\.saveNames, parsed\.deletePlanIds\)/);
  assert.match(source, /bench_order does not exactly match the four bench players/);
  assert.match(source, /value\?\.fpl_id \?\? value\?\.element \?\? value\?\.id \?\? value/);
  assert.doesNotMatch(source, /for \(let chipGw = parsed\.gwFrom/);
});

test("plans endpoint validates without banning incomplete ordinary plans", () => {
  const source = readFileSync("app/api/plans/route.js", "utf8");
  assert.match(source, /validatePlanWrite/);
  assert.match(source, /Invalid plan payload/);
  assert.doesNotMatch(source, /base must contain exactly 15 players/);
});
