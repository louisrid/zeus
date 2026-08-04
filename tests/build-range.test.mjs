import test from "node:test";
import assert from "node:assert/strict";
import { buildSquadForRange } from "../lib/solver/build-range.mjs";

const pool = [];
let id = 1;
for (const [position, count, basePrice] of [
  ["GKP", 4, 4.0],
  ["DEF", 9, 4.0],
  ["MID", 9, 4.5],
  ["FWD", 6, 4.5],
]) {
  for (let index = 0; index < count; index += 1) {
    pool.push({
      id,
      fpl_id: id,
      web_name: `${position}${index + 1}`,
      position,
      team_id: (id % 10) + 1,
      team: `T${(id % 10) + 1}`,
      price: basePrice,
      status: "a",
    });
    id += 1;
  }
}
const byId = new Map(pool.map((player) => [player.fpl_id, player]));
const scoreForGw = (player, gw) => {
  const base = (Number(player.fpl_id) % 13) + 1;
  return gw === 1 ? base : 14 - base;
};
const cost = (rows) => rows.reduce((sum, row) => sum + Number(byId.get(Number(row.fpl_id))?.price || 0), 0);

test("the shared Builder solver evaluates chips and weekly roles across the exact range", () => {
  const result = buildSquadForRange({
    pool,
    scoreForGw,
    gwFrom: 1,
    gwTo: 2,
    chipForGw: (gw) => gw === 1 ? "benchboost" : "triplecaptain",
    budget: 100,
    benchBudget: 17,
    maxPerClub: 3,
    startProbOf: () => 1,
    maxSwapPasses: 3,
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.xi.length + result.bench.length, 15);
  assert.equal(result.weekly.length, 2);
  assert.equal(result.weekly[0].chip, "benchboost");
  assert.ok(result.weekly[0].bench_boost_bonus > 0);
  assert.equal(result.weekly[1].chip, "triplecaptain");
  assert.equal(result.weekly[1].captain_multiplier, 3);
  assert.equal(result.total.net_xpts, result.weekly.reduce((sum, week) => sum + week.net_xpts, 0));
  for (const week of result.weekly) {
    assert.ok(cost(week.starters) <= 83 + 1e-9, `GW${week.gw} XI cost`);
    assert.ok(cost(week.bench) <= 17 + 1e-9, `GW${week.gw} bench cost`);
  }
});

test("locks, keeps, ignores and a formation lock survive the full range build", () => {
  const locked = pool.find((player) => player.position === "DEF").fpl_id;
  const kept = pool.find((player) => player.position === "MID").fpl_id;
  const ignored = [...pool].sort((a, b) => scoreForGw(b, 1) - scoreForGw(a, 1))[0].fpl_id;
  const result = buildSquadForRange({
    pool,
    scoreForGw,
    gwFrom: 1,
    gwTo: 2,
    locks: [locked],
    keep: [kept],
    ignores: [ignored],
    onlyFormation: "4-4-2",
    startProbOf: () => 1,
    maxSwapPasses: 2,
  });
  assert.equal(result.ok, true, result.error);
  const ids = new Set([...result.xi, ...result.bench].map((player) => player.fpl_id));
  assert.equal(ids.has(locked), true);
  assert.equal(ids.has(kept), true);
  if (ignored !== locked && ignored !== kept) assert.equal(ids.has(ignored), false);
  assert.ok(result.weekly.every((week) => week.formation === "4-4-2"));
  assert.ok(result.weekly.every((week) => week.starters.some((player) => player.fpl_id === locked)));
});

test("unsupported Builder ranges fail instead of shifting or approximating", () => {
  const result = buildSquadForRange({ pool, scoreForGw, gwFrom: 8, gwTo: 9 });
  assert.equal(result.ok, false);
  assert.match(result.error, /GW1-GW8/);
});
