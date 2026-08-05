import test from "node:test";
import assert from "node:assert/strict";
import { buildSquadForRange } from "../lib/solver/build-range.mjs";

test("Bench Boost can move spend above the 17m minimum when the complete squad scores more", () => {
  let id = 1;
  const pool = [];
  const add = (position, price, xp, team, label) => pool.push({
    id,
    fpl_id: id++,
    web_name: label,
    position,
    price,
    xp,
    team_id: team,
    team: `T${team}`,
    status: "a",
  });

  add("GKP", 6, 10, 1, "GK starter");
  add("GKP", 4, 1, 2, "GK bench");

  add("DEF", 6, 10, 3, "DEF 1");
  add("DEF", 6, 10, 4, "DEF 2");
  add("DEF", 6, 10, 5, "DEF 3");
  add("DEF", 4, 1, 6, "DEF bench 1");
  add("DEF", 4, 1, 7, "DEF bench 2");

  const premiumMidId = id;
  add("MID", 12, 12, 8, "Premium MID");
  add("MID", 8, 10, 9, "MID 2");
  add("MID", 8, 10, 10, "MID 3");
  add("MID", 8, 10, 11, "MID 4");
  add("MID", 7, 10, 12, "MID 5");
  const balancedMidId = id;
  add("MID", 8, 11, 13, "Balanced MID");

  add("FWD", 8, 10, 14, "FWD 1");
  add("FWD", 8, 10, 15, "FWD 2");
  const cheapBenchForwardId = id;
  add("FWD", 5, 0, 16, "Cheap bench FWD");
  const strongBenchForwardId = id;
  add("FWD", 9, 7, 17, "Strong bench FWD");

  const result = buildSquadForRange({
    pool,
    scoreForGw: (player) => player.xp,
    gwFrom: 1,
    gwTo: 1,
    chipForGw: () => "benchboost",
    budget: 100,
    benchBudget: 17,
    startProbOf: () => 1,
  });

  assert.equal(result.ok, true, result.error);
  assert.equal(result.cost, 100);
  assert.equal(result.benchCost, 21, `Bench Boost should use a 21m bench here, got ${result.benchCost}`);
  assert.ok(result.benchCost >= 17);
  assert.ok(result.xiCost <= 83);

  const ids = new Set([...result.xi, ...result.bench].map((player) => player.fpl_id));
  assert.ok(ids.has(balancedMidId), "the cheaper MID must fund the stronger Bench Boost substitute");
  assert.ok(ids.has(strongBenchForwardId), "the stronger substitute must be selected");
  assert.ok(!ids.has(premiumMidId), "the premium MID is the inferior full-squad allocation");
  assert.ok(!ids.has(cheapBenchForwardId), "the zero-point bench filler must be replaced");
});
