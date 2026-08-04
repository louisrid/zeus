import test from "node:test";
import assert from "node:assert/strict";
import {
  applyOptimisedRangeToPlan,
  optimiseSavedPlanRange,
  summariseSavedPlanRange,
} from "../lib/plan-range.mjs";

const players = [];
let id = 1;
for (const [position, count] of [["GKP", 2], ["DEF", 5], ["MID", 5], ["FWD", 3]]) {
  for (let index = 0; index < count; index += 1) {
    players.push({
      id, fpl_id: id, position, team_id: id, team: `T${id}`,
      web_name: `${position}${index + 1}`, price: 4.5, starting: id <= 11,
    });
    id += 1;
  }
}
const base = players.map((player, index) => ({
  fpl_id: player.fpl_id,
  position: player.position,
  team_id: player.team_id,
  price: player.price,
  purchasePrice: player.price,
  starting: index < 11,
}));
const incoming = { ...players[11], id: 16, fpl_id: 16, team_id: 16, team: "T16", web_name: "MID6" };
const allPlayers = [...players, incoming];
const plan = {
  id: 10,
  kind: "plan",
  name: "Main",
  structure: "3-4-3",
  captain: 11,
  vice: 10,
  base,
  weeks: {
    1: { chip: null, transfers: [] },
    2: {
      chip: "benchboost",
      transfers: [{ out: 12, in: 16, position: "MID", team_id: 16, price: 4.5 }],
    },
  },
};
const scorer = {
  scoreForGw: (player, gw) => Number(player.fpl_id) + gw,
};

test("saved-plan range follows transfers and chips in their exact gameweeks", () => {
  const result = summariseSavedPlanRange({
    plan, players: allPlayers, scorer, gwFrom: 1, gwTo: 2, includePlayers: true,
  });
  assert.equal(result.weekly.length, 2);
  assert.equal(result.weekly[0].players.some((player) => player.fpl_id === 12), true);
  assert.equal(result.weekly[1].players.some((player) => player.fpl_id === 12), false);
  assert.equal(result.weekly[1].players.some((player) => player.fpl_id === 16), true);
  assert.equal(result.weekly[0].bench_boost_bonus, 0);
  assert.ok(result.weekly[1].bench_boost_bonus > 0);
  assert.equal(result.total.net_xpts, result.weekly.reduce((sum, week) => sum + week.net_xpts, 0));
});

test("simulate_gw changes one exact week and never persists", () => {
  const result = summariseSavedPlanRange({
    plan, players: allPlayers, scorer, gwFrom: 1, gwTo: 2,
    simulateChip: "triplecaptain", simulateGw: 1,
  });
  assert.equal(result.simulation.gw, 1);
  assert.equal(result.simulation.chip, "triplecaptain");
  assert.equal(result.simulation.persisted, false);
  assert.equal(result.simulation.range_simulated_net_xpts,
    result.total.net_xpts + result.simulation.difference);
  assert.equal(plan.weeks[1].chip, null);
});

test("range optimisation saves weekly roles atomically without changing the base 15", () => {
  const beforeBase = JSON.stringify(plan.base);
  const result = optimiseSavedPlanRange({ plan, players: allPlayers, scorer, gwFrom: 1, gwTo: 2 });
  assert.equal(result.ok, true);
  assert.equal(result.weekly.length, 2);
  const next = applyOptimisedRangeToPlan(plan, result);
  assert.equal(JSON.stringify(next.base), beforeBase);
  assert.equal(next.weeks[1].startingIds.length, 11);
  assert.equal(next.weeks[2].startingIds.length, 11);
  assert.ok(next.weeks[1].captain);
  assert.ok(next.weeks[2].vice);
  assert.equal(next.weeks[2].chip, "benchboost");
  assert.equal(next.weeks[2].transfers.length, 1);
});

test("saved-plan ranges reject unsupported or incomplete requests", () => {
  assert.throws(() => summariseSavedPlanRange({ plan, players: allPlayers, scorer, gwFrom: 2, gwTo: 9 }), /GW1-GW8/);
  assert.throws(() => summariseSavedPlanRange({
    plan, players: allPlayers, scorer, gwFrom: 1, gwTo: 2,
    simulateChip: "benchboost", simulateGw: 3,
  }), /inside the requested/);
});
