// One product rule, one number.
//
// The Builder, the exact-squad route and the strict Bench Boost contract used 16.5 while the generic
// optimise route passed 17 of its own. The same request could therefore return two different squads
// depending on which endpoint it arrived at. This pins the value to a single exported constant and fails
// if any caller reintroduces a literal of its own.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_MINIMUM_BENCH_SPEND, parseMinimumBenchSpend } from "../lib/minimum-bench-spend.mjs";

const read = (p) => readFileSync(p, "utf8");

test("the default minimum bench spend is defined once", () => {
  assert.equal(DEFAULT_MINIMUM_BENCH_SPEND, 16.5);
  assert.equal(parseMinimumBenchSpend({}, { budget: 100 }).value, DEFAULT_MINIMUM_BENCH_SPEND);
  assert.equal(parseMinimumBenchSpend({}, { budget: 100 }).source, "default");
  assert.equal(parseMinimumBenchSpend({}, { budget: 100 }).rule, "at_least");
});

test("no caller carries a bench floor of its own", () => {
  for (const file of [
    "app/api/optimise/route.js",
    "app/api/exact-squad/route.js",
    "app/builder/BuilderClient.jsx",
  ]) {
    const src = read(file);
    assert.doesNotMatch(src, /benchBudget:\s*1[67](\.\d+)?\b/, `${file} hardcodes a bench floor`);
    assert.doesNotMatch(src, /bench_budget:\s*1[67](\.\d+)?\b/, `${file} hardcodes a bench floor`);
    assert.doesNotMatch(src, /budget\s*-\s*1[67]\b/, `${file} hardcodes a bench floor`);
    assert.match(src, /DEFAULT_MINIMUM_BENCH_SPEND/, `${file} must use the shared constant`);
  }
});

test("the floor is a minimum, not a target", () => {
  const supplied = parseMinimumBenchSpend({ minimum_bench_spend: 20 }, { budget: 100 });
  assert.equal(supplied.ok, true);
  assert.equal(supplied.value, 20, "an explicit request still wins");
  const off = parseMinimumBenchSpend({ minimum_bench_spend: 0 }, { budget: 100 });
  assert.equal(off.ok, true);
  assert.equal(off.value, 0, "and it can be switched off entirely");
  assert.equal(parseMinimumBenchSpend({ minimum_bench_spend: 101 }, { budget: 100 }).ok, false);
});
