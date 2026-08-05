import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("comparison accepts canonical and legacy exclusion inputs", () => {
  const source = readFileSync("app/api/benchboost-compare/route.js", "utf8");
  assert.match(source, /parseExcludedPlayerIds/);
  assert.match(source, /exclusionResult\.value/);
  assert.match(source, /exclusion_input_field/);
});

test("excluded players are checked before persistence", () => {
  const source = readFileSync("app/api/benchboost-compare/route.js", "utf8");
  assert.match(source, /excluded players appeared in the squad/);
  assert.match(source, /Hard exclusions were not preserved by every build/);
  assert.match(source, /Nothing was saved or deleted/);
  assert.match(
    source,
    /validateBuild\(build, parsed\.budget, parsed\.minimumBenchSpend, parsed\.gwFrom, parsed\.gwTo, parsed\.excludePlayerIds\)/,
  );
  const guardIndex = source.indexOf("const exclusionLeaks");
  const saveIndex = source.indexOf("saved = await saveAndVerify");
  const deleteIndex = source.indexOf("deleted = await deleteRequestedPlans");
  assert.ok(guardIndex >= 0 && saveIndex > guardIndex);
  assert.ok(deleteIndex > saveIndex);
});

test("successful responses include explicit exclusion proof", () => {
  const source = readFileSync("app/api/benchboost-compare/route.js", "utf8");
  assert.equal(
    (source.match(/exclusions_verified_absent_from_all_builds: true/g) || []).length,
    2,
  );
});

test("Letta contract uses the canonical field and rejects missing proof", () => {
  const source = readFileSync("docs/LETTA_FINAL_OPERATING_PROMPT.md", "utf8");
  assert.match(source, /Hard-exclusion safety contract/);
  assert.match(source, /send the complete list as `excluded_player_ids`/);
  assert.match(source, /Never accept an empty exclusion response/);
  assert.match(source, /none of the excluded IDs appears in any returned squad/);
});
