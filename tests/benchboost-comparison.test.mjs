import test from "node:test";
import assert from "node:assert/strict";
import {
  compareBenchBoostBuilds,
  nextAvailablePlanName,
  planRowFromBenchBoostBuild,
  verifySavedPlan,
} from "../lib/benchboost-comparison.mjs";

const players = (ids) => ids.map((fpl_id, index) => ({
  fpl_id,
  web_name: `P${fpl_id}`,
  position: index < 2 ? "GKP" : index < 7 ? "DEF" : index < 12 ? "MID" : "FWD",
  team_id: (index % 8) + 1,
  price: 4.5 + (index % 4) * 0.5,
}));

function build(chip_gw, ids, net) {
  const squad = players(ids);
  const starters = squad.slice(0, 11);
  const bench = squad.slice(11);
  return {
    chip_gw,
    players: squad,
    total: { net_xpts: net, bench_boost_bonus: 10 + chip_gw },
    weekly: [1, 2, 3].map((gw) => ({
      gw,
      chip: gw === chip_gw ? "benchboost" : null,
      formation: "3-5-2",
      starters,
      bench,
      captain: starters[0].fpl_id,
      vice_captain: starters[1].fpl_id,
      bench_order: bench.map((p) => p.fpl_id),
    })),
  };
}

test("comparison uses exact ID intersections and differences", () => {
  const one = build(1, [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], 190);
  const two = build(2, [1,2,3,4,5,6,7,8,16,17,18,19,20,21,22], 195);
  const three = build(3, [1,2,3,4,5,6,7,8,23,24,25,26,27,28,29], 193);
  const result = compareBenchBoostBuilds([one, two, three]);
  assert.deepEqual(result.all_shared_player_ids, [1,2,3,4,5,6,7,8]);
  assert.equal(result.all_shared_count, 8);
  assert.equal(result.winner_chip_gw, 2);
  assert.equal(result.margin_to_second, 2);
  for (const unique of result.unique_by_chip_gw) {
    assert.equal(unique.player_ids.length, 7);
    assert.ok(unique.player_ids.every((id) => !result.all_shared_player_ids.includes(id)));
  }
  assert.equal(result.pairwise.length, 3);
  assert.ok(result.pairwise.every((row) => row.shared_count === 8 && row.identical === false));
});

test("duplicate-safe names are case-insensitive", () => {
  const used = ["Granite Pulse", "granite pulse (2)"];
  assert.equal(nextAvailablePlanName("granite pulse", used), "granite pulse (3)");
});

test("saved plan verification catches wrong payloads", () => {
  const expected = planRowFromBenchBoostBuild(
    build(2, [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], 195),
    "iron meadow",
  );
  assert.equal(verifySavedPlan(expected, expected).ok, true);
  const wrong = structuredClone(expected);
  wrong.base[0].fpl_id = 999;
  assert.equal(verifySavedPlan(wrong, expected).ok, false);
});
