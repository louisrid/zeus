import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the product contract is unambiguous across app, backend, report and Letta", () => {
  const builder = readFileSync("app/builder/BuilderClient.jsx", "utf8");
  const exact = readFileSync("app/api/exact-squad/route.js", "utf8");
  const compare = readFileSync("app/api/benchboost-compare/route.js", "utf8");
  const report = readFileSync("lib/benchboost-comparison.mjs", "utf8");
  const letta = readFileSync("docs/LETTA_FINAL_OPERATING_PROMPT.md", "utf8");

  assert.match(builder, /useState\(16\.5\)/);
  assert.match(builder, /type="checkbox"/);
  assert.match(builder, /AUTO-BUILD &amp; XI OPTIMISER/);
  assert.match(exact, /defaultValue: 16\.5/);
  assert.match(exact, /minimum_bench_spend_enabled/);
  assert.match(compare, /minimum_bench_spend_enabled/);
  assert.match(report, /control: ON/);
  assert.match(report, /control: OFF/);
  assert.match(letta, /default is the same as the Builder/);
  assert.match(letta, /Never silently use £17m/);
});
