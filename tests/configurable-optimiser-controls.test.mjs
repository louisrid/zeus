import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("exact squad defaults to 16.5 and echoes enabled state", () => {
  const source = readFileSync("app/api/exact-squad/route.js", "utf8");
  assert.match(source, /defaultValue: 16\.5/);
  assert.match(source, /minimum_bench_spend_enabled: minimumBenchSpend > 0/);
  assert.match(source, /benchBudget: minimumBenchSpend/);
});

test("comparison requires an explicit floor and preserves hard exclusions", () => {
  const source = readFileSync("app/api/benchboost-compare/route.js", "utf8");
  assert.match(source, /required: true/);
  assert.match(source, /exclude_player_ids/);
  assert.match(source, /ignores: parsed\.excludePlayerIds/);
  assert.match(source, /benchBudget: parsed\.minimumBenchSpend/);
  assert.match(source, /minimum_bench_spend_enabled: parsed\.minimumBenchSpend > 0/);
});

test("Builder uses the enabled value for every optimiser path", () => {
  const source = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  assert.match(source, /const appliedMinimumBenchSpend = minimumBenchSpendEnabled \? benchBudget : 0/);
  assert.match(source, /minimum_bench_spend: appliedMinimumBenchSpend/);
  assert.equal((source.match(/xiBudget: RULES\.budget - appliedMinimumBenchSpend/g) || []).length, 2);
  assert.equal((source.match(/benchBudget: appliedMinimumBenchSpend/g) || []).length, 2);
  assert.doesNotMatch(source, /xiBudget: RULES\.budget - 17/);
  assert.doesNotMatch(source, /benchBudget: 17/);
});

test("Builder explains scope, state and non-destructive manual behaviour", () => {
  const source = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  assert.match(source, /AUTO-BUILD &amp; XI OPTIMISER/);
  assert.match(source, /Build Squad/);
  assert.match(source, /Fill Gaps/);
  assert.match(source, /Improve/);
  assert.match(source, /Optimise XI/);
  assert.match(source, /optimised xPTS preview/);
  assert.match(source, /Manual picks are not changed until/);
  assert.match(source, /\? "ON" : "OFF"/);
  assert.match(source, /disabled=\{!minimumBenchSpendEnabled\}/);
});

test("Letta uses the 16.5 product default and natural-language OFF behaviour", () => {
  const source = readFileSync("docs/LETTA_FINAL_OPERATING_PROMPT.md", "utf8");
  assert.match(source, /Product default: ON at £16\.5m/);
  assert.match(source, /OFF means no custom bench-spend floor/);
  assert.match(source, /Never substitute £17m unless the user explicitly requests £17m/);
  assert.match(source, /Do not ask the user for API fields, JSON, player IDs or saved-plan IDs/);
  assert.doesNotMatch(source, /every weekly four-player bench cost is at least £17m/);
});
