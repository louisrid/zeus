import test from "node:test";
import assert from "node:assert/strict";
import { renderBenchBoostReport } from "../lib/benchboost-comparison.mjs";

const positions = ["GKP", "GKP", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"];
const players = positions.map((position, index) => ({
  fpl_id: index + 1,
  web_name: `P${index + 1}`,
  team: `T${(index % 7) + 1}`,
  team_id: (index % 7) + 1,
  position,
  price: index < 2 ? 4.5 : 5.0,
}));

function makeWeek(gw, chip) {
  const starterIds = [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14];
  const starters = starterIds.map((id, index) => ({ ...players[id - 1], xpts: 8 - index / 10 }));
  const benchIds = [2, 7, 12, 15];
  const bench = benchIds.map((id, index) => ({ ...players[id - 1], xpts: 4 - index }));
  return {
    gw,
    chip,
    formation: "4-4-2",
    captain: 1,
    vice_captain: 3,
    xi_cost: 80,
    bench_cost: 20,
    bench_order: benchIds,
    bench_order_policy: "backup_gkp_first_then_outfield_descending_xpts",
    bench_boost_bonus: chip === "benchboost" ? 10 : 0,
    net_xpts: 65,
    starters,
    bench,
  };
}

function makeBuild(chipGw) {
  return {
    chip_gw: chipGw,
    players,
    weekly: [1, 2, 3].map((gw) => makeWeek(gw, gw === chipGw ? "benchboost" : null)),
    total: { net_xpts: 195, bench_boost_bonus: 10 },
    squad_cost: 100,
    money_in_bank: 0,
    solver: { engine: "HiGHS", version: "1.14.2", status: "OPTIMAL", mip_gap: 0, optimality_proven: true },
    objective: { gw_from: 1, gw_to: 3, weekly_net_xpts_sum: 195, arithmetic_verified: true },
    constraints: {
      total_budget: 100,
      minimum_money_in_bank: 0,
      maximum_money_in_bank: null,
      maximum_squad_spend: 100,
      minimum_bench_spend: 16.5,
      minimum_bench_spend_enabled: true,
      goalkeeper_price_constraint_enabled: true,
      goalkeeper_max_price: 4.5,
      minimum_goalkeepers_at_or_below_price: 1,
      goalkeepers_at_or_below_price: [players[0], players[1]],
    },
    always_benched_replacement_options: [],
  };
}

test("strict report shows separate squads then complete weekly lineups and proof", () => {
  const builds = [makeBuild(1), makeBuild(2)];
  const report = renderBenchBoostReport({
    gwFrom: 1,
    gwTo: 3,
    builds,
    excludedPlayers: [{ fpl_id: 99, web_name: "Excluded", team: "XXX" }],
    comparison: {
      ranking: [
        { chip_gw: 1, total_net_xpts: 195, bench_boost_bonus: 10, squad_cost: 100, money_in_bank: 0, arithmetic_verified: true },
        { chip_gw: 2, total_net_xpts: 195, bench_boost_bonus: 10, squad_cost: 100, money_in_bank: 0, arithmetic_verified: true },
      ],
      winner_chip_gw: 1,
      winner_net_xpts: 195,
      margin_to_second: 0,
      all_shared_count: 15,
      all_shared_players: players,
      unique_by_chip_gw: [],
      pairwise: [{ left_chip_gw: 1, right_chip_gw: 2, shared_count: 15, only_left_player_ids: [], only_right_player_ids: [], identical: true }],
    },
  });

  assert.match(report, /## HARD EXCLUSION PROOF/);
  assert.match(report, /## 15-MAN SQUADS/);
  assert.match(report, /### SQUAD A — BENCH BOOST GW1/);
  assert.match(report, /### SQUAD B — BENCH BOOST GW2/);
  assert.ok(report.indexOf("## 15-MAN SQUADS") < report.indexOf("## WEEKLY LINEUPS"));
  assert.match(report, /#### GW1 — BENCH BOOST/);
  assert.match(report, /#### GW2 — BENCH BOOST/);
  assert.match(report, /\| Bench GK \| P2 /);
  assert.match(report, /outfield xPTS descending yes/);
  assert.match(report, /Present in any returned squad/);
});
