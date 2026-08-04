import test from "node:test";
import assert from "node:assert/strict";
import { optimiseOwnedSquadRange } from "../lib/squad-range.mjs";

const positions = [
  ["GKP", 2], ["DEF", 5], ["MID", 5], ["FWD", 3],
];
const players = [];
let id = 1;
for (const [position, count] of positions) {
  for (let index = 0; index < count; index += 1) {
    players.push({
      fpl_id: id,
      id,
      position,
      team_id: id,
      team: `T${id}`,
      web_name: `${position}${index + 1}`,
      price: 4.5,
      starting: id <= 11,
    });
    id += 1;
  }
}

const scoreForGw = (player, gw) => {
  const base = 1 + (player.fpl_id % 5);
  if (gw === 1 && player.web_name === "FWD1") return 15;
  if (gw === 2 && player.web_name === "MID5") return 18;
  if (gw === 3 && player.web_name === "DEF5") return 20;
  return base;
};

test("owned-squad range optimisation keeps the same 15 but permits different weekly XI and captains", () => {
  const result = optimiseOwnedSquadRange({ players, structure: "3-4-3", gwFrom: 1, gwTo: 3, scoreForGw });
  assert.equal(result.ok, true);
  assert.equal(result.weekly.length, 3);
  for (const week of result.weekly) {
    assert.equal(week.starters.length, 11);
    assert.equal(week.bench.length, 4);
    assert.equal(new Set([...week.starters, ...week.bench].map((player) => player.fpl_id)).size, 15);
  }
  assert.notEqual(result.weekly[0].captain, result.weekly[1].captain);
  assert.notDeepEqual(result.weekly[0].starters.map((player) => player.fpl_id), result.weekly[2].starters.map((player) => player.fpl_id));
});

test("chips and transfer hits apply only to their assigned gameweek", () => {
  const result = optimiseOwnedSquadRange({
    players,
    structure: "3-4-3",
    gwFrom: 1,
    gwTo: 3,
    scoreForGw,
    chipForGw: (gw) => gw === 1 ? "benchboost" : gw === 2 ? "triplecaptain" : gw === 3 ? "wildcard" : null,
    transferHitForGw: (gw) => gw === 3 ? 8 : 0,
  });
  assert.equal(result.ok, true);
  assert.ok(result.weekly[0].bench_boost_bonus > 0);
  assert.equal(result.weekly[1].captain_multiplier, 3);
  assert.equal(result.weekly[2].requested_transfer_hit, 8);
  assert.equal(result.weekly[2].transfer_hit, 0);
  assert.equal(result.weekly[2].wildcard_saving, 8);
  assert.equal(result.weekly[0].chip, "benchboost");
  assert.equal(result.weekly[1].chip, "triplecaptain");
  assert.equal(result.weekly[2].chip, "wildcard");
});

test("range totals equal the sum of weekly components", () => {
  const result = optimiseOwnedSquadRange({ players, structure: "3-4-3", gwFrom: 1, gwTo: 3, scoreForGw });
  assert.equal(result.ok, true);
  assert.equal(result.total.net_xpts, result.weekly.reduce((sum, week) => sum + week.net_xpts, 0));
  assert.equal(result.total.captain_bonus, result.weekly.reduce((sum, week) => sum + week.captain_bonus, 0));
});

test("a range evaluator rejects incomplete squads rather than inventing players", () => {
  const result = optimiseOwnedSquadRange({ players: players.slice(0, 14), gwFrom: 1, gwTo: 1, scoreForGw });
  assert.equal(result.ok, false);
  assert.match(result.error, /15-player squad/);
});
