import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const installerPath = fileURLToPath(new URL("../scripts/install_letta_advanced_tools.py", import.meta.url));
const route = fs.readFileSync(new URL("../app/api/benchboost-compare/route.js", import.meta.url), "utf8");
const optimiser = fs.readFileSync(new URL("../lib/server/exact-range-optimiser.mjs", import.meta.url), "utf8");

function contract() {
  const code = String.raw`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("clean_zeus_installer", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(json.dumps({
  "compare_source": module.COMPARE_SOURCE,
  "fresh_source": module.FRESH_SOURCE,
  "compare_schema": module.COMPARE_ARGS,
  "fresh_schema": module.FRESH_ARGS,
  "system": module.SYSTEM_CONTRACT,
  "module_names": sorted(name for name in vars(module) if "EXCLUSION" in name and "SYSTEM" not in name),
}))
`;
  const result = spawnSync("python3", ["-c", code, installerPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("strict tools have optional request-specific primitive exclusions", () => {
  const value = contract();
  for (const [source, schema] of [
    [value.compare_source, value.compare_schema],
    [value.fresh_source, value.fresh_schema],
  ]) {
    assert.equal(schema.properties.excluded_player_names_text.type, "string");
    assert.equal(schema.properties.excluded_player_names_text.default, "");
    assert.match(source, /excluded_player_names_text:\s*str\s*=\s*(['"])\1/);
    assert.equal(source.includes("At least one hard exclusion is required"), false);
    assert.equal(source.includes("requested_exclusions"), true);
    assert.equal(source.includes("'excluded_player_names': requested_exclusions") || source.includes('"excluded_player_names": requested_exclusions'), true);
  }
  assert.deepEqual(value.module_names, []);
});

test("natural-language system contract forbids permanent exclusions and stale fields", () => {
  const value = contract();
  assert.match(value.system, /No player is excluded by default/);
  assert.match(value.system, /user speaks normally/i);
  assert.match(value.system, /Never require JSON/);
  assert.match(value.system, /Do not pass internal backend fields/);
  assert.match(value.system, /without rerunning or re-optimising/);
});

test("backend and optimiser enforce exact FPL composition and goalkeeper cap", () => {
  assert.equal(route.includes("const quotas = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };"), true);
  assert.equal(route.includes("cheapGoalkeepers.length < controls.minimumGoalkeepersAtOrBelowPrice"), true);
  assert.equal(optimiser.includes("const COMPOSITION = Object.freeze({ GKP: 2, DEF: 5, MID: 5, FWD: 3 });"), true);
  assert.equal(optimiser.includes("goalkeepers_at_or_below_price"), true);
});
