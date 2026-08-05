import test from "node:test";
import assert from "node:assert/strict";
import { buildSquadForRange } from "../lib/solver/build-range.mjs";

test("Bench Boost builds optimise the full 100m squad without an artificial 17m bench cap", () => {
  const pool = [];
  let id = 1;
  for (const [position, count] of [["GKP", 2], ["DEF", 5], ["MID", 5], ["FWD", 3]]) {
    for (let index = 0; index < count; index += 1) {
      pool.push({
        id,
        fpl_id: id,
        web_name: `${position}${index + 1}`,
        position,
        team_id: id,
        team: `T${id}`,
        price: 6,
        status: "a",
      });
      id += 1;
    }
  }
  const result = buildSquadForRange({
    pool,
    scoreForGw: (player, gw) => gw === 2 ? 20 - Number(player.fpl_id) / 10 : 5,
    gwFrom: 1,
    gwTo: 3,
    chipForGw: (gw) => gw === 2 ? "benchboost" : null,
    budget: 100,
    benchBudget: 17,
    maxPerClub: 3,
    startProbOf: () => 1,
    maxSwapPasses: 2,
  });
  assert.equal(result.ok, true, result.error);
  const bbWeek = result.weekly.find((week) => week.gw === 2);
  assert.equal(bbWeek.chip, "benchboost");
  assert.equal(bbWeek.bench.reduce((sum, player) => sum + Number(player.price), 0), 24);
  assert.ok(bbWeek.bench_boost_bonus > 0);
  assert.equal(result.benchBudget, null);
});
