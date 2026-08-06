import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../app/api/benchboost-compare/route.js", import.meta.url), "utf8");
const installerPath = fileURLToPath(new URL("../scripts/install_letta_advanced_tools.py", import.meta.url));

function sources() {
  const code = String.raw`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("clean_zeus_forwarding", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(json.dumps([module.COMPARE_SOURCE, module.FRESH_SOURCE]))
`;
  const result = spawnSync("python3", ["-c", code, installerPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("backend accepts the primitive text alias", () => {
  assert.equal(route.includes("excluded_player_names_text"), true);
  assert.equal(route.includes("const textExclusions"), true);
  assert.equal(route.includes("excluded_player_names must be an array or excluded_player_names_text"), true);
});

test("strict wrappers forward only names supplied for that call", () => {
  for (const source of sources()) {
    assert.equal(source.includes("requested_exclusions = parse_names(excluded_player_names_text)"), true);
    assert.equal(source.includes("At least one hard exclusion is required"), false);
    assert.equal(source.includes("requested_exclusions and 'Hard exclusions: none' in report") || source.includes('requested_exclusions and "Hard exclusions: none" in report'), true);
    assert.match(source, /excluded_player_names_text:\s*str\s*=\s*(['"])\1/);
  }
});
