import test from "node:test";
import assert from "node:assert/strict";
import { buildVariants, variantDifferences, POSTURES } from "../lib/variants.mjs";

const mk = (id, own, score, price = 5) => ({ fpl_id: id, own, score, price, position: "MID" });
// Realistic: the most-owned players are also the best, which is why they are owned.
const pool = [mk(1, 80, 6.5), mk(2, 5, 5), mk(3, 50, 6), mk(4, 1, 5.5)];
const scoreOf = (p) => p.score;
// A stand-in solver: take the two highest by whatever objective it is handed.
const buildSquad = (objective) => ({ players: pool.slice().sort((a, b) => objective(b) - objective(a)).slice(0, 2) });

test("three postures are built, and only the ownership weight differs (B-16)", () => {
  const v = buildVariants({ pool, scoreOf, buildSquad });
  assert.equal(v.length, 3);
  assert.deepEqual(v.map((x) => x.key), ["template", "balanced", "differential"]);
  assert.ok(v[0].weight > 0 && v[1].weight === 0 && v[2].weight < 0);
});

test("the template posture picks higher-owned players than the differential one", () => {
  const v = buildVariants({ pool, scoreOf, buildSquad });
  const template = v.find((x) => x.key === "template");
  const differential = v.find((x) => x.key === "differential");
  assert.ok(template.meanOwnership > differential.meanOwnership,
    `template ${template.meanOwnership} should exceed differential ${differential.meanOwnership}`);
});

test("balanced ignores ownership entirely and picks on score alone", () => {
  const v = buildVariants({ pool, scoreOf, buildSquad }).find((x) => x.key === "balanced");
  const ids = v.squad.players.map((p) => p.fpl_id).sort();
  assert.deepEqual(ids, [1, 3], "the two highest scorers regardless of who owns them");
});

test("alignment is reported, never targeted", () => {
  const v = buildVariants({ pool, scoreOf, buildSquad });
  for (const x of v) {
    assert.equal(typeof x.meanOwnership, "number");
    assert.ok(!("targetAlignment" in x), "no target level of alignment may be invented");
  }
});

test("an empty pool gives no variants rather than empty squads", () => {
  assert.deepEqual(buildVariants({ pool: [], scoreOf, buildSquad }), []);
  assert.deepEqual(buildVariants({ pool: null, scoreOf, buildSquad }), []);
});

test("differences report what is unique to each variant", () => {
  const v = buildVariants({ pool, scoreOf, buildSquad });
  const d = variantDifferences(v);
  assert.equal(d.length, 3);
  for (const x of d) assert.ok(Array.isArray(x.unique));
  // Template and differential must diverge. Balanced can legitimately coincide with either,
  // because picking on score alone sometimes IS the template and sometimes is not.
  const t = d.find((x) => x.key === "template");
  const diff = d.find((x) => x.key === "differential");
  assert.ok(t.unique.length + diff.unique.length > 0, "template and differential must not be identical");
  const vt = v.find((x) => x.key === "template");
  const vd = v.find((x) => x.key === "differential");
  assert.notDeepEqual(
    vt.squad.players.map((p) => p.fpl_id).sort(),
    vd.squad.players.map((p) => p.fpl_id).sort(),
    "the two opposing postures must produce different squads");
});

test("spend and score are reported per variant", () => {
  const v = buildVariants({ pool, scoreOf, buildSquad });
  for (const x of v) {
    assert.equal(x.spend, 10, "two players at 5.0");
    assert.ok(x.score > 0);
  }
});
