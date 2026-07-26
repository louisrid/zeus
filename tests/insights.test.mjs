import test from "node:test";
import assert from "node:assert/strict";
import { premiumsWithoutPenalties, mispriced, ownedButNotRated, swingTargets, riskyButOwned, buildInsights } from "../lib/insights.mjs";
import { buildXPrice } from "../lib/xprice.mjs";

const mk = (id, o = {}) => ({ fpl_id: id, web_name: "p" + id, position: "MID", team: "ARS",
  price: 6, own: 10, score: 5, status: "a", chance_of_playing: null, news: null, ...o });
const scoreOf = (p) => p.score;

test("a premium not on penalties is surfaced, a cheap player is not", () => {
  const pool = [mk(1, { price: 11, position: "FWD" }), mk(2, { price: 5, position: "FWD" })];
  const out = premiumsWithoutPenalties(pool, []);
  assert.equal(out.length, 1);
  assert.equal(out[0].player.fpl_id, 1);
  assert.match(out[0].headline, /not on penalties/);
});

test("a known penalty taker is not flagged", () => {
  const pool = [mk(1, { price: 11, position: "FWD" })];
  assert.equal(premiumsWithoutPenalties(pool, [1]).length, 0);
});

test("mispricing reports both directions with the figures behind it", () => {
  const pool = Array.from({ length: 10 }, (_, i) => mk(i + 1, { price: 5 + i, score: (5 + i) * 0.8 }));
  pool.push(mk(99, { price: 5, score: 14 }), mk(98, { price: 13, score: 1 }));
  const x = buildXPrice(pool, scoreOf, () => "archive");
  const out = mispriced(pool, x);
  assert.ok(out.some((o) => o.kind === "underpriced" && o.player.fpl_id === 99), "the cheap over-performer must surface");
  assert.ok(out.some((o) => o.kind === "overpriced" && o.player.fpl_id === 98), "the expensive under-performer must surface");
  assert.match(out[0].detail, /rank like a/);
});

test("a heavily owned player below his position midpoint is surfaced", () => {
  const pool = [mk(1, { own: 55, score: 1 }), mk(2, { own: 5, score: 9 }), mk(3, { own: 5, score: 8 }), mk(4, { own: 5, score: 7 })];
  const out = ownedButNotRated(pool, scoreOf);
  assert.equal(out.length, 1);
  assert.equal(out[0].player.fpl_id, 1);
});

test("a flagged player nobody owns is not surfaced, a flagged player the field owns is", () => {
  const pool = [mk(1, { own: 40, status: "i", news: "Knee" }), mk(2, { own: 2, status: "i" })];
  const out = riskyButOwned(pool);
  assert.equal(out.length, 1);
  assert.equal(out[0].detail, "Knee");
});

test("fixture swings name the players to own, not just the clubs", () => {
  const swings = { easing: [{ team: "ARS", avg: 32 }], brutal: [] };
  const pool = [mk(1, { team: "ARS", score: 9 }), mk(2, { team: "ARS", score: 3 }), mk(3, { team: "MCI", score: 9 })];
  const out = swingTargets(swings, pool, scoreOf);
  assert.equal(out.length, 1);
  assert.equal(out[0].team, "ARS");
  assert.equal(out[0].players[0].fpl_id, 1, "best first");
  assert.ok(!out[0].players.some((p) => p.team === "MCI"), "must not cross clubs");
});

test("absent inputs give nothing rather than a hedge", () => {
  assert.deepEqual(premiumsWithoutPenalties(null, null), []);
  assert.deepEqual(mispriced(null, null), []);
  assert.deepEqual(swingTargets(null, null, null), []);
  const b = buildInsights({});
  assert.deepEqual(b.insights, []);
  assert.deepEqual(b.swingTargets, []);
});
