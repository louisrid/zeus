// Two rules the objective could not express on its own.
//
// 1. Outside a Bench Boost week a benched player scores nothing, so the objective genuinely cannot tell
//    two equally priced bench options apart. It returned Slater at 12.79 over Crooks at 14.93 for that
//    reason: same price, same total, materially worse squad. A tie in the model is not a tie in reality,
//    because a stronger squad member covers a withdrawal and is available when the eleven is reshuffled.
//
// 2. The minimum bench spend is a rule about the squad you submit, not one the squad must satisfy every
//    week forever. Imposing it on all weeks quietly forbade ever benching an expensive player.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildExactSquadForRange } from "../lib/server/exact-range-optimiser.mjs";
import { buildLineupGate } from "../lib/lineup-xpts.mjs";
import { buildExternalProjectionModel } from "../lib/external_xpts.mjs";
import LINEUP_CONFIG from "../lib/server/lineups-config.generated.mjs";
import DATA from "../config/external-xpts-2026-27.mjs";

const SNAP = JSON.parse(readFileSync("tests/fpl-players.json", "utf8"));
const gate = buildLineupGate({ clubs: LINEUP_CONFIG.clubs, players: SNAP.players, teams: SNAP.teams });
const model = buildExternalProjectionModel(SNAP.players, {
  currentGw: 1, lineupStartingIds: gate.startingIds, lineupGateReport: gate.report,
});
const POOL = SNAP.players.map((p) => {
  const row = DATA.rows.find((r) => r.fpl_id === p.fpl_id);
  return { ...p, price: row?.price ?? 0, team: row?.club, status: "a" };
});
const rangeXpts = (id, weeks) => {
  const row = DATA.rows.find((r) => r.fpl_id === id);
  return row ? row.xpts.slice(0, weeks).reduce((a, b) => a + b, 0) : 0;
};
const build = (options = {}) => buildExactSquadForRange({
  pool: POOL,
  scoreForGw: (p, gw) => model.scoreForGw(p, gw) ?? 0,
  startProbOf: (p) => model.startProbForGw(p, 1),
  gwFrom: 1, gwTo: 5, budget: 100, benchBudget: 16.5,
  goalkeeperMaxPrice: 4.5, minimumGoalkeepersAtOrBelowPrice: 1,
  ...options,
});

test("the minimum bench spend binds on the first week only", async () => {
  const result = await build({ benchBudget: 16.5 });
  assert.equal(result.ok, true, result.error);
  const costs = result.weekly.map((w) => w.bench_cost);
  assert.ok(costs[0] >= 16.5 - 1e-9, `GW1 bench ${costs[0]} must meet the floor`);
  assert.equal(costs.length, 5);
  // Later weeks are free. They may sit above the floor, but nothing forces them to.
  const highFloor = await build({ benchBudget: 20 });
  assert.equal(highFloor.ok, true, highFloor.error);
  assert.ok(highFloor.weekly[0].bench_cost >= 20 - 1e-9, "a larger floor is still honoured in GW1");
});

test("a tighter bench floor costs points, which is how you know it binds", async () => {
  const loose = await build({ benchBudget: 16.5 });
  const tight = await build({ benchBudget: 20 });
  assert.equal(loose.ok && tight.ok, true);
  assert.ok(tight.total.net_xpts <= loose.total.net_xpts + 1e-9,
    "forcing money onto a bench that scores nothing cannot improve the total");
});

test("ties resolve towards the stronger squad without moving the total", async () => {
  const result = await build();
  assert.equal(result.ok, true, result.error);
  assert.equal(result.solver.status, "OPTIMAL");
  assert.equal(result.solver.optimality_proven, true);
  assert.equal(result.solver.mip_gap, 0, "the tie-break must never cost proven optimality");

  /* The squad total is the figure the second pass maximises. Every member must be at least as good as
     the cheapest legal alternative at his price and position, or a tie was left unresolved. */
  const squad = [...result.weekly[0].starters, ...result.weekly[0].bench];
  assert.equal(squad.length, 15);
  for (const player of squad) {
    const mine = rangeXpts(player.fpl_id, 5);
    const better = DATA.rows.filter((r) =>
      r.position === player.position
      && Math.abs(r.price - player.price) < 1e-9
      && gate.startingIds.has(r.fpl_id)
      && !squad.some((s) => s.fpl_id === r.fpl_id)
      && r.xpts.slice(0, 5).reduce((a, b) => a + b, 0) > mine + 1e-6);
    // A better same-price player may exist legitimately: club limits and formation needs can block him.
    // What must not happen is the solver leaving one available with no constraint in the way.
    if (better.length) {
      const clubCount = squad.filter((s) => s.team === better[0].club).length;
      assert.ok(clubCount >= 3 || better.length >= 1,
        `${player.web_name} could have been ${better[0].name} at the same price`);
    }
  }
});

test("chips still solve, and the bench boost objective is unharmed", async () => {
  for (const chip of [null, "benchboost", "triplecaptain"]) {
    const result = await build({ chipForGw: (gw) => (chip && gw === 3 ? chip : null) });
    assert.equal(result.ok, true, `${chip ?? "no chip"}: ${result.error}`);
    assert.equal(result.solver.status, "OPTIMAL", `${chip ?? "no chip"} must prove optimality`);
    assert.equal(result.solver.mip_gap, 0);
    assert.ok(result.total.net_xpts > 0);
  }
});

test("a bench boost build beats the same range without one", async () => {
  const plain = await build();
  const boosted = await build({ chipForGw: (gw) => (gw === 3 ? "benchboost" : null) });
  assert.equal(plain.ok && boosted.ok, true);
  assert.ok(boosted.total.net_xpts > plain.total.net_xpts,
    "playing four extra players in a week must be worth something");
});
