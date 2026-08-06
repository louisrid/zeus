import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const installer = fs.readFileSync(new URL("../scripts/install_letta_advanced_tools.py", import.meta.url), "utf8");

test("Letta schemas use the final primitive-only contract", () => {
  assert.doesNotMatch(installer, /["']type["']:\s*\[["']number["'],\s*["']null["']\]/);
  assert.equal(installer.includes("candidate_chip_gameweeks: list"), false);
  assert.equal(installer.includes("bench_boost_gw_a: int = 1"), true);
  assert.equal(installer.includes("bench_boost_gw_b: int = 2"), true);
  assert.equal(installer.includes("goalkeeper_max_price: float = 4.5"), true);
  assert.equal(installer.includes("minimum_goalkeepers_at_or_below_price: int = 1"), true);
  assert.equal(installer.includes('"GKP": 2'), true);
  assert.equal(installer.includes('"goalkeeper_max_price": gk_cap'), true);
  assert.equal(installer.includes('"save_names": []'), true);
  assert.equal(installer.includes('"delete_plan_ids": []'), true);
});
