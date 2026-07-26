import test from "node:test";
import assert from "node:assert/strict";
import { buildXPrice, biggestGaps } from "../lib/xprice.mjs";

const mk = (id, position, price, score) => ({ fpl_id: id, position, price, score, web_name: "p" + id });
const scoreOf = (p) => p.score;
// Ten midfielders, output proportional to price, so the market rate is exactly readable.
const fair = Array.from({ length: 10 }, (_, i) => mk(i + 1, "MID", 5 + i, (5 + i) * 0.8));

test("a perfectly priced market values everyone at what they cost", () => {
  const x = buildXPrice(fair, scoreOf);
  for (const p of fair) {
    const r = x.of(p);
    assert.ok(Math.abs(r.xprice - p.price) < 0.15, `${p.web_name} priced ${p.price}, X£ ${r.xprice}`);
    assert.equal(r.verdict, "fair");
  }
});

test("an over-performer for his price reads as under-priced", () => {
  const pool = [...fair, mk(99, "MID", 6, 12)];   // twice the output of players at his price
  const x = buildXPrice(pool, scoreOf);
  const r = x.of(pool.find((p) => p.fpl_id === 99));
  assert.ok(r.xprice > 6, `X£ ${r.xprice} should exceed the 6.0 he costs`);
  assert.equal(r.verdict, "under");
  assert.ok(r.gap > 0);
});

test("a player returning nothing for a high price reads as over-priced", () => {
  const pool = [...fair, mk(98, "MID", 13, 1)];
  const x = buildXPrice(pool, scoreOf);
  const r = x.of(pool.find((p) => p.fpl_id === 98));
  assert.ok(r.xprice < 13);
  assert.equal(r.verdict, "over");
});

test("a defender out-scoring a forward at the same price reads as the better buy", () => {
  // This is the whole reason the rate is league-wide. A per-position rate would call both fair.
  const pool = [
    ...Array.from({ length: 10 }, (_, i) => mk(i + 1, "DEF", 5 + i * 0.5, (5 + i * 0.5) * 0.8)),
    ...Array.from({ length: 10 }, (_, i) => mk(i + 20, "FWD", 5 + i * 0.5, (5 + i * 0.5) * 0.8)),
  ];
  // Same price, defender scores more.
  pool.push(mk(90, "DEF", 6, 9), mk(91, "FWD", 6, 4));
  const x = buildXPrice(pool, scoreOf);
  const d = x.of(pool.find((p) => p.fpl_id === 90));
  const f = x.of(pool.find((p) => p.fpl_id === 91));
  assert.ok(d.xprice > f.xprice, `defender X£ ${d.xprice} must exceed forward X£ ${f.xprice} at the same price`);
  assert.equal(d.verdict, "under");
  assert.equal(f.verdict, "over");
});

test("the within-position read is kept for filling a specific slot", () => {
  const pool = [
    ...Array.from({ length: 10 }, (_, i) => mk(i + 1, "DEF", 5 + i * 0.5, (5 + i * 0.5) * 0.6)),
    ...Array.from({ length: 10 }, (_, i) => mk(i + 20, "FWD", 5 + i * 0.5, (5 + i * 0.5) * 1.2)),
  ];
  const x = buildXPrice(pool, scoreOf);
  const r = x.of(pool[0]);
  assert.ok(typeof r.withinPosition === "number", "the per-position figure must still be available");
  assert.ok(typeof r.withinPositionGap === "number");
  // Defenders score less per pound here, so a defender's league X£ sits below his within-position X£.
  assert.ok(r.xprice < r.withinPosition, `league ${r.xprice} should be below within-position ${r.withinPosition}`);
});

test("one league rate does not collapse the cheap list onto one position", () => {
  // Points per million by position sit within 20% of each other in the real data, so a single rate
  // still surfaces value in every position rather than only the best-value one.
  const pool = [];
  let id = 1;
  for (const [pos, mult] of [["GKP", 0.78], ["DEF", 0.89], ["MID", 0.96], ["FWD", 0.89]]) {
    for (let i = 0; i < 10; i++) pool.push(mk(id++, pos, 5 + i * 0.5, (5 + i * 0.5) * mult));
  }
  // one clear bargain in each position
  const bargains = [];
  for (const pos of ["GKP", "DEF", "MID", "FWD"]) { const b = mk(id++, pos, 5, 8); pool.push(b); bargains.push(b); }
  const x = buildXPrice(pool, scoreOf);
  for (const b of bargains) assert.equal(x.of(b).verdict, "under", `${b.position} bargain must still surface`);
});

test("X£ never leaves the range the game actually issues", () => {
  const pool = [...fair, mk(97, "MID", 5, 500)];
  const x = buildXPrice(pool, scoreOf);
  assert.ok(x.of(pool.find((p) => p.fpl_id === 97)).xprice <= 16.0);
  const pool2 = [...fair, mk(96, "MID", 5, 0)];
  const x2 = buildXPrice(pool2, scoreOf);
  assert.ok(x2.of(pool2.find((p) => p.fpl_id === 96)).xprice >= 3.8);
});

test("a market too thin to read gives null rather than a guess", () => {
  assert.equal(buildXPrice([mk(1, "MID", 5, 4)], scoreOf), null);
  assert.equal(buildXPrice([], scoreOf), null);
  assert.equal(buildXPrice(null, scoreOf), null);
});

test("an unscoreable player gives null, never a zero", () => {
  const x = buildXPrice(fair, scoreOf);
  assert.equal(x.of({ position: "MID", price: 0 }), null);
  assert.equal(x.of({ position: "GKP", price: 5 }), null, "no rate for a position absent from the pool");
});

test("biggest gaps ranks the clearest mispricings", () => {
  const pool = [...fair, mk(99, "MID", 5, 14), mk(98, "MID", 6, 11)];
  const x = buildXPrice(pool, scoreOf);
  const under = biggestGaps(pool, x, { direction: "under", limit: 2 });
  assert.equal(under.length, 2);
  assert.equal(under[0].p.fpl_id, 99, "the largest gap comes first");
});
