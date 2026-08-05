import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("exact squad accepts a caller-selected minimum and echoes floor semantics", () => {
  const source = readFileSync("app/api/exact-squad/route.js", "utf8");
  assert.match(source, /parseMinimumBenchSpend/);
  assert.match(source, /minimum_bench_spend: minimumBenchSpend/);
  assert.match(source, /bench_spend_rule: "at_least"/);
  assert.match(source, /benchBudget: minimumBenchSpend/);
});

test("comparison requires the selected minimum and preserves hard exclusions", () => {
  const source = readFileSync("app/api/benchboost-compare/route.js", "utf8");
  assert.match(source, /parseMinimumBenchSpend/);
  assert.match(source, /required: true/);
  assert.match(source, /exclude_player_ids/);
  assert.match(source, /ignores: parsed\.excludePlayerIds/);
  assert.match(source, /benchBudget: parsed\.minimumBenchSpend/);
  assert.match(source, /validateBuild\(build, parsed\.budget, parsed\.minimumBenchSpend/);
  assert.match(source, /Unknown excluded player IDs/);
  assert.doesNotMatch(source, /benchCost < 17/);
});

test("Builder uses one selected minimum for every optimiser path", () => {
  const source = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  assert.match(source, /MINIMUM BENCH SPEND/);
  assert.match(source, /minimum_bench_spend: benchBudget/);
  assert.equal((source.match(/xiBudget: RULES\.budget - benchBudget/g) || []).length, 2);
  assert.equal((source.match(/\n\s+benchBudget,\n/g) || []).length >= 2, true);
  assert.match(source, /formationLocked, benchBudget\]/);
  assert.doesNotMatch(source, /xiBudget: RULES\.budget - 17/);
  assert.doesNotMatch(source, /benchBudget: 17/);
});

test("Letta instructions keep natural-language resolution and full minimum meaning", () => {
  const source = readFileSync("docs/LETTA_FINAL_OPERATING_PROMPT.md", "utf8");
  assert.match(source, /Natural-language optimiser controls/);
  assert.match(source, /Do not ask the user for API fields, JSON, player IDs or saved-plan IDs/);
  assert.match(source, /It is not an exact target and it is never a maximum/);
  assert.match(source, /Speak to the user in natural language/);
});
