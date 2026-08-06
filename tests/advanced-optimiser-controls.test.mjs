import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  reconcilePlayerIdsAndNames,
  resolvePlayerReferences,
} from "../lib/server/player-name-resolution.mjs";
import { findAlwaysBenchedReplacementOptions } from "../lib/benchboost-replacements.mjs";
import { renderBenchBoostReport } from "../lib/benchboost-comparison.mjs";

test("exact optimiser supports bank reserve, goalkeeper price cap and deterministic bench order", () => {
  const source = readFileSync("lib/server/exact-range-optimiser.mjs", "utf8");
  assert.match(source, /minimumMoneyInBank = 0/);
  assert.match(source, /goalkeeperMaxPrice = null/);
  assert.match(source, /goalkeepers_at_or_below_price/);
  assert.match(source, /const spendableBudget = totalBudget - bankMinimum/);
  assert.match(source, /rankBenchForWeek/);
  assert.match(source, /backup_gkp_first_then_outfield_descending_xpts/);
});

test("Bench Boost route exposes all advanced controls and backend name resolution", () => {
  const source = readFileSync("app/api/benchboost-compare/route.js", "utf8");
  assert.match(source, /minimum_money_in_bank/);
  assert.match(source, /goalkeeper_max_price/);
  assert.match(source, /minimum_goalkeepers_at_or_below_price/);
  assert.match(source, /excluded_player_names/);
  assert.match(source, /reconcilePlayerIdsAndNames/);
  assert.match(source, /suggest_always_benched_replacements/);
  assert.match(source, /replacement_max_xpts_drop/);
  assert.match(source, /backup goalkeeper is not first on the bench/);
  assert.match(source, /outfield bench is not ordered highest xPTS to lowest/);
});

test("name resolution rejects ambiguity and ID/name mismatches", () => {
  const players = [
    { fpl_id: 10, web_name: "Anderson", first_name: "Elliot", second_name: "Anderson", team: "NFO", team_id: 1, position: "MID", price: 5.5 },
    { fpl_id: 11, web_name: "Anderson", first_name: "Lucas", second_name: "Anderson", team: "FUL", team_id: 2, position: "DEF", price: 4.5 },
    { fpl_id: 12, web_name: "O'Reilly", first_name: "Nico", second_name: "O'Reilly", team: "MCI", team_id: 3, position: "MID", price: 5.0 },
  ];

  const ambiguous = resolvePlayerReferences(players, ["Anderson"], { label: "excluded player" });
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.errors[0], /Ambiguous excluded player Anderson/);

  const resolved = resolvePlayerReferences(players, ["Anderson (NFO)", "O'Reilly"], { label: "excluded player" });
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.ids, [10, 12]);

  const mismatch = reconcilePlayerIdsAndNames({
    players,
    ids: [11],
    names: [{ name: "Anderson", team: "NFO" }],
    label: "excluded player",
  });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.error, /do not match/);
});

test("always-benched replacement options preserve bench floor and rank comparable cheaper players", () => {
  const incumbent = { fpl_id: 1, web_name: "Benchman", team: "AAA", team_id: 1, position: "DEF", price: 5.0 };
  const players = [incumbent, ...Array.from({ length: 14 }, (_, index) => ({
    fpl_id: index + 20,
    web_name: `P${index}`,
    team: `T${index + 2}`,
    team_id: index + 2,
    position: index < 2 ? "GKP" : (index < 7 ? "DEF" : (index < 12 ? "MID" : "FWD")),
    price: 5,
  }))];
  const starterIds = players.slice(1, 12).map((player) => player.fpl_id);
  const bench = [players[12], players[13], players[14], incumbent];
  const build = {
    players,
    total: { net_xpts: 190 },
    weekly: [1, 2, 3].map((gw) => ({
      gw,
      chip: gw === 2 ? "benchboost" : null,
      starters: players.filter((player) => starterIds.includes(player.fpl_id)),
      bench,
      bench_cost: 18,
    })),
  };
  const pool = [
    ...players,
    { fpl_id: 100, web_name: "Comparable", team: "BBB", team_id: 30, position: "DEF", price: 4.5 },
    { fpl_id: 101, web_name: "TooLow", team: "CCC", team_id: 31, position: "DEF", price: 2.5 },
    { fpl_id: 102, web_name: "TooWeak", team: "DDD", team_id: 32, position: "DEF", price: 4.0 },
  ];
  const scores = new Map([
    ["1:2", 4.0],
    ["100:2", 3.5],
    ["101:2", 3.8],
    ["102:2", 1.0],
  ]);
  const result = findAlwaysBenchedReplacementOptions({
    build,
    pool,
    scoreForGw: (player, gw) => scores.get(`${player.fpl_id}:${gw}`) || 0,
    minimumBenchSpend: 16.5,
    optionCount: 3,
    maximumComparableXptsDrop: 1,
  });
  const row = result.find((item) => item.incumbent.fpl_id === 1);
  assert.ok(row);
  assert.deepEqual(row.options.map((option) => option.player.fpl_id), [100]);
  assert.equal(row.options[0].budget_saved, 0.5);
  assert.equal(row.options[0].xpts_change, -0.5);
});

test("report includes budget, bank, goalkeeper proof, bench order and replacement options", () => {
  const build = {
    chip_gw: 1,
    players: [],
    weekly: [],
    total: { net_xpts: 100, bench_boost_bonus: 10 },
    objective: { gw_from: 1, gw_to: 3, weekly_net_xpts_sum: 100, arithmetic_verified: true },
    solver: { engine: "HiGHS", version: "1.14.2", status: "OPTIMAL", mip_gap: 0, optimality_proven: true },
    squad_cost: 99.5,
    money_in_bank: 0.5,
    constraints: {
      total_budget: 100,
      minimum_money_in_bank: 0.5,
      maximum_squad_spend: 99.5,
      minimum_bench_spend: 16.5,
      minimum_bench_spend_enabled: true,
      goalkeeper_price_constraint_enabled: true,
      goalkeeper_max_price: 4.5,
      minimum_goalkeepers_at_or_below_price: 1,
      goalkeepers_at_or_below_price: [{ web_name: "Cheap GK" }],
    },
    always_benched_replacement_options: [{
      incumbent: { web_name: "Benchman", position: "DEF", price: 5 },
      maximum_comparable_xpts_drop: 1,
      options: [{
        player: { web_name: "Replacement", team: "AAA", price: 4.5 },
        budget_saved: 0.5,
        replacement_bench_boost_xpts: 3,
        xpts_change: -0.5,
        projected_new_range_net_xpts: 99.5,
      }],
    }],
  };
  const report = renderBenchBoostReport({
    gwFrom: 1,
    gwTo: 3,
    builds: [build],
    comparison: { ranking: [{ chip_gw: 1, total_net_xpts: 100, bench_boost_bonus: 10, squad_cost: 99.5, money_in_bank: 0.5, arithmetic_verified: true }], winner_chip_gw: 1, winner_net_xpts: 100 },
  });
  assert.match(report, /Minimum money in bank: £0\.5m/);
  assert.match(report, /Goalkeeper price control/);
  assert.match(report, /backup goalkeeper first/);
  assert.match(report, /CHEAPER OPTIONS FOR PLAYERS NEVER STARTED/);
  assert.match(report, /Replacement/);
});
