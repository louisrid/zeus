import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("exact squad defaults to 16.5 and echoes enabled state", () => {
  const source = readFileSync("app/api/exact-squad/route.js", "utf8");
  assert.match(source, /defaultValue: DEFAULT_MINIMUM_BENCH_SPEND/);
  assert.match(source, /minimum_bench_spend_enabled: minimumBenchSpend > 0/);
  assert.match(source, /benchBudget: minimumBenchSpend/);
});

test("comparison requires an explicit floor and preserves hard exclusions", () => {
  const source = readFileSync("app/api/benchboost-compare/route.js", "utf8");
  assert.match(source, /required: true/);
  assert.match(source, /parseExcludedPlayerIds/);
  assert.match(source, /reconcilePlayerIdsAndNames/);
  assert.match(source, /ids: parsed\.excludePlayerIds/);
  assert.match(source, /ignores: excludedPlayerIds/);
  assert.match(source, /benchBudget: parsed\.minimumBenchSpend/);
  assert.match(source, /minimum_bench_spend_enabled: parsed\.minimumBenchSpend > 0/);
});

test("Builder uses the enabled value for every optimiser path", () => {
  const source = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  assert.match(source, /const appliedMinimumBenchSpend = minimumBenchSpendEnabled \? benchBudget : 0/);
  assert.match(source, /minimum_bench_spend: appliedMinimumBenchSpend/);
  assert.equal((source.match(/xiBudget: RULES\.budget - appliedMinimumBenchSpend/g) || []).length, 1);
  /* One remaining client-side use, the read-only projected-score preview. The solve itself runs on the
     server and sends the same figure as minimum_bench_spend. */
  assert.equal((source.match(/benchBudget: appliedMinimumBenchSpend/g) || []).length, 1);
  assert.match(source, /minimum_bench_spend: appliedMinimumBenchSpend/);
  assert.doesNotMatch(source, /xiBudget: RULES\.budget - 17/);
  assert.doesNotMatch(source, /benchBudget: 17/);
});

test("Builder explains scope, state and non-destructive manual behaviour", () => {
  const source = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  assert.match(source, /AUTO-BUILD &amp; XI OPTIMISER/);
  /* One action, not three. Build Squad, Fill Gaps and Improve were the same solver behind a label that
     changed depending on how many players happened to be on the pitch, and Optimise XI only reshuffled
     the fifteen you already had, which the full solve produces anyway. */
  assert.match(source, /BUILD BEST SQUAD/, "the one action says what it does");
  assert.doesNotMatch(source, /onClick=\{doOptimise\}/, "the separate XI optimiser button is gone");
  assert.doesNotMatch(source, /doBestXI/, "the fill-gaps variant is gone");
  assert.match(source, /locks/, "locking is how a player is kept through a rebuild");
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
