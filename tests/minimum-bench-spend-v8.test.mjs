import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMinimumBenchSpend } from "../lib/minimum-bench-spend.mjs";
import { renderBenchBoostReport } from "../lib/benchboost-comparison.mjs";

test("preferred minimum field is parsed as an at-least floor", () => {
  assert.deepEqual(
    parseMinimumBenchSpend({ minimum_bench_spend: 16.5 }, { budget: 100, required: true }),
    { ok: true, value: 16.5, source: "minimum_bench_spend", rule: "at_least" },
  );
});

test("the shared non-destructive default is 16.5 and comparison omission still fails", () => {
  assert.equal(parseMinimumBenchSpend({}, { budget: 100 }).value, 16.5);
  assert.equal(parseMinimumBenchSpend({ bench_budget: 16.5 }, { budget: 100, required: true }).value, 16.5);
  const missing = parseMinimumBenchSpend({}, { budget: 100, required: true });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /required/);
});

test("conflicting aliases and invalid minima are rejected", () => {
  assert.equal(parseMinimumBenchSpend(
    { minimum_bench_spend: 16.5, bench_budget: 17 },
    { budget: 100, required: true },
  ).ok, false);
  assert.equal(parseMinimumBenchSpend(
    { minimum_bench_spend: 101 },
    { budget: 100, required: true },
  ).ok, false);
});

test("comparison cannot silently default before destructive persistence", () => {
  const source = readFileSync("app/api/benchboost-compare/route.js", "utf8");
  assert.match(source, /required: true/);
  assert.match(source, /minimum_bench_spend_enabled/);
  assert.match(source, /bench_spend_rule: "at_least"/);
  assert.match(source, /Nothing was saved or deleted/);
  assert.doesNotMatch(source, /body\?\.bench_budget \?\? 17/);
});

test("Builder has an explicit ON-OFF control and submits its applied value", () => {
  const source = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  assert.match(source, /React\.useState\(16\.5\)/);
  assert.match(source, /React\.useState\(true\)/);
  assert.match(source, /type="checkbox"/);
  assert.match(source, /checked=\{minimumBenchSpendEnabled\}/);
  assert.match(source, /minimum_bench_spend: appliedMinimumBenchSpend/);
  assert.match(source, /use no custom minimum bench spend/);
});

test("report visibly states whether the minimum control is ON or OFF", () => {
  const on = renderBenchBoostReport({
    gwFrom: 1, gwTo: 3,
    builds: [{
      chip_gw: 1, solver: { status: "OPTIMAL", mip_gap: 0 }, weekly: [],
      total: { net_xpts: 0 }, objective: { arithmetic_verified: true, gw_from: 1, gw_to: 3 },
      constraints: { minimum_bench_spend: 16.5, minimum_bench_spend_enabled: true },
      players: [],
    }],
  });
  assert.match(on, /control: ON at £16\.5m/);
  assert.match(on, /Spending more is allowed/i);

  const off = renderBenchBoostReport({
    gwFrom: 1, gwTo: 3,
    builds: [{
      chip_gw: 1, solver: { status: "OPTIMAL", mip_gap: 0 }, weekly: [],
      total: { net_xpts: 0 }, objective: { arithmetic_verified: true, gw_from: 1, gw_to: 3 },
      constraints: { minimum_bench_spend: 0, minimum_bench_spend_enabled: false },
      players: [],
    }],
  });
  assert.match(off, /control: OFF/);
  assert.match(off, /No custom minimum/);
});
