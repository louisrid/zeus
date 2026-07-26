import test from "node:test";
import assert from "node:assert/strict";
import { effectiveOwnership, pool } from "../jobs/rival_pull.mjs";

const squad = (picks, chip = null) => ({ picks, chip });
const pick = (element, { captain = false, benched = false } = {}) =>
  ({ element, is_captain: captain, multiplier: benched ? 0 : captain ? 2 : 1 });

test("effective ownership counts the armband twice, because points double (B-09)", () => {
  const eo = effectiveOwnership([
    squad([pick(1, { captain: true }), pick(2)]),
    squad([pick(1), pick(2)]),
  ]);
  assert.equal(eo.get(1), 1.5, "owned by both, captained by one: (2 + 1) / 2");
  assert.equal(eo.get(2), 1.0);
});

test("benched players are not effectively owned", () => {
  const eo = effectiveOwnership([squad([pick(1), pick(2, { benched: true })])]);
  assert.equal(eo.get(1), 1);
  assert.equal(eo.get(2), undefined, "a benched player scores nothing, so he is not effective ownership");
});

test("a triple captain counts as three, matching the multiplier", () => {
  const eo = effectiveOwnership([squad([pick(1, { captain: true })], "3xc")]);
  assert.equal(eo.get(1), 3, "one manager, tripled: (1 + 2) / 1");
});

test("no squads gives an empty map rather than dividing by zero", () => {
  assert.equal(effectiveOwnership([]).size, 0);
});

test("the request pool survives individual failures", async () => {
  const out = await pool([1, 2, 3, 4, 5], 2, async (n) => {
    if (n === 3) throw new Error("one bad entry");
    return n * 2;
  });
  assert.equal(out.length, 4, "four of five succeed and the run continues");
  assert.deepEqual(out.sort((a, b) => a - b), [2, 4, 8, 10]);
});
