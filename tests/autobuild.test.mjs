import test from "node:test";
import assert from "node:assert/strict";
import { bestXI } from "../lib/solver/autobuild.mjs";

// A pool big enough to be legal: 4 GK, 8 DEF, 8 MID, 5 FWD across many clubs.
const pool = [];
let id = 1;
const add = (position, price, xp, team) => pool.push({ fpl_id: id++, position, price, xp, team_id: team });
[5.5, 5.0, 4.0, 4.0].forEach((pr, i) => add("GKP", pr, 4 - i, 20 + i));
[6.0, 6.0, 5.5, 5.0, 4.5, 4.0, 4.0, 4.0].forEach((pr, i) => add("DEF", pr, 5 - i * 0.4, i));
[13.0, 8.0, 7.5, 6.5, 6.0, 5.0, 4.5, 4.5].forEach((pr, i) => add("MID", pr, 7 - i * 0.5, 8 + (i % 6)));
[15.5, 9.0, 7.5, 4.5, 4.5].forEach((pr, i) => add("FWD", pr, 8 - i, 14 + i));
const xpOf = (p) => p.xp;

test("the built squad is legal: 15 players, budget, quotas, three per club", () => {
  const r = bestXI({ pool, xpOf });
  assert.ok(r, "a build must exist for a legal pool");
  const all = [...r.xi, ...r.bench];
  assert.equal(all.length, 15);
  assert.ok(r.cost <= 100, `cost must respect the budget, got ${r.cost}`);
  const quotas = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
  for (const pos of Object.keys(quotas)) {
    assert.equal(all.filter((p) => p.position === pos).length, quotas[pos], pos);
  }
  const clubs = {};
  for (const p of all) { clubs[p.team_id] = (clubs[p.team_id] || 0) + 1; assert.ok(clubs[p.team_id] <= 3); }
  assert.equal(r.xi.length, 11);
});

test("locks are seated in the eleven, always", () => {
  const cheapDef = pool.find((p) => p.position === "DEF" && p.price === 4.0);
  const r = bestXI({ pool, xpOf, locks: [cheapDef.fpl_id] });
  assert.ok(r.xi.some((p) => p.fpl_id === cheapDef.fpl_id),
    "a locked player must start even when better options exist");
});

test("the bench is cheap, because bench points are points you chose not to field", () => {
  const r = bestXI({ pool, xpOf });
  const benchCost = r.bench.reduce((a, p) => a + p.price, 0);
  assert.ok(benchCost <= 17.5, `bench must be near the floor, got ${benchCost}`);
});

test("a bigger horizon changes the pick when the xP function changes", () => {
  const oneGw = bestXI({ pool, xpOf });
  // Over five gameweeks a mid-priced player overtakes the premium.
  const flipped = (p) => (p.price === 8.0 && p.position === "MID" ? 40 : p.xp);
  const fiveGw = bestXI({ pool, xpOf: flipped });
  assert.ok(fiveGw.xi.some((p) => p.price === 8.0 && p.position === "MID"));
  assert.ok(fiveGw.xp !== oneGw.xp);
});

test("an impossible pool returns null rather than an illegal squad", () => {
  assert.equal(bestXI({ pool: pool.slice(0, 6), xpOf }), null);
});

test("starters are flagged, or the squad model benches all fifteen", () => {
  // The squad model reads p.starting. The solver returned plain objects, so every player it picked
  // landed on the bench and the pitch stayed empty.
  const r = bestXI({ pool, xpOf });
  assert.equal(r.xi.filter((p) => p.starting === true).length, 11, "all eleven must be flagged starting");
  assert.equal(r.bench.filter((p) => p.starting === false).length, 4, "all four must be flagged benched");
});

test("a player who does not start is never fielded, but may sit on the bench", () => {
  // A cheap squad filler who never plays was appearing in the eleven because the budget repair kept
  // reaching for him.
  const neverPlays = pool.find((p) => p.position === "MID" && p.price === 4.5);
  const startProbOf = (p) => (p.fpl_id === neverPlays.fpl_id ? 0.04 : 0.9);
  const r = bestXI({ pool, xpOf, startProbOf });
  assert.ok(!r.xi.some((p) => p.fpl_id === neverPlays.fpl_id), "he must not start");

  // Unless Louis locks him, in which case the model does not get a vote.
  const locked = bestXI({ pool, xpOf, startProbOf, locks: [neverPlays.fpl_id] });
  assert.ok(locked.xi.some((p) => p.fpl_id === neverPlays.fpl_id), "a lock always starts");
});

test("a longer horizon changes the squad, not just the label", () => {
  // xpOf is called per player; a horizon that sums five fixtures must produce different totals from
  // one fixture, or the stepper is decoration.
  const oneGw = bestXI({ pool, xpOf });
  const fiveGw = bestXI({ pool, xpOf: (p) => p.xp * (p.position === "DEF" ? 9 : 3) });
  assert.notEqual(oneGw.xp, fiveGw.xp);
  assert.notEqual(oneGw.formation, fiveGw.formation, "reweighting the positions must move the shape");
});
