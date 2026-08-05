import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the optimiser route exposes exact ranges and structured output without legacy xPTS fallback", () => {
  const source = readFileSync(new URL("../app/api/optimise/route.js", import.meta.url), "utf8");
  assert.match(source, /gw_from/);
  assert.match(source, /gw_to/);
  assert.match(source, /format/);
  assert.match(source, /source_mode: "external_xpts_lineup_gated"/);
  assert.match(source, /optimiseOwnedSquadRange/);
  assert.match(source, /supported_gameweeks/);
  assert.match(source, /buildExactSquadForRange/);
  assert.match(source, /solver: solverProof/);
  assert.match(source, /optimality_proven/);
  assert.doesNotMatch(source, /buildSquadForRange/);
  assert.match(source, /parsed\.mode === "squad" \|\| parsed\.mode === "benchboost"/);
  assert.match(source, /chipForGw/);
  assert.ok(!source.includes("Bench Boost theoretical selection currently requires one exact gameweek"));
  assert.ok(!source.includes("scorer.scoreOf(player)"));
  assert.ok(!source.includes("Number(one) * weeks"));
});
