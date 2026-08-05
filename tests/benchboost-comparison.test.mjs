import test from "node:test";
import assert from "node:assert/strict";
import {
  compareBenchBoostBuilds,
  nextAvailablePlanName,
  planRowFromBenchBoostBuild,
  renderBenchBoostReport,
  verifySavedPlan,
} from "../lib/benchboost-comparison.mjs";

const players = (ids) => ids.map((fpl_id, index) => ({
  fpl_id,
  web_name: `P${fpl_id}`,
  team: `T${(index % 8) + 1}`,
  position: index < 2 ? "GKP" : index < 7 ? "DEF" : index < 12 ? "MID" : "FWD",
  team_id: (index % 8) + 1,
  price: 4.5 + (index % 4) * 0.5,
}));

function build(chip_gw, ids, weeklyNets) {
  const squad = players(ids);
  const starters = squad.slice(0, 11);
  const bench = squad.slice(11);
  const weekly = [1, 2, 3].map((gw, index) => ({
    gw,
    chip: gw === chip_gw ? "benchboost" : null,
    formation: "3-5-2",
    starters,
    bench,
    captain: starters[0].fpl_id,
    vice_captain: starters[1].fpl_id,
    bench_order: bench.map((p) => p.fpl_id),
    xi_cost: 80,
    bench_cost: 20,
    bench_boost_bonus: gw === chip_gw ? 10 + chip_gw : 0,
    net_xpts: weeklyNets[index],
  }));
  const net = weeklyNets.reduce((sum, value) => sum + value, 0);
  return {
    chip_gw,
    players: squad,
    total: { net_xpts: net, bench_boost_bonus: 10 + chip_gw },
    objective: {
      gw_from: 1,
      gw_to: 3,
      weekly_net_xpts_sum: net,
      arithmetic_verified: true,
    },
    weekly,
  };
}

test("comparison uses exact ID intersections, enriched players and verified range totals", () => {
  const one = build(1, [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [60, 65, 65]);
  const two = build(2, [1,2,3,4,5,6,7,8,16,17,18,19,20,21,22], [65, 65, 65]);
  const three = build(3, [1,2,3,4,5,6,7,8,23,24,25,26,27,28,29], [63, 65, 65]);
  const result = compareBenchBoostBuilds([one, two, three]);
  assert.deepEqual(result.all_shared_player_ids, [1,2,3,4,5,6,7,8]);
  assert.deepEqual(result.all_shared_players.map((player) => player.fpl_id), [1,2,3,4,5,6,7,8]);
  assert.equal(result.all_shared_count, 8);
  assert.equal(result.winner_chip_gw, 2);
  assert.equal(result.margin_to_second, 2);
  assert.deepEqual(result.margins_from_winner, [
    { chip_gw: 3, margin: 2 },
    { chip_gw: 1, margin: 5 },
  ]);
  assert.ok(result.ranking.every((row) => row.arithmetic_verified));
  for (const unique of result.unique_by_chip_gw) {
    assert.equal(unique.player_ids.length, 7);
    assert.deepEqual(unique.players.map((player) => player.fpl_id), unique.player_ids);
    assert.ok(unique.player_ids.every((id) => !result.all_shared_player_ids.includes(id)));
  }
  assert.equal(result.pairwise.length, 3);
  assert.ok(result.pairwise.every((row) => row.shared_count === 8 && row.identical === false));
});

test("comparison exposes an arithmetic mismatch instead of hiding it", () => {
  const broken = build(1, [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [60, 60, 60]);
  broken.total.net_xpts = 999;
  const result = compareBenchBoostBuilds([broken]);
  assert.equal(result.ranking[0].weekly_net_xpts_sum, 180);
  assert.equal(result.ranking[0].arithmetic_verified, false);
});

test("duplicate-safe names are case-insensitive", () => {
  const used = ["Granite Pulse", "granite pulse (2)"];
  assert.equal(nextAvailablePlanName("granite pulse", used), "granite pulse (3)");
});

test("saved plan verification catches wrong payloads", () => {
  const expected = planRowFromBenchBoostBuild(
    build(2, [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [65, 65, 65]),
    "iron meadow",
  );
  assert.equal(verifySavedPlan(expected, expected).ok, true);
  const wrong = structuredClone(expected);
  wrong.base[0].fpl_id = 999;
  assert.equal(verifySavedPlan(wrong, expected).ok, false);
});

test("the backend report is ready for Letta to return without recalculation", () => {
  const one = build(1, [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [60, 65, 65]);
  const two = build(2, [1,2,3,4,5,6,7,8,16,17,18,19,20,21,22], [65, 65, 65]);
  const comparison = compareBenchBoostBuilds([one, two]);
  const report = renderBenchBoostReport({
    gwFrom: 1,
    gwTo: 3,
    builds: [one, two],
    comparison,
    deleted: [{ id: "old", name: "old plan", result: "deleted" }],
    saved: [{ name: "new plan", id: "abc", plan_id: "abc", verified: true }],
  });
  assert.match(report, /Each build maximises total net xPTS across GW1-GW3/);
  assert.match(report, /Weekly sum: 195\.0\. Verified: yes/);
  assert.match(report, /new plan \| abc \| true/);
  assert.match(report, /Only in the GW2 build/);
});
