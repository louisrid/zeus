import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Bench Boost endpoint proves the full range objective and refuses bad arithmetic", () => {
  const route = readFileSync("app/api/benchboost-compare/route.js", "utf8");
  for (const marker of [
    "compare_fixed_bench_boost_week_across_range",
    "maximise_range_net_xpts_with_fixed_bench_boost_week",
    "weekly_net_xpts_sum",
    "arithmetic_verified",
    "report_markdown",
    "plan_id: row.id",
  ]) assert.ok(route.includes(marker), `missing ${marker}`);
  assert.match(route, /candidate_chip_gameweeks/);
  assert.match(route, /for \(const chipGw of parsed\.candidateChipGameweeks\)/);
  assert.doesNotMatch(route, /for \(let chipGw = parsed\.gwFrom/);
  assert.match(route, /gwFrom: parsed\.gwFrom/);
  assert.match(route, /gwTo: parsed\.gwTo/);
  assert.match(route, /A build total did not equal the sum of its weekly net xPTS/);
});

test("Letta must return the backend report verbatim", () => {
  const prompt = readFileSync("docs/LETTA_FINAL_OPERATING_PROMPT.md", "utf8");
  assert.match(prompt, /reply with `report_markdown` verbatim/);
  assert.match(prompt, /Do not reconstruct, shorten, recalculate or rewrite its tables/);
  assert.match(prompt, /does not optimise each squad only for the chip gameweek/);
  assert.match(prompt, /Never output `plan_id=null`/);
});
