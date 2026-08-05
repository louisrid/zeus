import test from "node:test";
import assert from "node:assert/strict";
import { bestXI } from "../lib/solver/autobuild.mjs";
import { optimiseSquad } from "../lib/solver/optimise.mjs";
import { buildSquadForRange } from "../lib/solver/build-range.mjs";

function fixedFifteen() {
  let id = 1;
  const players = [];
  const add = (position, price, xp, team) => players.push({
    fpl_id: id++, web_name: `${position}${id}`, position, price, xp, team_id: team,
  });
  add("GKP", 6, 10, 1);
  add("GKP", 4, 1, 2);
  for (let i = 0; i < 5; i += 1) add("DEF", 4, 5 - i * 0.1, 3 + i);
  for (let i = 0; i < 5; i += 1) add("MID", 4, 6 - i * 0.1, 8 + i);
  for (let i = 0; i < 3; i += 1) add("FWD", 4, 7 - i * 0.1, 13 + i);
  return players;
}

test("owned-squad optimisation treats 17m as a minimum, not a maximum", () => {
  const players = fixedFifteen();
  const expensiveKeeper = players[0];
  const cheapKeeper = players[1];
  const result = optimiseSquad(
    { structure: "3-4-3", players, captain: null, vice: null },
    (player) => player.xp,
    { xiBudget: 83, benchBudget: 17 },
  );
  assert.ok(result);
  assert.ok(result.benchCost >= 17, `bench must cost at least 17m, got ${result.benchCost}`);
  assert.ok(result.players.find((player) => player.fpl_id === cheapKeeper.fpl_id)?.starting);
  assert.equal(result.players.find((player) => player.fpl_id === expensiveKeeper.fpl_id)?.starting, false);
});

test("the builder permits a bench above 17m", () => {
  const result = bestXI({ pool: fixedFifteen(), xpOf: (player) => player.xp, benchBudget: 17 });
  assert.ok(result);
  assert.equal(result.benchCost, 18);
  assert.ok(result.benchCost >= 17);
  assert.ok(result.cost <= 100);
});

test("range builds preserve the 17m minimum in every weekly lineup", () => {
  const result = buildSquadForRange({
    pool: fixedFifteen(),
    scoreForGw: (player) => player.xp,
    gwFrom: 1,
    gwTo: 2,
    budget: 100,
    benchBudget: 17,
  });
  assert.ok(result.ok, result.error);
  assert.ok(result.benchCost >= 17, `first-week bench must cost at least 17m, got ${result.benchCost}`);
  for (const week of result.weekly) {
    const cost = week.bench.reduce((sum, player) => sum + player.price, 0);
    assert.ok(cost >= 17, `GW${week.gw} bench must cost at least 17m, got ${cost}`);
  }
});
