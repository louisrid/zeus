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

test("legacy field remains accepted but an omitted comparison minimum fails", () => {
  assert.equal(
    parseMinimumBenchSpend({ bench_budget: 16.5 }, { budget: 100, required: true }).value,
    16.5,
  );
  const missing = parseMinimumBenchSpend({}, { budget: 100, required: true });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /required/);
  assert.match(missing.error, /floor/);
});

test("conflicting aliases and invalid minima are rejected", () => {
  assert.equal(
    parseMinimumBenchSpend(
      { minimum_bench_spend: 16.5, bench_budget: 17 },
      { budget: 100, required: true },
    ).ok,
    false,
  );
  assert.equal(
    parseMinimumBenchSpend({ minimum_bench_spend: 101 }, { budget: 100, required: true }).ok,
    false,
  );
});

test("comparison cannot silently default to 17 before destructive persistence", () => {
  const source = readFileSync("app/api/benchboost-compare/route.js", "utf8");
  assert.match(source, /required: true/);
  assert.match(source, /minimum_bench_spend/);
  assert.match(source, /bench_spend_rule: "at_least"/);
  assert.match(source, /Nothing was saved or deleted/);
  assert.doesNotMatch(source, /body\?\.bench_budget \?\? 17/);
  assert.doesNotMatch(source, /bench_budget: parsed\.benchBudget/);
});

test("Builder submits the minimum and explains that more spending is allowed", () => {
  const source = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  assert.match(source, /minimum_bench_spend: benchBudget/);
  assert.match(source, /MINIMUM BENCH SPEND/);
  assert.match(source, /spending more is allowed/);
  assert.doesNotMatch(source, /XI max/);
});

test("report calls the value a floor rather than a maximum", () => {
  const report = renderBenchBoostReport({
    gwFrom: 1,
    gwTo: 3,
    builds: [{
      chip_gw: 1,
      solver: { status: "OPTIMAL", mip_gap: 0 },
      weekly: [],
      total: { net_xpts: 0 },
      objective: { arithmetic_verified: true, gw_from: 1, gw_to: 3 },
      constraints: {
        minimum_bench_spend: 16.5,
        bench_spend_rule: "at_least",
        bench_spend_can_exceed_minimum: true,
      },
      players: [],
    }],
  });
  assert.match(report, /at least £16\.5m/);
  assert.match(report, /floor, not a cap/);
  assert.match(report, /bench may cost more/);
  assert.doesNotMatch(report, /Maximum XI spend/);
});

test("Letta contract forbids exact-target, maximum and silent fallback interpretations", () => {
  const source = readFileSync("docs/LETTA_FINAL_OPERATING_PROMPT.md", "utf8");
  assert.match(source, /It is not an exact target and it is never a maximum/);
  assert.match(source, /minimum bench spend must be sent explicitly/);
  assert.match(source, /never allow a silent £17\.0m fallback/);
  assert.match(source, /Do not claim that the endpoint lacks custom-minimum support/);
});
