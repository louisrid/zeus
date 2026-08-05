import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderBenchBoostReport } from "../lib/benchboost-comparison.mjs";

test("exact squad API accepts a caller-selected bench minimum", () => {
  const source = readFileSync("app/api/exact-squad/route.js", "utf8");
  assert.match(source, /bench_budget/);
  assert.match(source, /benchBudget,/);
  assert.match(source, /ignores: ids\(body\?\.ignores\)/);
  assert.doesNotMatch(source, /benchBudget: 17/);
});

test("comparison API applies bench minimum and hard exclusions", () => {
  const source = readFileSync("app/api/benchboost-compare/route.js", "utf8");
  assert.match(source, /bench_budget/);
  assert.match(source, /exclude_player_ids/);
  assert.match(source, /ignores: parsed\.excludePlayerIds/);
  assert.match(source, /benchBudget: parsed\.benchBudget/);
  assert.match(source, /validateBuild\(build, parsed\.budget, parsed\.benchBudget/);
  assert.match(source, /Unknown excluded player IDs/);
  assert.doesNotMatch(source, /benchCost < 17/);
});

test("Builder uses the selected bench minimum for every optimiser path", () => {
  const source = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  assert.match(source, /MIN BENCH SPEND/);
  assert.match(source, /bench_budget: benchBudget/);
  assert.equal((source.match(/xiBudget: RULES\.budget - benchBudget/g) || []).length, 2);
  assert.equal((source.match(/\n\s+benchBudget,\n/g) || []).length >= 2, true);
  assert.match(source, /formationLocked, benchBudget\]/);
  assert.doesNotMatch(source, /xiBudget: RULES\.budget - 17/);
  assert.doesNotMatch(source, /benchBudget: 17/);
});

test("comparison report states the applied bench minimum and exclusions", () => {
  const report = renderBenchBoostReport({
    gwFrom: 1,
    gwTo: 3,
    builds: [{
      chip_gw: 1,
      solver: { status: "OPTIMAL", mip_gap: 0 },
      weekly: [],
      total: { net_xpts: 0 },
      objective: { arithmetic_verified: true, gw_from: 1, gw_to: 3 },
      constraints: { bench_budget: 16.5, xi_budget: 83.5 },
      players: [],
    }],
    excludedPlayers: [{ web_name: "O'Reilly" }, { web_name: "Anderson" }],
  });
  assert.match(report, /Minimum bench spend: £16\.5m/);
  assert.match(report, /Maximum XI spend: £83\.5m/);
  assert.match(report, /Hard exclusions: O'Reilly, Anderson/);
});

test("Letta instructions require natural-language resolution", () => {
  const source = readFileSync("docs/LETTA_FINAL_OPERATING_PROMPT.md", "utf8");
  assert.match(source, /Natural-language optimiser controls/);
  assert.match(source, /Do not ask the user for API fields, JSON, player IDs or saved-plan IDs/);
  assert.match(source, /Speak to the user in natural language/);
});
