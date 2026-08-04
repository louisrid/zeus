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

test("Bench Boost timing can reshape the complete 15 rather than preserving an anchor XI", () => {
  const synthetic = [];
  let nextId = 1000;
  const add = (position, price, team, scores) => synthetic.push({
    id: nextId,
    fpl_id: nextId++,
    web_name: `${position}-${nextId}`,
    position,
    team_id: team,
    team: `T${team}`,
    price,
    status: "a",
    scores,
  });
  for (let i = 0; i < 4; i += 1) add("GKP", 4.0 + i * 0.1, i + 1, [i === 0 ? 9 : 3, i === 1 ? 10 : 3, 3]);
  for (let i = 0; i < 10; i += 1) add("DEF", 4.0 + (i % 4) * 0.2, i + 5, [i < 5 ? 8 : 2, i >= 5 ? 8 : 2, 4]);
  for (let i = 0; i < 10; i += 1) add("MID", 4.5 + (i % 4) * 0.3, i + 15, [i < 5 ? 8 : 3, i >= 5 ? 8 : 3, 5]);
  for (let i = 0; i < 7; i += 1) add("FWD", 4.5 + (i % 3) * 0.3, i + 25, [i < 3 ? 8 : 3, i >= 3 ? 8 : 3, 5]);
  const score = (player, gw) => player.scores[gw - 1] || 0;
  const gw1 = buildSquadForRange({
    pool: synthetic,
    scoreForGw: score,
    gwFrom: 1,
    gwTo: 3,
    chipForGw: (gw) => gw === 1 ? "benchboost" : null,
    startProbOf: () => 1,
    maxSwapPasses: 8,
  });
  const gw2 = buildSquadForRange({
    pool: synthetic,
    scoreForGw: score,
    gwFrom: 1,
    gwTo: 3,
    chipForGw: (gw) => gw === 2 ? "benchboost" : null,
    startProbOf: () => 1,
    maxSwapPasses: 8,
  });
  assert.equal(gw1.ok, true, gw1.error);
  assert.equal(gw2.ok, true, gw2.error);
  const ids1 = [...gw1.xi, ...gw1.bench].map((player) => player.fpl_id).sort((a, b) => a - b);
  const ids2 = [...gw2.xi, ...gw2.bench].map((player) => player.fpl_id).sort((a, b) => a - b);
  assert.notDeepEqual(ids1, ids2, "different Bench Boost weeks should be allowed to select different complete squads");
});
