import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const installerPath = fileURLToPath(new URL("../scripts/install_letta_advanced_tools.py", import.meta.url));

function contract() {
  const code = String.raw`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("clean_zeus_installer_compat", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(json.dumps({
  "sources": [module.COMPARE_SOURCE, module.FRESH_SOURCE],
  "schemas": [module.COMPARE_ARGS, module.FRESH_ARGS],
}))
`;
  const result = spawnSync("python3", ["-c", code, installerPath], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("Letta schemas use the final primitive-only contract", () => {
  const value = contract();
  for (const source of value.sources) {
    assert.doesNotMatch(source, /candidate_chip_gameweeks:\s*list/);
    assert.match(source, /(?:bench_boost_gw_a|chip_gw):\s*int\s*=\s*1/);
    assert.match(source, /goalkeeper_max_price:\s*float\s*=\s*4\.5/);
    assert.match(source, /minimum_goalkeepers_at_or_below_price:\s*int\s*=\s*1/);
    assert.equal(source.includes("'GKP': 2") || source.includes('\"GKP\": 2'), true);
    assert.equal(source.includes("'goalkeeper_max_price': gk_cap") || source.includes('\"goalkeeper_max_price\": gk_cap'), true);
    assert.equal(source.includes("'save_names': []") || source.includes('\"save_names\": []'), true);
    assert.equal(source.includes("'delete_plan_ids': []") || source.includes('\"delete_plan_ids\": []'), true);
    assert.match(source, /excluded_player_names_text:\s*str\s*=\s*(["'])\1/);
  }
  assert.match(value.sources[0], /bench_boost_gw_a:\s*int\s*=\s*1/);
  assert.match(value.sources[0], /bench_boost_gw_b:\s*int\s*=\s*2/);
  for (const schema of value.schemas) {
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.excluded_player_names_text.type, "string");
    assert.equal(schema.properties.excluded_player_names_text.default, "");
    assert.equal((schema.required || []).includes("excluded_player_names_text"), false);
  }
});
