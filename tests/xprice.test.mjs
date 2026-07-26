import test from "node:test";
import assert from "node:assert/strict";
import { buildXPrice, biggestGaps } from "../lib/xprice.mjs";

// The exact thirteen rows from the live screen that exposed the old version, with season points as
// the output. This is the sanity table from docs/xp-xprice-roadmap.md section 8, now enforced.
const ROWS = [
  ["Haaland", "FWD", 15.5, 239], ["B.Fernandes", "MID", 12.0, 235], ["Gabriel", "DEF", 8.0, 209],
  ["Rice", "MID", 7.5, 184], ["Guehi", "DEF", 6.0, 179], ["JoaoPedro", "FWD", 7.5, 177],
  ["Rogers", "MID", 7.5, 169], ["Raya", "GKP", 6.0, 162], ["Szoboszlai", "MID", 7.0, 160],
  ["OReilly", "DEF", 6.5, 160], ["Porro", "DEF", 5.5, 117], ["Dubravka", "GKP", 4.0, 96],
  ["Brobbey", "FWD", 6.0, 92],
];
const pool = ROWS.map(([name, position, price, pts], i) => ({ fpl_id: i + 1, web_name: name, position, price, pts }));
const scoreOf = (p) => p.pts;
const sourceOf = () => "archive";

test("fair prices are drawn from the real price ladder, so no clamp is possible", () => {
  const x = buildXPrice(pool, scoreOf, sourceOf);
  const fairs = pool.map((p) => x.of(p).xprice).sort((a, b) => b - a);
  const prices = pool.map((p) => p.price).sort((a, b) => b - a);
  assert.deepEqual(fairs, prices, "the fair-price multiset must equal the real price multiset");
});

test("Haaland and Guehi are far apart, which is where the old version failed", () => {
  const x = buildXPrice(pool, scoreOf, sourceOf);
  const h = x.of(pool[0]), g = x.of(pool.find((p) => p.web_name === "Guehi"));
  assert.equal(h.xprice, 15.5, "the top output takes the top rung");
  assert.equal(g.xprice, 7.5, "Guehi's output ranks fifth, which is the 7.5 rung");
  assert.ok(Math.abs(h.xprice - g.xprice) >= 8, "the design test from the teardown");
});

test("the gap reads as the roadmap specced: Guehi +1.5, Brobbey -2.0, Dubravka +1.5", () => {
  const x = buildXPrice(pool, scoreOf, sourceOf);
  assert.equal(x.of(pool.find((p) => p.web_name === "Guehi")).gap, 1.5);
  assert.equal(x.of(pool.find((p) => p.web_name === "Brobbey")).gap, -2);
  assert.equal(x.of(pool.find((p) => p.web_name === "Dubravka")).gap, 1.5);
  assert.equal(x.of(pool[0]).gap, 0, "a correctly priced top player reads 0");
});

test("X£ is not a linear transform of output, which is the bug this replaces", () => {
  const x = buildXPrice(pool, scoreOf, sourceOf);
  // Under the old method, equal output steps produced equal X£ steps. On a ladder they do not,
  // because the rungs are real prices with irregular spacing.
  const sorted = [...pool].sort((a, b) => scoreOf(b) - scoreOf(a)).map((p) => x.of(p).xprice);
  const steps = new Set();
  for (let i = 1; i < sorted.length; i++) steps.add(Math.round((sorted[i - 1] - sorted[i]) * 10) / 10);
  assert.ok(steps.size > 1, `uniform steps mean a constant divider is back: ${[...steps].join(",")}`);
});

test("an unscoreable player is No data, never a number", () => {
  const withGhost = [...pool, { fpl_id: 99, web_name: "Ghost", position: "FWD", price: 4.5, pts: 0 }];
  const x = buildXPrice(withGhost, scoreOf, (p) => (p.fpl_id === 99 ? "none" : "archive"));
  assert.equal(x.of(withGhost[13]), null, "sourceOf none must be absent from the ladder");
  assert.equal(x.ranked, 13, "and must not occupy a rung someone else should have");
});

test("any legal fifteen valued at fair prices sums to a real figure", () => {
  const x = buildXPrice(pool, scoreOf, sourceOf);
  const total = pool.map((p) => x.of(p).xprice).reduce((a, b) => a + b, 0);
  const real = pool.map((p) => p.price).reduce((a, b) => a + b, 0);
  assert.equal(total, real, "budget consistency is by construction, not by luck");
});

test("a market too thin to read gives null rather than a guess", () => {
  assert.equal(buildXPrice(pool.slice(0, 5), scoreOf, sourceOf), null);
  assert.equal(buildXPrice([], scoreOf, sourceOf), null);
});

test("biggest gaps leads with the clearest mispricing", () => {
  const x = buildXPrice(pool, scoreOf, sourceOf);
  const under = biggestGaps(pool, x, { direction: "under", limit: 3 });
  assert.ok(under.length >= 2);
  assert.ok(under[0].x.gap >= under[1].x.gap, "largest first");
});
